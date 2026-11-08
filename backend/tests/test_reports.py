"""Wave 19.2: a student who comes to the room or seat they booked and finds
someone there can say so with one tap, and at once gets somewhere else to go.

The report holds no name: it points at the booking of the one who reports,
never at the one who stayed. Only the reporter is kept, so that one booking
makes one report, and the institution reads them as a count by place and hour
(wave 19.3). Kept 90 days, like a check-in."""

from datetime import timedelta

import pytest
from conftest import SUNDAY_10AM, place_named
from factories import make_place, make_user

from app.history import KEEP_CHECK_INS, delete_old_check_ins
from app.models import (
    Booking,
    BookingSource,
    BookingStatus,
    CheckIn,
    CheckInEndReason,
    OccupancyReport,
    OpeningHours,
    PlaceKind,
    User,
)

NOW = SUNDAY_10AM


@pytest.fixture(autouse=True)
def reports_are_on(braude):
    """An institution takes reports only when it has chosen that (wave 19.3, app/policy.py)."""
    braude.overstay_policy = "reports"


@pytest.fixture
def other(session, braude) -> User:
    return make_user(session, braude, "other@braude.example")


def lab_of(braude, name="M206"):
    return next(p for b in braude.buildings for p in b.places if p.name == name)


def booked(session, braude, user, place, *, seat=None, starts=NOW + timedelta(minutes=5), status=BookingStatus.BOOKED):
    row = Booking(
        institution_id=braude.id, user_id=user.id, place_id=place.id, seat_id=seat.id if seat else None,
        starts_at=starts, ends_at=starts + timedelta(hours=1), status=status, source=BookingSource.ADVANCE,
    )
    session.add(row)
    session.flush()
    return row


def report(client, booking):
    return client.post(f"/bookings/{booking.id}/report-occupied")


def open_room(session, braude, building_code="EM", name="EM-extra"):
    """Another group room that is open when EM107 is."""
    building = next(b for b in braude.buildings if b.code == building_code)
    room = make_place(session, building, kind=PlaceKind.GROUP_ROOM, name=name, capacity=6)
    for hours in place_named(braude, "EM", "EM107").opening_hours:
        session.add(OpeningHours(place_id=room.id, weekday=hours.weekday, opens=hours.opens, closes=hours.closes))
    session.flush()
    session.refresh(room)
    return room


# --- Who may report, and when ----------------------------------------------------------------


def test_a_student_who_arrives_at_their_room_can_report_it_taken(client, session, braude, student):
    room = place_named(braude, "EM", "EM107")
    body = report(client, booked(session, braude, student, room)).json()
    assert body["reported"] is True and isinstance(body["alternatives"], list)
    row = session.query(OccupancyReport).one()
    assert (row.place_id, row.seat_id, row.reporter_id, row.status) == (room.id, None, student.id, "open")
    assert row.resolution is None and row.created_at == NOW


def test_a_seat_report_remembers_the_seat(client, session, braude, student):
    lab = lab_of(braude)
    report(client, booked(session, braude, student, lab, seat=lab.seats[0]))
    assert session.query(OccupancyReport).one().seat_id == lab.seats[0].id


def test_the_window_opens_thirty_minutes_before_and_closes_fifteen_after_the_start(client, session, braude, student):
    room = place_named(braude, "EM", "EM107")
    far = booked(session, braude, student, room, starts=NOW + timedelta(minutes=31))
    assert (report(client, far).status_code, report(client, far).json()) == (409, {"detail": "report_too_early"})
    client.clock.now = NOW + timedelta(minutes=1)  # exactly thirty minutes to go
    assert report(client, far).status_code == 200


def test_a_booking_whose_arrival_window_has_closed_cannot_be_reported(client, session, braude, student):
    room = place_named(braude, "EM", "EM107")
    late = booked(session, braude, student, room, starts=NOW - timedelta(minutes=15))
    response = report(client, late)
    assert (response.status_code, response.json()) == (409, {"detail": "report_too_late"})


@pytest.mark.parametrize("status", [BookingStatus.CHECKED_IN, BookingStatus.CANCELLED, BookingStatus.NO_SHOW])
def test_only_a_booking_still_waiting_to_be_used_can_be_reported(client, session, braude, student, status):
    room = place_named(braude, "EM", "EM107")
    response = report(client, booked(session, braude, student, room, status=status))
    assert (response.status_code, response.json()) == (409, {"detail": "report_not_open"})


def test_someone_elses_booking_answers_like_a_missing_one(client, session, braude, student, other):
    room = place_named(braude, "EM", "EM107")
    theirs = booked(session, braude, other, room)
    assert report(client, theirs).status_code == 404
    assert report(client, type("B", (), {"id": 999999})).status_code == 404
    assert session.query(OccupancyReport).count() == 0


def test_a_booking_can_be_reported_once(client, session, braude, student):
    booking = booked(session, braude, student, place_named(braude, "EM", "EM107"))
    assert report(client, booking).status_code == 200
    again = report(client, booking)
    assert (again.status_code, again.json()) == (409, {"detail": "report_exists"})
    assert session.query(OccupancyReport).count() == 1


def test_a_walk_in_place_cannot_be_reported(client, session, braude, student):
    area = place_named(braude, "L", "מתחם לימוד")
    response = report(client, booked(session, braude, student, area))
    assert (response.status_code, response.json()) == (409, {"detail": "report_not_allowed"})


def test_five_reports_an_hour_is_the_limit(client, session, braude, student):
    room = place_named(braude, "EM", "EM107")
    codes = []
    for i in range(6):
        starts = NOW + timedelta(minutes=5)
        row = Booking(
            institution_id=braude.id, user_id=student.id, place_id=room.id, starts_at=starts + timedelta(days=i + 1),
            ends_at=starts + timedelta(days=i + 1, hours=1), status=BookingStatus.BOOKED, source=BookingSource.ADVANCE,
        )
        session.add(row)
        session.flush()
        client.clock.now = row.starts_at - timedelta(minutes=5)
        codes.append(report(client, row).status_code)
    assert codes[:5] == [200] * 5 and codes[5] == 429


# --- Somewhere else to go --------------------------------------------------------------------


def test_a_free_room_is_offered_and_never_the_room_itself(client, session, braude, student):
    room, spare = place_named(braude, "EM", "EM107"), open_room(session, braude)
    alternatives = report(client, booked(session, braude, student, room)).json()["alternatives"]
    assert [a["place_id"] for a in alternatives] == [spare.id]
    assert alternatives[0]["place_name"] == "EM-extra" and alternatives[0]["building_code"] == "EM"
    assert alternatives[0]["walk_minutes"] >= 1


def test_a_room_that_is_busy_during_the_booking_is_not_offered(client, session, braude, student, other):
    room, spare = place_named(braude, "EM", "EM107"), open_room(session, braude)
    booked(session, braude, other, spare, starts=NOW + timedelta(minutes=30))  # inside the hour the student booked
    assert report(client, booked(session, braude, student, room)).json()["alternatives"] == []


def test_a_room_that_may_still_be_taken_or_is_on_a_break_is_not_offered(client, session, braude, student, other):
    room, spare = place_named(braude, "EM", "EM107"), open_room(session, braude)
    # Its last stay ran out two minutes ago, and the student did not leave by themselves.
    ended = NOW - timedelta(minutes=2)
    gone = booked(session, braude, other, spare, starts=ended - timedelta(hours=1), status=BookingStatus.COMPLETED)
    session.add(CheckIn(
        institution_id=braude.id, user_id=other.id, place_id=spare.id, booking_id=gone.id,
        started_at=ended - timedelta(hours=1), expires_at=ended, ended_at=ended, end_reason=CheckInEndReason.EXPIRED,
    ))
    session.flush()
    assert report(client, booked(session, braude, student, room)).json()["alternatives"] == []


def test_the_nearest_come_first_and_there_are_at_most_three(client, session, braude, student):
    room = place_named(braude, "EM", "EM107")
    for i in range(4):
        open_room(session, braude, name=f"EM-extra-{i}")
    alternatives = report(client, booked(session, braude, student, room)).json()["alternatives"]
    assert len(alternatives) == 3
    assert [a["walk_minutes"] for a in alternatives] == sorted(a["walk_minutes"] for a in alternatives)


def test_for_a_seat_other_seats_of_the_same_lab_come_first(client, session, braude, student, other):
    lab = lab_of(braude)
    mine, taken = lab.seats[0], lab.seats[1]
    booked(session, braude, other, lab, seat=taken, starts=NOW + timedelta(minutes=5))  # also busy in the hour
    alternatives = report(client, booked(session, braude, student, lab, seat=mine)).json()["alternatives"]
    assert alternatives[0]["place_id"] == lab.id and alternatives[0]["seat_label"] is not None
    assert alternatives[0]["seat_id"] not in (mine.id, taken.id)
    assert len(alternatives) <= 3


def test_other_labs_are_offered_when_the_lab_has_no_other_free_seat(client, session, braude, student, other):
    lab = lab_of(braude, "EM212")  # two rows by five
    mine = lab.seats[0]
    for i, seat in enumerate(lab.seats[1:]):
        booked(session, braude, make_user(session, braude, f"u{i}@braude.example"), lab, seat=seat)
    alternatives = report(client, booked(session, braude, student, lab, seat=mine)).json()["alternatives"]
    assert alternatives and all(a["place_id"] != lab.id for a in alternatives)


def test_nothing_in_the_answer_says_who_was_there_or_who_reported(client, session, braude, student):
    body = report(client, booked(session, braude, student, place_named(braude, "EM", "EM107"))).json()
    assert set(body) == {"reported", "alternatives"}
    assert "student" not in str(body) and str(student.id) not in str({k: v for k, v in body.items() if k != "alternatives"})


# --- Keeping it ninety days ------------------------------------------------------------------


def test_a_report_is_deleted_after_ninety_days(client, session, braude, student):
    report(client, booked(session, braude, student, place_named(braude, "EM", "EM107")))
    delete_old_check_ins(session, NOW + KEEP_CHECK_INS - timedelta(days=1))
    assert session.query(OccupancyReport).count() == 1
    delete_old_check_ins(session, NOW + KEEP_CHECK_INS + timedelta(days=1))
    assert session.query(OccupancyReport).count() == 0


def test_deleting_the_student_deletes_their_reports(client, session, braude, student):
    report(client, booked(session, braude, student, place_named(braude, "EM", "EM107")))
    session.delete(student)
    session.flush()
    assert session.query(OccupancyReport).count() == 0
