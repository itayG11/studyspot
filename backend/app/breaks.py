"""Going on a break (wave 19.1b).

A student in a group room or at a lab seat can step out and keep the place
for the institution's break minutes (20 unless set otherwise; 0 turns it off),
once per stay. Coming back means scanning the sign again: a tap on a phone
somewhere else would prove nothing, the same reason "still here" extends only
once. If the break runs out with no scan the stay ends (reason break_over),
its booking is completed so the room or seat is free for others, and the
webhooks hear "checkin.ended".

The rules never wait for the background sweep. is_active (app/occupancy.py)
already treats a break that ran out as over, and end_overdue_breaks is also
called where a stay is looked at or a booking is made (app/checkins.py
_expire, app/bookings.py release_no_shows); the sweep only tidies up.

Only rooms and lab seats, the places only one booking can hold. An open area
or a library counts people against a capacity: stepping out there frees a spot
by itself, and holding it would be unfair.
"""

import logging
from collections.abc import Iterable
from datetime import datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.errors import Refusal
from app.models import Booking, BookingStatus, CheckIn, CheckInEndReason, Institution, Place, PlaceKind
from app.occupancy import is_active
from app.webhooks import check_in_event

log = logging.getLogger(__name__)

BREAK_MIN_LEFT = timedelta(minutes=5)  # a break needs at least this much time left in the stay
BREAK_ENDING_AHEAD = timedelta(minutes=5)  # "your break ends soon", this long before
HOLDS_ONE_BOOKING = (PlaceKind.GROUP_ROOM, PlaceKind.COMPUTER_LAB)


def break_allowed(session: Session, row: CheckIn, now: datetime) -> bool:
    """Can this stay go on a break now? What the app shows as a button."""
    if row.ended_at is not None or row.break_started_at is not None or row.expires_at - now < BREAK_MIN_LEFT:
        return False
    place = session.get(Place, row.place_id)
    institution = session.get(Institution, row.institution_id)
    return place.kind in HOLDS_ONE_BOOKING and institution.break_minutes > 0


def start_break(session: Session, user, check_in_id: int, now: datetime) -> CheckIn:
    """Hold the student's place for the break. Someone else's stay answers
    like a missing one (404), so the API never reveals that it exists."""
    row = session.scalars(
        select(CheckIn).where(CheckIn.id == check_in_id, CheckIn.user_id == user.id, is_active(now)).with_for_update()
    ).first()
    if row is None:
        raise Refusal(404, "check_in_not_found")
    place = session.get(Place, row.place_id)
    if place.kind not in HOLDS_ONE_BOOKING:
        raise Refusal(409, "break_not_allowed")
    minutes = session.get(Institution, row.institution_id).break_minutes
    if minutes <= 0:
        raise Refusal(409, "break_disabled")
    if row.break_started_at is not None:
        raise Refusal(409, "break_used")
    if row.expires_at - now < BREAK_MIN_LEFT:
        raise Refusal(409, "break_too_late")
    row.break_started_at = now
    row.break_until = min(now + timedelta(minutes=minutes), row.expires_at)
    session.flush()
    return row


def back_from_break(row: CheckIn) -> None:
    """The student scanned the sign again: the break is over, the stay goes on."""
    row.break_until = None


def end_overdue_breaks(session: Session, now: datetime, *conditions) -> int:
    """End the stays whose break ran out, and free their bookings. `conditions`
    narrow it to one user, seat or room. One event that fails never undoes
    the release (the same rule as the sweep)."""
    ended = session.execute(
        update(CheckIn)
        .where(*conditions, CheckIn.ended_at.is_(None), CheckIn.break_until.is_not(None), CheckIn.break_until <= now)
        .values(ended_at=CheckIn.break_until, end_reason=CheckInEndReason.BREAK_OVER)
        .returning(CheckIn.place_id, CheckIn.institution_id, CheckIn.simulated, CheckIn.booking_id)
        .execution_options(synchronize_session="fetch")
    ).all()
    booking_ids = [booking_id for *_, booking_id in ended if booking_id is not None]
    if booking_ids:
        session.execute(
            update(Booking)
            .where(Booking.id.in_(booking_ids), Booking.status == BookingStatus.CHECKED_IN)
            .values(status=BookingStatus.COMPLETED)
            .execution_options(synchronize_session="fetch")
        )
    for place_id, institution_id, simulated, _ in ended:
        if simulated:
            continue
        try:
            with session.begin_nested():
                check_in_event(session, "checkin.ended", place_id, institution_id, now)
        except Exception:
            log.exception("webhook event not written; the release goes on")
    return len(ended)


def room_breaks(session: Session, place_ids: Iterable[int], now: datetime) -> dict[int, datetime]:
    """For each of these rooms, until when its student is on a break (if they are)."""
    ids = list(place_ids)
    if not ids:
        return {}
    rows = session.execute(
        select(CheckIn.place_id, CheckIn.break_until).where(
            CheckIn.place_id.in_(ids), CheckIn.break_until.is_not(None), is_active(now), ~CheckIn.simulated
        )
    ).all()
    return dict(rows)


def seat_breaks(session: Session, place_id: int, now: datetime) -> dict[int, datetime]:
    """For each seat of this lab, until when its student is on a break (if they are)."""
    rows = session.execute(
        select(CheckIn.seat_id, CheckIn.break_until).where(
            CheckIn.place_id == place_id, CheckIn.seat_id.is_not(None), CheckIn.break_until.is_not(None),
            is_active(now), ~CheckIn.simulated,
        )
    ).all()
    return dict(rows)
