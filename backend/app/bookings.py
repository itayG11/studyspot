"""Booking rules: who may book what, when, and for how long.

The rules a database cannot express (opening hours, the per-student
quota, the time grid) are checked here. The one rule that must hold
under any concurrency, "no two active bookings of the same room or seat
overlap", is left to the database's EXCLUDE constraints: this module
does not lock anything, it just turns the database's refusal into a 409.
"""

from datetime import date, datetime, time, timedelta

from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.errors import EXCLUSION_VIOLATION, Refusal, sqlstate
from app.hours import institution_zone, place_status
from app.models import (
    ACTIVE_STATUSES,
    Booking,
    BookingSource,
    BookingStatus,
    CheckIn,
    Place,
    PlaceKind,
    Seat,
    User,
    is_bookable,
)

# Product rules (agreed with the user in stage 4).
MAX_DURATION = timedelta(hours=2)  # one booking, and one renewal step
HORIZON = timedelta(days=4)  # how far ahead a booking may start
MAX_UPCOMING = 2  # active advance bookings per student
ARRIVE_EARLY = timedelta(minutes=10)  # arrival can be confirmed this early
NO_SHOW_AFTER = timedelta(minutes=15)  # no confirmation by then: released
SLOT = timedelta(minutes=15)  # bookings start and end on this grid
MIN_WALK_IN = timedelta(minutes=15)  # shortest walk-in worth giving


# --- Small helpers shared with check-in ---------------------------------------------


def same_resource(place: Place, seat_id: int | None):
    """Bookings that compete for the same room, or for the same lab seat."""
    if seat_id is None:
        return and_(Booking.place_id == place.id, Booking.seat_id.is_(None))
    return Booking.seat_id == seat_id


def holding(now: datetime):
    """Active bookings that still hold their time: not a no-show waiting to be swept."""
    return and_(
        Booking.status.in_(ACTIVE_STATUSES),
        or_(Booking.status == BookingStatus.CHECKED_IN, Booking.starts_at > now - NO_SHOW_AFTER),
    )


def release_no_shows(session: Session, now: datetime, place: Place, seat_id: int | None) -> None:
    """Lazy release for one room or seat, so a no-show never blocks a new
    booking while the background sweep has not run yet."""
    session.execute(
        update(Booking)
        .where(
            same_resource(place, seat_id),
            Booking.status == BookingStatus.BOOKED,
            Booking.starts_at <= now - NO_SHOW_AFTER,
        )
        .values(status=BookingStatus.NO_SHOW)
        .execution_options(synchronize_session="fetch")
    )


def next_booking_start(
    session: Session, place: Place, seat_id: int | None, after: datetime, now: datetime
) -> datetime | None:
    return session.scalar(
        select(func.min(Booking.starts_at)).where(
            same_resource(place, seat_id), holding(now), Booking.starts_at >= after
        )
    )


def booking_covering(
    session: Session, place: Place, seat_id: int | None, moment: datetime, now: datetime
) -> Booking | None:
    return session.scalars(
        select(Booking).where(
            same_resource(place, seat_id),
            holding(now),
            Booking.starts_at <= moment,
            Booking.ends_at > moment,
        )
    ).first()


def insert_booking(session: Session, booking: Booking) -> Booking:
    """Insert, letting the database refuse an overlap (409 slot_taken)."""
    try:
        with session.begin_nested():
            session.add(booking)
            session.flush()
    except IntegrityError as error:
        if sqlstate(error) == EXCLUSION_VIOLATION:
            raise Refusal(409, "slot_taken") from None
        raise
    return booking


def floor_to_slot(moment: datetime) -> datetime:
    """Round down to the 15-minute grid, so freed time stays bookable."""
    moment = moment.replace(second=0, microsecond=0)
    return moment - timedelta(minutes=moment.minute % 15)


# --- Creating, cancelling, renewing -------------------------------------------------


def create_booking(
    session: Session,
    user: User,
    place_id: int,
    seat_id: int | None,
    starts_at: datetime,
    ends_at: datetime,
    now: datetime,
) -> Booking:
    place = session.scalars(
        select(Place).where(Place.id == place_id).options(selectinload(Place.opening_hours))
    ).first()
    if place is None:
        raise Refusal(404, "place_not_found")
    if place.institution_id != user.institution_id:
        raise Refusal(403, "other_institution")
    if not is_bookable(place.kind):
        raise Refusal(409, "not_bookable")
    _check_seat(session, place, seat_id)
    _check_times(session, place, starts_at, ends_at, now)

    # Lock the student's row so two simultaneous requests cannot both pass
    # the quota check. (Overlaps need no lock: the database refuses them.)
    session.scalars(select(User).where(User.id == user.id).with_for_update()).one()
    upcoming = session.scalar(
        select(func.count()).select_from(Booking).where(
            Booking.user_id == user.id,
            Booking.source == BookingSource.ADVANCE,
            holding(now),
            Booking.ends_at > now,
        )
    )
    if upcoming >= MAX_UPCOMING:
        raise Refusal(409, "too_many_bookings")

    release_no_shows(session, now, place, seat_id)
    return insert_booking(
        session,
        Booking(
            institution_id=place.institution_id,
            user_id=user.id,
            place_id=place.id,
            seat_id=seat_id,
            starts_at=starts_at,
            ends_at=ends_at,
            status=BookingStatus.BOOKED,
            source=BookingSource.ADVANCE,
        ),
    )


def cancel_booking(session: Session, user: User, booking_id: int) -> Booking:
    """Only the owner, only before arrival. Anything else looks like 404."""
    booking = session.scalars(
        select(Booking)
        .where(
            Booking.id == booking_id,
            Booking.user_id == user.id,
            Booking.status == BookingStatus.BOOKED,
            Booking.source == BookingSource.ADVANCE,
        )
        .with_for_update()
    ).first()
    if booking is None:
        raise Refusal(404, "booking_not_found")
    booking.status = BookingStatus.CANCELLED
    session.flush()
    return booking


def renew(session: Session, booking: Booking, now: datetime) -> bool:
    """Give up to MAX_DURATION more from now, until closing time and the next
    booking of the same room or seat. Returns False if there is no time to add."""
    place = session.scalars(
        select(Place).where(Place.id == booking.place_id).options(selectinload(Place.opening_hours))
    ).one()
    status = place_status(session, place, now)
    if not status.is_open:
        return False
    new_end = floor_to_slot(now + MAX_DURATION)
    if status.closes_at is not None:
        new_end = min(new_end, status.closes_at)
    following = session.scalar(
        select(func.min(Booking.starts_at)).where(
            same_resource(place, booking.seat_id),
            holding(now),
            Booking.id != booking.id,
            Booking.starts_at >= booking.ends_at,
        )
    )
    if following is not None:
        new_end = min(new_end, following)
    if new_end <= booking.ends_at:
        return False
    try:
        with session.begin_nested():
            booking.ends_at = new_end
            check_in = session.scalars(
                select(CheckIn).where(CheckIn.booking_id == booking.id)
            ).first()
            if check_in is not None and check_in.ended_at is None:
                check_in.expires_at = new_end
            session.flush()  # the database re-checks the EXCLUDE constraint here
    except IntegrityError as error:
        # Someone booked the following time in the same instant: no renewal.
        if sqlstate(error) == EXCLUSION_VIOLATION:
            return False
        raise
    return True


def extend_booking(session: Session, user: User, booking_id: int, now: datetime) -> Booking:
    booking = session.scalars(
        select(Booking).where(Booking.id == booking_id, Booking.user_id == user.id).with_for_update()
    ).first()
    if booking is None:
        raise Refusal(404, "booking_not_found")
    if booking.status != BookingStatus.CHECKED_IN or not booking.starts_at <= now < booking.ends_at:
        raise Refusal(409, "not_checked_in")
    if not renew(session, booking, now):
        raise Refusal(409, "no_time_to_extend")
    return booking


def upcoming_bookings(session: Session, user: User, now: datetime) -> list[Booking]:
    return list(
        session.scalars(
            select(Booking)
            .where(Booking.user_id == user.id, holding(now), Booking.ends_at > now)
            .order_by(Booking.starts_at)
        )
    )


def busy_ranges(session: Session, place: Place, day: date, now: datetime) -> list[Booking]:
    """Bookings that hold time on this place during a local calendar day."""
    zone = institution_zone(session, place.institution_id)
    day_start = datetime.combine(day, time(0), tzinfo=zone)
    day_end = day_start + timedelta(days=1)
    return list(
        session.scalars(
            select(Booking)
            .where(
                Booking.place_id == place.id,
                holding(now),
                Booking.starts_at < day_end,
                Booking.ends_at > day_start,
            )
            .order_by(Booking.seat_id, Booking.starts_at)
        )
    )


# --- Validation ------------------------------------------------------------------------


def _check_seat(session: Session, place: Place, seat_id: int | None) -> None:
    if place.kind != PlaceKind.COMPUTER_LAB:
        if seat_id is not None:
            raise Refusal(400, "seat_not_in_place")
        return
    if seat_id is None:
        raise Refusal(400, "seat_required")
    seat = session.scalars(select(Seat.id).where(Seat.id == seat_id, Seat.place_id == place.id)).first()
    if seat is None:
        raise Refusal(400, "seat_not_in_place")


def _on_grid(moment: datetime) -> bool:
    return moment.second == 0 and moment.microsecond == 0 and moment.minute % 15 == 0


def _check_times(
    session: Session, place: Place, starts_at: datetime, ends_at: datetime, now: datetime
) -> None:
    if ends_at <= starts_at:
        raise Refusal(400, "invalid_range")
    if not (_on_grid(starts_at) and _on_grid(ends_at)):
        raise Refusal(400, "not_on_slot")
    if ends_at - starts_at > MAX_DURATION:
        raise Refusal(400, "too_long")
    # The slot that is running now may still be booked, as long as its
    # arrival window (until 15 minutes after the start) is still open.
    if starts_at + NO_SHOW_AFTER <= now:
        raise Refusal(400, "in_the_past")
    if starts_at > now + HORIZON:
        raise Refusal(400, "too_far_ahead")

    zone = institution_zone(session, place.institution_id)
    local_start = starts_at.astimezone(zone)
    local_last = (ends_at - timedelta(microseconds=1)).astimezone(zone)
    if local_start.date() != local_last.date():
        raise Refusal(409, "outside_opening_hours")
    status = place_status(session, place, starts_at)
    if not status.is_open or (status.closes_at is not None and ends_at > status.closes_at):
        raise Refusal(409, "outside_opening_hours")
