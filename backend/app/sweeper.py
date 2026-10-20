"""Background sweep: release no-shows, complete ended bookings, close
expired check-ins, count the past quarter hours (app/history.py),
delete check-ins older than 90 days, fetch real walking times when a
campus's buildings moved (app/walking.py), and send booking reminders
(app/reminders.py).

Every step is a single UPDATE whose condition is the state it fixes, so
running it twice, or in several server processes at once, does no harm.
The rules never depend on the sweep for correctness (counts filter on
time, and new bookings release no-shows themselves); it keeps the stored
statuses tidy, and stage 8 will hang notifications on it.

Usage, for a scheduled job:  python -m app.sweeper
"""

import asyncio
import logging
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.activity import Activity
from app.bookings import NO_SHOW_AFTER
from app.campus_admin import DEMO_TIMEZONE, reset_demo_if_due
from app.clock import get_now
from app.closing import delete_due as delete_closed
from app.email_codes import KEEP_FOR
from app.history import delete_old_check_ins, record_history
from app.models import (
    AuthSession,
    Booking,
    BookingStatus,
    CheckIn,
    CheckInEndReason,
    EmailSignInCode,
    Institution,
    NoticeEmail,
)
from app.notify import email_from_settings, sender_from_settings
from app.reminders import ALARM, Alarm, next_due, send_reminders
from app.seed.demo import DEMO
from app.seed.live import simulate_live
from app.waitlist import delete_past as delete_past_waits
from app.walking import matrix_from_settings, refresh_walks
from app.webhook_tester import delete_old as delete_old_test_hits
from app.webhooks import check_in_event, deliver_due, webhook_key
from app.webhooks import delete_old as delete_old_deliveries
from app.webhooks import get_client as webhook_client
from app.webhooks import next_due as next_webhook

log = logging.getLogger(__name__)

NOTICE_EMAILS_KEPT = timedelta(days=2)


@dataclass(frozen=True)
class SweepResult:
    no_shows: int
    completed: int
    expired_check_ins: int
    deleted_sessions: int = 0
    deleted_check_ins: int = 0
    deleted_codes: int = 0


def sweep(session: Session, now: datetime) -> SweepResult:
    no_shows = session.execute(
        update(Booking)
        .where(Booking.status == BookingStatus.BOOKED, Booking.starts_at <= now - NO_SHOW_AFTER)
        .values(status=BookingStatus.NO_SHOW)
    ).rowcount
    completed = session.execute(
        update(Booking)
        .where(Booking.status == BookingStatus.CHECKED_IN, Booking.ends_at <= now)
        .values(status=BookingStatus.COMPLETED)
    ).rowcount
    ended = session.execute(
        update(CheckIn)
        .where(CheckIn.ended_at.is_(None), CheckIn.expires_at <= now)
        .values(ended_at=CheckIn.expires_at, end_reason=CheckInEndReason.EXPIRED)
        .returning(CheckIn.place_id, CheckIn.institution_id, CheckIn.simulated)
    ).all()
    expired = len(ended)
    # Each real one is an event for the institution's webhooks (app/webhooks.py);
    # the demo's made-up students are not.
    for place_id, institution_id, simulated in ended:
        if not simulated:
            check_in_event(session, "checkin.ended", place_id, institution_id, now)
    # Sessions past their 7 days can never be used again (revoked ones are
    # kept until then: reuse detection needs them).
    old_sessions = session.execute(delete(AuthSession).where(AuthSession.expires_at <= now)).rowcount
    # After closing the expired ones: their end times count.
    record_history(session, now)
    # The demo campus's made-up students come and go (app/seed/live.py).
    # In a savepoint: a failure there never undoes the rest of the sweep.
    for institution in session.scalars(select(Institution).where(Institution.slug == DEMO["institution"]["slug"])):
        try:
            with session.begin_nested():
                simulate_live(session, institution, now)
        except Exception:
            log.exception("live simulation failed; the rest of the sweep goes on")
    old_check_ins = delete_old_check_ins(session, now)
    # Sign-in codes are kept a day (the privacy page says so; the daily
    # count needs that long), whether or not the address asks again.
    old_codes = session.execute(delete(EmailSignInCode).where(EmailSignInCode.created_at < now - KEEP_FOR)).rowcount
    # The email notices' daily count looks one day back (app/notify.py).
    session.execute(delete(NoticeEmail).where(NoticeEmail.sent_at < now - NOTICE_EMAILS_KEPT))
    delete_past_waits(session, now)
    delete_old_deliveries(session, now)  # the webhook log is kept a week
    delete_old_test_hits(session, now)  # the demo's tester shows the last hour
    session.flush()
    return SweepResult(
        no_shows=no_shows,
        completed=completed,
        expired_check_ins=expired,
        deleted_sessions=old_sessions,
        deleted_check_ins=old_check_ins,
        deleted_codes=old_codes,
    )


def run_once() -> SweepResult:
    from app.config import get_settings
    from app.db import SessionLocal, get_engine

    settings = get_settings()
    now = get_now()
    with SessionLocal(bind=get_engine()) as session:
        result = sweep(session, now)
        session.commit()
    if settings.demo_login_enabled:
        # Its own transaction: a failed reset never undoes the sweep above.
        with SessionLocal(bind=get_engine()) as session:
            today = now.astimezone(DEMO_TIMEZONE).date()
            removed = reset_demo_if_due(session, settings.demo_institution, today)
            session.commit()
        if removed:
            log.info("demo campus reset: %s buildings, %s places removed", *removed)
    # An institution whose closing period is over goes (app/closing.py).
    # Its own transaction: one that fails never undoes the sweep above.
    try:
        with SessionLocal(bind=get_engine()) as session:
            kept = {settings.demo_institution} | ({settings.open_sign_in_institution} - {None})
            if delete_closed(session, now, kept, settings.system_admins()):
                log.info("closed institutions deleted")
            session.commit()
    except Exception:
        log.exception("closed institutions not deleted; the next round tries again")
    # Last, after the reset: it may remove buildings. Its own session, and
    # never a reason for the sweep to fail (app/walking.py).
    try:
        with SessionLocal(bind=get_engine()) as session:
            refresh_walks(session, matrix_from_settings(settings), now)
    except Exception:
        log.exception("walking times not refreshed; the next round tries again")
    # Booking reminders, and when the next one falls due: the alarm wakes
    # the sweep for it even with no visitors (app/reminders.py).
    try:
        with SessionLocal(bind=get_engine()) as session:
            push, email = sender_from_settings(settings), email_from_settings(settings)
            send_reminders(session, push, now, email)
            # Neither: nothing would ever mark them, and a due alarm would
            # wake the database every minute.
            ALARM.settle(next_due(session, now) if push or email else None, now)
    except Exception:
        log.exception("reminders not sent; the next round tries again")
    # Webhooks due now, then the alarm for the next try (app/webhooks.py).
    # Their secrets come from the JWT secret: none set, nothing can be signed.
    if settings.jwt_secret is None:
        return result
    try:
        maker = lambda: SessionLocal(bind=get_engine())
        deliver_due(
            maker, webhook_client(), webhook_key(settings.jwt_secret_bytes()), now, settings.webhook_allow_private
        )
        with maker() as session:
            due = next_webhook(session)
        if due is not None:
            ALARM.earliest(due)
    except Exception:
        log.exception("webhooks not sent; the next round tries again")
    return result


async def sweep_safely(sweep: Callable[[], object] = run_once) -> None:
    """One round, in a worker thread. A failed round is logged, not raised."""
    try:
        result = await asyncio.to_thread(sweep)
        if isinstance(result, SweepResult) and result != SweepResult(0, 0, 0, 0):
            log.info("sweep: %s", result)
    except Exception:
        log.exception("sweep failed; retrying next round")


async def run_forever(
    interval_seconds: float, activity: Activity, sweep: Callable[[], object] = run_once, alarm: Alarm = ALARM
) -> None:
    """Started by the app's lifespan. Sweeps only while the site is in use
    (app/activity.py), so a quiet site leaves the database asleep, or when
    a reminder is due (app/reminders.py)."""
    while True:
        if activity.busy() or alarm.due(get_now()):
            await sweep_safely(sweep)
        await asyncio.sleep(interval_seconds)


if __name__ == "__main__":
    print(run_once())
