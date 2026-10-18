"""Booking reminders by push (wave 10).

- START_AHEAD before a booking starts: "your booking starts at 11:00";
- RELEASE_WARNING_AFTER its start, if the student has not checked in: "the
  place is released at 11:15" (app/bookings.py NO_SHOW_AFTER).

Each is marked on the booking before it is sent, so it goes out once at
most; the rows are locked while marked (FOR UPDATE SKIP LOCKED), so two
processes sweeping at once never take the same one. Only bookings of users with a subscribed browser
are looked at, and a reminder whose moment passed (the server was asleep)
is dropped: late, it would only confuse.

The background sweep runs only while people visit (app/activity.py), so the
database can sleep. A reminder must still go out at its time: the Alarm
holds the next one in memory and wakes the sweep for it. It is set after
every sweep (next_due), when a booking is made, and at startup.
"""

import threading
from dataclasses import dataclass
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import and_, exists, func, select
from sqlalchemy.orm import Session, selectinload

from app.bookings import NO_SHOW_AFTER
from app.models import Booking, BookingStatus, Institution, PushSubscription
from app.notify import Notice, PushSender, notify

START_AHEAD = timedelta(minutes=10)
RELEASE_WARNING_AFTER = timedelta(minutes=5)


class Alarm:
    """The time of the next reminder, shared by the sweep and the requests."""

    def __init__(self) -> None:
        self._at: datetime | None = None
        self._lock = threading.Lock()

    def set(self, at: datetime | None) -> None:
        with self._lock:
            self._at = at

    def earliest(self, at: datetime) -> None:
        with self._lock:
            if self._at is None or at < self._at:
                self._at = at

    def settle(self, at: datetime | None, now: datetime) -> None:
        """After a sweep: the next reminder from the database. An earlier
        time still ahead stays: a booking made while the sweep was reading."""
        with self._lock:
            if self._at is not None and now < self._at and (at is None or self._at < at):
                return
            self._at = at

    def due(self, now: datetime) -> bool:
        with self._lock:
            return self._at is not None and self._at <= now


ALARM = Alarm()


def _subscribed():
    return exists().where(PushSubscription.user_id == Booking.user_id)


@dataclass(frozen=True)
class _Due:
    user_id: int
    notice: Notice


def _hhmm(moment: datetime, zone: str) -> str:
    return moment.astimezone(ZoneInfo(zone)).strftime("%H:%M")


def _take_due(session: Session, now: datetime) -> list[_Due]:
    """Mark what is due now, and say what to send."""
    starting = session.scalars(
        select(Booking).where(
            Booking.status == BookingStatus.BOOKED, Booking.reminded_start_at.is_(None),
            Booking.starts_at - START_AHEAD <= now, Booking.starts_at > now, _subscribed(),
        ).options(selectinload(Booking.place)).with_for_update(skip_locked=True, of=Booking)
    ).all()
    releasing = session.scalars(
        select(Booking).where(
            Booking.status == BookingStatus.BOOKED, Booking.reminded_release_at.is_(None),
            Booking.starts_at + RELEASE_WARNING_AFTER <= now, Booking.starts_at + NO_SHOW_AFTER > now, _subscribed(),
        ).options(selectinload(Booking.place)).with_for_update(skip_locked=True, of=Booking)
    ).all()
    zones = {i.id: i.timezone for i in session.scalars(select(Institution))}
    out = []
    for b in starting:
        b.reminded_start_at = now
        at = _hhmm(b.starts_at, zones[b.institution_id])
        out.append(_Due(b.user_id, Notice("ההזמנה שלך מתחילה בקרוב", f"{b.place.name}, ב-{at}. בהגעה סורקים את השלט.", "/me")))
    for b in releasing:
        b.reminded_release_at = now
        b.reminded_start_at = b.reminded_start_at or now  # past the start: that one is no use any more
        at = _hhmm(b.starts_at + NO_SHOW_AFTER, zones[b.institution_id])
        out.append(_Due(b.user_id, Notice("עוד לא נכנסת", f"{b.place.name} ישוחרר ב-{at}, אם לא תסרוק את השלט.", "/me")))
    return out


def send_reminders(session: Session, push: PushSender | None, now: datetime) -> int:
    """Send what is due. Marked and committed first: the push services are
    called outside any transaction, and a crash after sending never repeats it."""
    if push is None:
        return 0
    due = _take_due(session, now)
    session.commit()
    sent = 0
    for item in due:
        sent += notify(session, item.user_id, item.notice, push)
    session.commit()
    return sent


def next_due(session: Session, now: datetime) -> datetime | None:
    """When the next reminder falls due, for the alarm. None: none ahead."""
    start = Booking.starts_at - START_AHEAD
    release = Booking.starts_at + RELEASE_WARNING_AFTER
    pending = and_(Booking.status == BookingStatus.BOOKED, _subscribed())
    first_start = session.scalar(
        select(func.min(start)).where(pending, Booking.reminded_start_at.is_(None), Booking.starts_at > now)
    )
    first_release = session.scalar(
        select(func.min(release)).where(
            pending, Booking.reminded_release_at.is_(None), Booking.starts_at + NO_SHOW_AFTER > now
        )
    )
    times = [t for t in (first_start, first_release) if t is not None]
    return min(times) if times else None




def prime_alarm() -> None:
    """At startup: the first reminder ahead, from the database."""
    from app.clock import get_now
    from app.db import SessionLocal, get_engine

    with SessionLocal(bind=get_engine()) as session:
        ALARM.set(next_due(session, get_now()))
