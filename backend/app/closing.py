"""Closing an institution (wave 11), by the system admin only.

Closing is not deleting at once: for CLOSING_PERIOD the institution is
hidden, nothing new starts in it (no booking, no scan, no waiting, no new
account, no admin invite), its future bookings are cancelled, and its
students are told. Then the sweep deletes it, as delete_institution does.
Until then the system admin can take it back.

The students are told within the email budget (app/notify.py): a push to a
subscribed browser, or else an email, a few each round, each one once, and
marked only when it really went out. Whoever is not reached that way sees
the banner on the institution's pages.
"""

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import delete, exists, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.errors import Refusal
from app.models import (
    Booking,
    BookingStatus,
    ClosingNotice,
    Institution,
    InstitutionLoginRule,
    Place,
    User,
    UserRole,
)
from app.models.waitlist import WaitlistEntry
from app.notify import EmailSender, Notice, PushSender, notify, reachable
from app.webhooks import booking_event

log = logging.getLogger(__name__)

CLOSING_PERIOD = timedelta(days=14)
NOTICES_PER_ROUND = 20
NOTICES_AGAIN_AFTER = timedelta(hours=6)  # the alarm, while some wait: not every minute


@dataclass(frozen=True)
class Closed:
    institution: Institution
    admin_emails: list[str]  # proved addresses only: never mail one we may not own


def _day(institution: Institution) -> str:
    return f"{institution.closes_at.astimezone(ZoneInfo(institution.timezone)):%d.%m.%Y}"


def close(db: Session, institution: Institution, now: datetime, kept_slugs: set[str], system_admins: frozenset[str]) -> Closed:
    if institution.slug in kept_slugs:
        raise Refusal(409, "institution_demo")
    if institution.closes_at is not None:
        raise Refusal(409, "institution_closing")
    inside = db.scalar(
        select(func.count()).select_from(User).where(
            User.institution_id == institution.id,
            (User.role == UserRole.SYSTEM_ADMIN) | func.lower(User.email).in_(system_admins),
        )
    )
    if inside:
        raise Refusal(409, "institution_has_system_admin")  # it would delete you
    institution.is_active = False
    institution.closes_at = now + CLOSING_PERIOD
    # Every booking not checked in yet, the one starting now too: a scan is
    # refused from now on, and its reminder would say "scan the sign".
    cancelled = db.execute(
        select(Booking, User.simulated)
        .join(User, User.id == Booking.user_id)
        .where(Booking.institution_id == institution.id, Booking.status == BookingStatus.BOOKED)
        .with_for_update(of=Booking)
    ).all()
    for booking, _ in cancelled:
        booking.status = BookingStatus.CANCELLED
    db.flush()
    for booking, simulated in cancelled:  # each is an event for the institution's webhooks
        if simulated:
            continue
        try:
            with db.begin_nested():
                booking_event(db, "booking.cancelled", booking, now, reason="institution_closing")
        except Exception:
            log.exception("webhook event not written; the closing goes on")
    # And whoever waits for a room there: the cancelled bookings would read
    # as "the room is free", and booking it is refused.
    db.execute(
        delete(WaitlistEntry).where(WaitlistEntry.place_id.in_(select(Place.id).where(Place.institution_id == institution.id)))
    )
    db.execute(delete(ClosingNotice).where(ClosingNotice.user_id.in_(select(User.id).where(User.institution_id == institution.id))))
    admins = db.scalars(
        select(User.email).where(
            User.institution_id == institution.id, User.role == UserRole.INSTITUTION_ADMIN, User.email_verified
        )
    ).all()
    db.flush()
    return Closed(institution, list(admins))


def reopen(db: Session, institution: Institution) -> None:
    """Taken back before the end. It stays hidden until its admin shows it;
    the cancelled bookings stay cancelled."""
    if institution.closes_at is None:
        raise Refusal(409, "institution_not_closing")
    institution.closes_at = None
    db.execute(delete(ClosingNotice).where(ClosingNotice.user_id.in_(select(User.id).where(User.institution_id == institution.id))))
    db.flush()


def refuse_if_closing(db: Session, institution_id: int) -> None:
    if db.scalar(select(Institution.closes_at).where(Institution.id == institution_id)) is not None:
        raise Refusal(409, "institution_closing")


def admin_email(institution: Institution) -> tuple[str, str]:
    return (
        f"{institution.name} נסגר ב-StudySpot",
        (
        f"מנהל המערכת סגר את {institution.name} ב-StudySpot.\n\n"
        f"המוסד כבר מוסתר, ואי אפשר להזמין בו או להיכנס בסריקה. ההזמנות העתידיות בוטלו, "
        f"והסטודנטים מקבלים הודעה.\n\n"
        f"ב-{_day(institution)} יימחקו המוסד, הבניינים, המקומות וכל החשבונות שבו. "
        f"עד אז מנהל המערכת יכול לבטל את הסגירה.\n"
        ),
    )


def _waiting(now: datetime):
    """Students of a closing institution not told yet, whom we can tell."""
    return (
        select(User.id, Institution.name, Institution.closes_at, Institution.timezone)
        .join(Institution, Institution.id == User.institution_id)
        .where(
            Institution.closes_at.is_not(None),
            Institution.closes_at > now,
            ~User.simulated,
            ~exists().where(ClosingNotice.user_id == User.id),
            reachable(User.id),
        )
    )


def send_notices(db: Session, push: PushSender | None, email: EmailSender | None, now: datetime) -> int:
    """A few each round, in no fixed order, so one that keeps failing does
    not hold up the rest. notify commits: each mark is kept at once."""
    if push is None and email is None:
        return 0
    sent = 0
    for user_id, name, closes_at, zone in db.execute(_waiting(now).order_by(func.random()).limit(NOTICES_PER_ROUND)).all():
        day = f"{closes_at.astimezone(ZoneInfo(zone)):%d.%m}"
        notice = Notice("המוסד שלך נסגר", f"{name} נסגר ב-StudySpot. ב-{day} החשבון והנתונים יימחקו.", "/me")
        if notify(db, user_id, notice, push, email, now):
            # Marked after sending, unlike the reminders (app/notify.py): a
            # student the budget missed today is told tomorrow. The price:
            # two rounds at once, or a crash right here, may tell one twice.
            # ON CONFLICT: the second mark is a no-op, not an error that
            # would stop the round.
            db.execute(pg_insert(ClosingNotice).values(user_id=user_id, sent_at=now).on_conflict_do_nothing())
            db.commit()
            sent += 1
    return sent


def next_due(db: Session, now: datetime) -> datetime | None:
    # Only ahead: one past its day but refused (logged) must not wake the
    # sweep every minute; any later round tries it again.
    deleting = db.scalar(select(func.min(Institution.closes_at)).where(Institution.closes_at > now))
    waiting = db.scalar(select(exists(_waiting(now).subquery())))
    again = None
    if waiting:
        # A full round a moment ago: more are likely to go now. Otherwise
        # (the budget is spent, or few are left) wait hours, not minutes.
        just_sent = db.scalar(
            select(func.count()).select_from(ClosingNotice).where(ClosingNotice.sent_at > now - timedelta(minutes=5))
        )
        again = now + (timedelta(minutes=1) if just_sent >= NOTICES_PER_ROUND else NOTICES_AGAIN_AFTER)
    times = [t for t in (deleting, again) if t is not None]
    return min(times) if times else None


def delete_due(db: Session, now: datetime, kept_slugs: set[str], system_admins: frozenset[str]) -> int:
    """Each in its own savepoint: one refused is logged and left, not a
    reason to stop the rest."""
    from app.institutions import delete_institution  # here: institutions needs accounts, which needs this

    deleted = 0
    for institution in db.scalars(select(Institution).where(Institution.closes_at <= now).with_for_update()).all():
        try:
            with db.begin_nested():
                db.execute(delete(InstitutionLoginRule).where(InstitutionLoginRule.institution_id == institution.id))
                db.expire(institution, ["login_rules"])
                institution.is_active = False
                delete_institution(db, institution, kept_slugs, system_admins)
            deleted += 1
        except Refusal as refusal:
            log.warning("closing %s: not deleted (%s)", institution.slug, refusal.code)
        except Exception:
            # Anything else in one must not keep the others from going.
            log.exception("closing %s: not deleted", institution.slug)
    db.flush()
    return deleted
