"""A student who comes to the room or seat they booked and finds someone
there can say so (wave 19.2).

The report points at the booking of the one who reports, never at the one who
stayed: it holds no name of the other person. Only a booking that is still
waiting, in its arrival window, can be reported, so a report cannot be made
about a place the student has no business at; one booking makes one report.
The institution reads the reports as a count by place and hour (wave 19.3).
"""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.bookings import ARRIVE_EARLY_IF_FREE, NO_SHOW_AFTER
from app.errors import Refusal
from app.models import Booking, BookingStatus, OccupancyReport, Place, PlaceKind, ReportStatus, User

REPORTABLE = (PlaceKind.GROUP_ROOM, PlaceKind.COMPUTER_LAB)  # the places only one booking can hold


def report_occupied(session: Session, user: User, booking_id: int, now: datetime) -> OccupancyReport:
    """Record that someone is in the student's booked place. Someone else's
    booking answers like a missing one (404), so the API never reveals it."""
    booking = session.scalars(
        select(Booking).where(Booking.id == booking_id, Booking.user_id == user.id).with_for_update()
    ).first()
    if booking is None:
        raise Refusal(404, "booking_not_found")
    place = session.get(Place, booking.place_id)
    if place.kind not in REPORTABLE:
        raise Refusal(409, "report_not_allowed")
    if booking.status != BookingStatus.BOOKED:
        raise Refusal(409, "report_not_open")  # already used, cancelled, or released
    if now < booking.starts_at - ARRIVE_EARLY_IF_FREE:
        raise Refusal(409, "report_too_early")
    if now >= booking.starts_at + NO_SHOW_AFTER:
        raise Refusal(409, "report_too_late")
    if session.scalar(select(OccupancyReport.id).where(OccupancyReport.booking_id == booking.id)) is not None:
        raise Refusal(409, "report_exists")
    row = OccupancyReport(
        institution_id=booking.institution_id, place_id=booking.place_id, seat_id=booking.seat_id,
        booking_id=booking.id, reporter_id=user.id, created_at=now, status=ReportStatus.OPEN,
    )
    session.add(row)
    session.flush()
    return row
