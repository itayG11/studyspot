"""The background sweep releases no-shows, completes ended bookings and
closes expired check-ins. Running it twice changes nothing more."""

from datetime import timedelta

from sqlalchemy import select

from app.models import Booking, BookingSource, BookingStatus, CheckIn, CheckInEndReason
from app.sweeper import sweep
from conftest import SUNDAY_10AM, place_named

MIN = timedelta(minutes=1)


def add_booking(session, user, place, start, status, seat=None):
    row = Booking(
        institution_id=user.institution_id, user_id=user.id, place_id=place.id,
        seat_id=seat.id if seat else None, starts_at=start, ends_at=start + timedelta(hours=1),
        status=status, source=BookingSource.ADVANCE,
    )
    session.add(row)
    session.flush()
    return row


def test_sweep(session, braude, student):
    room = place_named(braude, "EM", "EM107")
    lab = place_named(braude, "M", "M206")
    late = add_booking(session, student, room, SUNDAY_10AM - 20 * MIN, BookingStatus.BOOKED)
    on_time = add_booking(session, student, room, SUNDAY_10AM - 10 * MIN + timedelta(hours=2), BookingStatus.BOOKED)
    over = add_booking(session, student, lab, SUNDAY_10AM - 2 * timedelta(hours=1), BookingStatus.CHECKED_IN, lab.seats[0])
    stale = CheckIn(
        institution_id=student.institution_id, user_id=student.id, place_id=lab.id,
        seat_id=lab.seats[0].id, booking_id=over.id,
        started_at=over.starts_at, expires_at=over.ends_at,
    )
    session.add(stale)
    session.flush()

    result = sweep(session, SUNDAY_10AM)
    assert (result.no_shows, result.completed, result.expired_check_ins) == (1, 1, 1)
    session.expire_all()
    assert session.get(Booking, late.id).status == BookingStatus.NO_SHOW
    assert session.get(Booking, on_time.id).status == BookingStatus.BOOKED
    assert session.get(Booking, over.id).status == BookingStatus.COMPLETED
    assert session.scalars(select(CheckIn)).one().end_reason == CheckInEndReason.EXPIRED

    again = sweep(session, SUNDAY_10AM)
    assert (again.no_shows, again.completed, again.expired_check_ins) == (0, 0, 0)


def test_sweep_deletes_sessions_past_their_lifetime(session, braude, student):
    from app.models import AuthSession

    old = AuthSession(
        user_id=student.id, token_hash="o" * 64,
        created_at=SUNDAY_10AM - timedelta(days=8), expires_at=SUNDAY_10AM - timedelta(days=1),
    )
    alive = AuthSession(
        user_id=student.id, token_hash="a" * 64,
        created_at=SUNDAY_10AM, expires_at=SUNDAY_10AM + timedelta(days=7),
    )
    session.add_all([old, alive])
    session.flush()
    assert sweep(session, SUNDAY_10AM).deleted_sessions == 1
    assert session.scalars(select(AuthSession.token_hash)).all() == ["a" * 64]
