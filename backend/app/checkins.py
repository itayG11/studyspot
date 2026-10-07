"""Check-in and check-out rules.

Each kind of place has its own path:
- open areas and the library: count people against capacity;
- group rooms: scanning confirms the student's booking;
- computer labs: scanning confirms a seat booking, or creates a walk-in
  booking for a free seat, so one database constraint guards every seat.

Everything happens in the caller's transaction. The place's row is locked
(SELECT ... FOR UPDATE) first, so two students who scan the last free spot
of an open area at the same moment are handled one after the other.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from sqlalchemy import select, update
from sqlalchemy.orm import Session, selectinload

from app.bookings import (
    ARRIVE_EARLY,
    MAX_DURATION,
    MIN_WALK_IN,
    NO_SHOW_AFTER,
    booking_covering,
    floor_to_slot,
    insert_booking,
    next_booking_start,
    release_no_shows,
    renew,
)
from app.codes import InvalidCode, read_code
from app.errors import Refusal
from app.hours import place_status
from app.models import (
    Booking,
    BookingSource,
    BookingStatus,
    CheckIn,
    CheckInEndReason,
    Place,
    PlaceKind,
    Seat,
    User,
)
from app.occupancy import is_active, occupied_by_place

CHECK_IN_DURATION = MAX_DURATION

# The name used since stage 3.
CheckInError = Refusal

CutShortBy = Literal["booking", "closing"]


@dataclass(frozen=True)
class CheckInResult:
    check_in: CheckIn
    created: bool  # False when the student re-scanned the place they are already in
    # Why a walk-in got less than the full time, so the app can warn the student.
    cut_short_by: CutShortBy | None = None


def check_in(
    session: Session,
    user: User,
    code: str,
    seat_id: int | None,
    now: datetime,
    secret: bytes,
) -> CheckInResult:
    place = _place_from_code(session, code, secret)
    if place.institution_id != user.institution_id:
        raise Refusal(403, "other_institution")

    _expire(session, CheckIn.user_id == user.id, now)
    current = session.scalars(
        select(CheckIn).where(CheckIn.user_id == user.id, CheckIn.ended_at.is_(None))
    ).first()

    if place.kind == PlaceKind.GROUP_ROOM:
        return _room_check_in(session, user, place, current, now)
    if place.kind == PlaceKind.COMPUTER_LAB:
        return _lab_check_in(session, user, place, seat_id, current, now)
    return _counted_check_in(session, user, place, seat_id, current, now)


def check_out(session: Session, user: User, check_in_id: int, now: datetime) -> CheckIn:
    """End the user's own open check-in, and the booking it confirmed.

    Someone else's check-in answers exactly like a missing one (404), so
    the API never reveals that it exists.
    """
    row = session.scalars(
        select(CheckIn)
        .where(CheckIn.id == check_in_id, CheckIn.user_id == user.id, CheckIn.ended_at.is_(None))
        .with_for_update()
    ).first()
    if row is None:
        raise Refusal(404, "check_in_not_found")
    if row.expires_at <= now:
        row.ended_at, row.end_reason = row.expires_at, CheckInEndReason.EXPIRED
    else:
        row.ended_at, row.end_reason = now, CheckInEndReason.CHECKOUT
    _complete_booking(session, row)
    session.flush()
    return row


def current_check_in(session: Session, user: User, now: datetime) -> CheckIn | None:
    return session.scalars(
        select(CheckIn).where(CheckIn.user_id == user.id, is_active(now))
    ).first()


# --- One path per kind of place --------------------------------------------------------


def _counted_check_in(session, user, place, seat_id, current, now) -> CheckInResult:
    if seat_id is not None:
        raise Refusal(400, "seat_not_in_place")
    closes_at = _closing_time_if_open(session, place, now)
    expires_at = _capped(now + CHECK_IN_DURATION, closes_at)
    if current is not None and current.place_id == place.id:
        # Scanning the same place again means "I'm still here": extend.
        current.expires_at = max(current.expires_at, expires_at)
        session.flush()
        return CheckInResult(current, created=False)

    occupied = occupied_by_place(session, [place.id], now).get(place.id, 0)
    if occupied >= place.capacity:
        raise Refusal(409, "place_full")
    _end_current(session, current, now)
    return CheckInResult(_new_check_in(session, user, place, None, None, now, expires_at), True)


def _room_check_in(session, user, place, current, now) -> CheckInResult:
    if current is not None and current.place_id == place.id:
        return CheckInResult(current, created=False)
    booking = _arriving_booking(session, user, place, now)
    if booking is None:
        raise Refusal(409, "no_booking_now")
    return _confirm(session, user, place, booking, current, now)


def _lab_check_in(session, user, place, seat_id, current, now) -> CheckInResult:
    booking = _arriving_booking(session, user, place, now)
    if booking is not None:
        if seat_id is not None and seat_id != booking.seat_id:
            raise Refusal(409, "booked_other_seat")
        return _confirm(session, user, place, booking, current, now)

    # Walk-in: the student picks a free seat without a booking.
    seat = _seat_for(session, place, seat_id)
    if current is not None and current.place_id == place.id and current.seat_id == seat.id:
        if current.booking_id is not None:
            renew(session, session.get(Booking, current.booking_id), now)
        return CheckInResult(current, created=False)

    closes_at = _closing_time_if_open(session, place, now)
    _expire(session, CheckIn.seat_id == seat.id, now)
    if _seat_is_taken(session, seat, now):
        raise Refusal(409, "seat_taken")
    release_no_shows(session, now, place, seat.id)
    if booking_covering(session, place, seat.id, now, now) is not None:
        raise Refusal(409, "seat_booked")  # its owner may still arrive

    ends_at, cut_short_by = floor_to_slot(now + CHECK_IN_DURATION), None
    if closes_at is not None and closes_at < ends_at:
        ends_at, cut_short_by = closes_at, "closing"
    following = next_booking_start(session, place, seat.id, now, now)
    if following is not None and following < ends_at:
        ends_at, cut_short_by = following, "booking"
    if ends_at - now < MIN_WALK_IN:
        raise Refusal(409, "seat_booked_soon" if cut_short_by == "booking" else "place_closed")

    _end_current(session, current, now)
    walk_in = insert_booking(
        session,
        Booking(
            institution_id=place.institution_id,
            user_id=user.id,
            place_id=place.id,
            seat_id=seat.id,
            starts_at=now,
            ends_at=ends_at,
            status=BookingStatus.CHECKED_IN,
            source=BookingSource.WALK_IN,
        ),
    )
    row = _new_check_in(session, user, place, seat, walk_in, now, ends_at)
    return CheckInResult(row, created=True, cut_short_by=cut_short_by)


# --- Steps -------------------------------------------------------------------------------


def _confirm(session, user, place, booking: Booking, current, now) -> CheckInResult:
    """Turn an arriving booking into a check-in that lasts until the booking ends."""
    seat = session.get(Seat, booking.seat_id) if booking.seat_id else None
    if seat is not None:
        # Arriving early: the previous student may still have the seat until
        # this booking starts. Free it if their time is over; otherwise wait.
        _expire(session, CheckIn.seat_id == seat.id, now)
        if _seat_is_taken(session, seat, now) and not (
            current is not None and current.seat_id == seat.id
        ):
            raise Refusal(409, "seat_still_in_use")
    _end_current(session, current, now)
    booking.status = BookingStatus.CHECKED_IN
    row = _new_check_in(session, user, place, seat, booking, now, booking.ends_at)
    return CheckInResult(row, created=True)


def _arriving_booking(session: Session, user: User, place: Place, now: datetime) -> Booking | None:
    """The student's booking here whose arrival window is open: from 10
    minutes before the start until 15 minutes after it."""
    return session.scalars(
        select(Booking)
        .where(
            Booking.user_id == user.id,
            Booking.place_id == place.id,
            Booking.status == BookingStatus.BOOKED,
            Booking.starts_at - ARRIVE_EARLY <= now,
            Booking.starts_at + NO_SHOW_AFTER > now,
        )
        .with_for_update()
    ).first()


def _new_check_in(session, user, place, seat, booking, now, expires_at) -> CheckIn:
    row = CheckIn(
        institution_id=place.institution_id,
        user_id=user.id,
        place_id=place.id,
        seat_id=seat.id if seat else None,
        booking_id=booking.id if booking else None,
        started_at=now,
        expires_at=expires_at,
    )
    session.add(row)
    session.flush()
    return row


def _end_current(session: Session, current: CheckIn | None, now: datetime) -> None:
    """The student moves: the previous check-in (and its booking) ends now."""
    if current is None:
        return
    current.ended_at = now
    current.end_reason = CheckInEndReason.MOVED
    _complete_booking(session, current)
    session.flush()  # free the "one open check-in per user" slot first


def _complete_booking(session: Session, row: CheckIn) -> None:
    """Leaving early frees the rest of the booked time for others."""
    if row.booking_id is None:
        return
    booking = session.get(Booking, row.booking_id)
    if booking is not None and booking.status == BookingStatus.CHECKED_IN:
        booking.status = BookingStatus.COMPLETED


def _capped(moment: datetime, closes_at: datetime | None) -> datetime:
    return min(moment, closes_at) if closes_at is not None else moment


def _place_from_code(session: Session, code: str, secret: bytes) -> Place:
    try:
        claim = read_code(code, secret)
    except InvalidCode:
        raise Refusal(400, "invalid_code") from None
    place = session.scalars(
        select(Place)
        .where(Place.id == claim.place_id)
        .options(selectinload(Place.opening_hours))
        .with_for_update(of=Place)
    ).first()
    # A revoked code (old version) is treated exactly like a forged one.
    if place is None or place.code_version != claim.version:
        raise Refusal(400, "invalid_code")
    return place


def _closing_time_if_open(session: Session, place: Place, now: datetime) -> datetime | None:
    """Raise if the place is closed; otherwise return when it closes (None: open all day)."""
    status = place_status(session, place, now)
    if not status.is_open:
        raise Refusal(409, "place_closed")
    return status.closes_at


def _seat_for(session: Session, place: Place, seat_id: int | None) -> Seat:
    if seat_id is None:
        raise Refusal(400, "seat_required")
    seat = session.scalars(
        select(Seat).where(Seat.id == seat_id, Seat.place_id == place.id)
    ).first()
    if seat is None:
        raise Refusal(400, "seat_not_in_place")
    return seat


def _seat_is_taken(session: Session, seat: Seat, now: datetime) -> bool:
    return (
        session.scalar(select(CheckIn.id).where(CheckIn.seat_id == seat.id, is_active(now)))
        is not None
    )


def _expire(session: Session, which, now: datetime) -> None:
    """Lazy release: end expired open check-ins, so the partial unique
    indexes ("one open check-in per user / per seat") stop counting them."""
    session.execute(
        update(CheckIn)
        .where(which, CheckIn.ended_at.is_(None), CheckIn.expires_at <= now)
        .values(ended_at=CheckIn.expires_at, end_reason=CheckInEndReason.EXPIRED)
        .execution_options(synchronize_session="fetch")
    )
