"""The database itself refuses overlapping bookings (exclusion constraints)."""

from datetime import UTC, datetime, timedelta

import pytest
from factories import assert_rejected, make_building, make_institution, make_place, make_user
from sqlalchemy.orm import Session

from app.models import Booking, BookingSource, BookingStatus, PlaceKind, Seat

T14 = datetime(2026, 10, 12, 11, 0, tzinfo=UTC)  # 14:00 in Karmiel
HOUR = timedelta(hours=1)


@pytest.fixture
def campus(session: Session):
    institution = make_institution(session)
    building = make_building(session, institution)
    room = make_place(session, building, kind=PlaceKind.GROUP_ROOM, name="Room", capacity=6)
    lab = make_place(
        session, building, kind=PlaceKind.COMPUTER_LAB, name="Lab",
        capacity=2, lab_rows=1, lab_cols=2,
    )
    seats = [Seat(place_id=lab.id, row=1, col=c, label=f"A{c}") for c in (1, 2)]
    session.add_all(seats)
    session.flush()
    users = [make_user(session, institution, f"u{i}@example.com") for i in range(3)]
    return institution, room, lab, seats, users


def book(session: Session, user, place, start, end, seat=None, **kw) -> Booking:
    row = Booking(
        institution_id=kw.pop("institution_id", user.institution_id),
        user_id=user.id,
        place_id=place.id,
        seat_id=seat.id if seat else None,
        starts_at=start,
        ends_at=end,
        status=kw.pop("status", BookingStatus.BOOKED),
        source=kw.pop("source", BookingSource.ADVANCE),
    )
    session.add(row)
    session.flush()
    return row


def test_overlapping_room_bookings_are_refused(session: Session, campus):
    _, room, _, _, (a, b, _) = campus
    book(session, a, room, T14, T14 + 2 * HOUR)
    assert_rejected(
        session, lambda: book(session, b, room, T14 + HOUR, T14 + 3 * HOUR),
        "ex_bookings_room_overlap",
    )


def test_back_to_back_bookings_are_allowed(session: Session, campus):
    """The range is half-open: [14:00, 16:00) and [16:00, 18:00) do not touch."""
    _, room, _, _, (a, b, _) = campus
    book(session, a, room, T14, T14 + 2 * HOUR)
    book(session, b, room, T14 + 2 * HOUR, T14 + 4 * HOUR)


@pytest.mark.parametrize(
    "status", [BookingStatus.CANCELLED, BookingStatus.NO_SHOW, BookingStatus.COMPLETED]
)
def test_finished_bookings_do_not_block(session: Session, campus, status):
    _, room, _, _, (a, b, _) = campus
    book(session, a, room, T14, T14 + 2 * HOUR, status=status)
    book(session, b, room, T14, T14 + 2 * HOUR)


def test_checked_in_booking_still_blocks(session: Session, campus):
    _, room, _, _, (a, b, _) = campus
    book(session, a, room, T14, T14 + 2 * HOUR, status=BookingStatus.CHECKED_IN)
    assert_rejected(
        session, lambda: book(session, b, room, T14, T14 + HOUR), "ex_bookings_room_overlap"
    )


def test_overlapping_seat_bookings_are_refused(session: Session, campus):
    _, _, lab, (seat1, _), (a, b, _) = campus
    book(session, a, lab, T14, T14 + 2 * HOUR, seat1)
    assert_rejected(
        session,
        lambda: book(session, b, lab, T14 + HOUR, T14 + 2 * HOUR, seat1, source=BookingSource.WALK_IN),
        "ex_bookings_seat_overlap",
    )


def test_different_seats_at_the_same_time_are_allowed(session: Session, campus):
    _, _, lab, (seat1, seat2), (a, b, _) = campus
    book(session, a, lab, T14, T14 + 2 * HOUR, seat1)
    book(session, b, lab, T14, T14 + 2 * HOUR, seat2)


def test_booking_must_end_after_it_starts(session: Session, campus):
    _, room, _, _, (a, _, _) = campus
    assert_rejected(session, lambda: book(session, a, room, T14, T14), "ck_bookings_ends_after_start")


def test_booking_cannot_cross_institutions(session: Session, campus):
    _, room, _, _, _ = campus
    outsider = make_user(session, make_institution(session, "elsewhere"), "out@example.com")
    assert_rejected(session, lambda: book(session, outsider, room, T14, T14 + HOUR), "fk_bookings_place")


def test_seat_must_belong_to_the_booked_place(session: Session, campus):
    _, room, _, (seat1, _), (a, _, _) = campus
    assert_rejected(session, lambda: book(session, a, room, T14, T14 + HOUR, seat1), "fk_bookings_seat")
