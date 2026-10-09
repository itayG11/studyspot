"""Background sweep: release no-shows, complete ended bookings, close
expired check-ins.

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
from datetime import datetime

from sqlalchemy import delete, update
from sqlalchemy.orm import Session

from app.activity import Activity
from app.bookings import NO_SHOW_AFTER
from app.campus_admin import DEMO_TIMEZONE, reset_demo_if_due
from app.models import AuthSession, Booking, BookingStatus, CheckIn, CheckInEndReason

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class SweepResult:
    no_shows: int
    completed: int
    expired_check_ins: int
    deleted_sessions: int = 0


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
    expired = session.execute(
        update(CheckIn)
        .where(CheckIn.ended_at.is_(None), CheckIn.expires_at <= now)
        .values(ended_at=CheckIn.expires_at, end_reason=CheckInEndReason.EXPIRED)
    ).rowcount
    # Sessions past their 7 days can never be used again (revoked ones are
    # kept until then: reuse detection needs them).
    old_sessions = session.execute(delete(AuthSession).where(AuthSession.expires_at <= now)).rowcount
    session.flush()
    return SweepResult(
        no_shows=no_shows,
        completed=completed,
        expired_check_ins=expired,
        deleted_sessions=old_sessions,
    )


def run_once() -> SweepResult:
    from app.clock import get_now
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
    return result


async def sweep_safely(sweep: Callable[[], object] = run_once) -> None:
    """One round, in a worker thread. A failed round is logged, not raised."""
    try:
        result = await asyncio.to_thread(sweep)
        if isinstance(result, SweepResult) and result != SweepResult(0, 0, 0, 0):
            log.info("sweep: %s", result)
    except Exception:
        log.exception("sweep failed; retrying next round")


async def run_forever(interval_seconds: float, activity: Activity, sweep: Callable[[], object] = run_once) -> None:
    """Started by the app's lifespan. Sweeps only while the site is in use
    (app/activity.py), so a quiet site leaves the database asleep."""
    while True:
        if activity.busy():
            await sweep_safely(sweep)
        await asyncio.sleep(interval_seconds)


if __name__ == "__main__":
    print(run_once())
