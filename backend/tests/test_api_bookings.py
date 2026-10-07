"""Creating, listing and cancelling bookings: every rule, refused and allowed."""

from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from app.models import User
from conftest import place_named

TZ = ZoneInfo("Asia/Jerusalem")


def local(*args) -> datetime:
    return datetime(*args, tzinfo=TZ)


MONDAY_14 = local(2026, 10, 12, 14, 0)  # the client's clock is Sunday 10:00


@pytest.fixture
def other_student(session, braude) -> User:
    user = User(institution_id=braude.id, email="other@braude.example", display_name="Other")
    session.add(user)
    session.flush()
    return user


@pytest.fixture
def room(braude):
    return place_named(braude, "EM", "EM107")


@pytest.fixture
def lab(braude):
    return place_named(braude, "M", "M206")


def book(client, place, start, end, seat_id=None):
    body = {"place_id": place.id, "starts_at": start.isoformat(), "ends_at": end.isoformat()}
    if seat_id is not None:
        body["seat_id"] = seat_id
    return client.post("/bookings", json=body)


def refused(response, status: int, code: str) -> bool:
    return (response.status_code, response.json().get("detail")) == (status, code)


HOURS_2 = timedelta(hours=2)


def test_book_a_group_room(client, room):
    response = book(client, room, MONDAY_14, MONDAY_14 + HOURS_2)
    assert response.status_code == 201
    body = response.json()
    assert (body["status"], body["source"], body["building_code"]) == ("booked", "advance", "EM")
    assert [b["id"] for b in client.get("/me/bookings").json()] == [body["id"]]


def test_booking_needs_sign_in(client, room):
    client.user = None
    assert book(client, room, MONDAY_14, MONDAY_14 + HOURS_2).status_code == 401
    assert client.get("/me/bookings").status_code == 401


def test_overlapping_booking_is_refused_back_to_back_is_fine(client, room, other_student):
    book(client, room, MONDAY_14, MONDAY_14 + HOURS_2)
    client.user = other_student
    overlap = book(client, room, MONDAY_14 + timedelta(hours=1), MONDAY_14 + timedelta(hours=3))
    assert refused(overlap, 409, "slot_taken")
    after = book(client, room, MONDAY_14 + HOURS_2, MONDAY_14 + timedelta(hours=4))
    assert after.status_code == 201


def test_book_a_lab_seat(client, lab):
    seat = lab.seats[0]
    response = book(client, lab, MONDAY_14, MONDAY_14 + HOURS_2, seat.id)
    assert response.status_code == 201
    assert response.json()["seat_label"] == "A1"


def test_lab_booking_needs_a_seat_from_that_lab(client, braude, lab):
    assert refused(book(client, lab, MONDAY_14, MONDAY_14 + HOURS_2), 400, "seat_required")
    other_seat = place_named(braude, "M", "M305").seats[0]
    response = book(client, lab, MONDAY_14, MONDAY_14 + HOURS_2, other_seat.id)
    assert refused(response, 400, "seat_not_in_place")


def test_room_booking_takes_no_seat(client, room, lab):
    response = book(client, room, MONDAY_14, MONDAY_14 + HOURS_2, lab.seats[0].id)
    assert refused(response, 400, "seat_not_in_place")


@pytest.mark.parametrize(("building", "name"), [("L", "מתחם לימוד"), ("EF", "ספרייה")])
def test_open_areas_and_library_are_not_bookable(client, braude, building, name):
    place = place_named(braude, building, name)
    assert refused(book(client, place, MONDAY_14, MONDAY_14 + HOURS_2), 409, "not_bookable")


@pytest.mark.parametrize(
    ("start", "end", "status", "code"),
    [
        (MONDAY_14 + timedelta(minutes=10), MONDAY_14 + HOURS_2, 400, "not_on_slot"),
        (MONDAY_14, MONDAY_14 + timedelta(hours=2, minutes=15), 400, "too_long"),
        (MONDAY_14, MONDAY_14, 400, "invalid_range"),
        (local(2026, 10, 11, 8, 0), local(2026, 10, 11, 9, 0), 400, "in_the_past"),
        (local(2026, 10, 15, 14, 0), local(2026, 10, 15, 16, 0), 400, "too_far_ahead"),
        (local(2026, 10, 12, 6, 0), local(2026, 10, 12, 8, 0), 409, "outside_opening_hours"),
        (local(2026, 10, 12, 19, 0), local(2026, 10, 12, 21, 0), 409, "outside_opening_hours"),
        (local(2026, 10, 16, 13, 0), local(2026, 10, 16, 15, 0), 400, "too_far_ahead"),
    ],
)
def test_booking_rules(client, room, start, end, status, code):
    assert refused(book(client, room, start, end), status, code)


def test_friday_hours_apply(client, room):
    client.clock.now = local(2026, 10, 14, 10, 0).astimezone(UTC)  # Wednesday
    friday = local(2026, 10, 16, 13, 0)
    assert refused(book(client, room, friday, friday + HOURS_2), 409, "outside_opening_hours")
    assert book(client, room, friday - timedelta(hours=1), friday + timedelta(hours=1)).status_code == 201


def test_four_days_ahead_is_the_limit(client, room):
    last_day = local(2026, 10, 15, 8, 0)  # Thursday morning, within 4 days of Sunday 10:00
    assert book(client, room, last_day, last_day + HOURS_2).status_code == 201


def test_at_most_two_upcoming_bookings(client, room, lab):
    first = book(client, room, MONDAY_14, MONDAY_14 + HOURS_2).json()
    assert book(client, lab, MONDAY_14, MONDAY_14 + HOURS_2, lab.seats[0].id).status_code == 201
    third = book(client, room, MONDAY_14 + HOURS_2, MONDAY_14 + timedelta(hours=4))
    assert refused(third, 409, "too_many_bookings")
    client.post(f"/bookings/{first['id']}/cancel")
    again = book(client, room, MONDAY_14 + HOURS_2, MONDAY_14 + timedelta(hours=4))
    assert again.status_code == 201


def test_times_without_timezone_are_rejected(client, room):
    body = {"place_id": room.id, "starts_at": "2026-10-12T14:00:00", "ends_at": "2026-10-12T16:00:00"}
    assert client.post("/bookings", json=body).status_code == 422


def test_cancel_own_booking_frees_the_slot(client, room, other_student):
    created = book(client, room, MONDAY_14, MONDAY_14 + HOURS_2).json()
    response = client.post(f"/bookings/{created['id']}/cancel")
    assert response.json()["status"] == "cancelled"
    assert client.get("/me/bookings").json() == []
    client.user = other_student
    assert book(client, room, MONDAY_14, MONDAY_14 + HOURS_2).status_code == 201


def test_cannot_cancel_someone_elses_booking(client, room, other_student):
    created = book(client, room, MONDAY_14, MONDAY_14 + HOURS_2).json()
    client.user = other_student
    assert client.post(f"/bookings/{created['id']}/cancel").status_code == 404


def test_student_of_another_institution_cannot_book(client, session, room):
    from app.seed import seed_institution

    other = seed_institution(
        session,
        {"institution": {"name": "Other", "slug": "other", "timezone": "Asia/Jerusalem"},
         "buildings": []},
    )
    outsider = User(institution_id=other.id, email="out@other.example", display_name="Out")
    session.add(outsider)
    session.flush()
    client.user = outsider
    assert refused(book(client, room, MONDAY_14, MONDAY_14 + HOURS_2), 403, "other_institution")


def test_availability_shows_busy_times_without_who(client, room, lab):
    book(client, room, MONDAY_14, MONDAY_14 + HOURS_2)
    client.user = None
    response = client.get(f"/places/{room.id}/availability", params={"date": "2026-10-12"})
    assert response.status_code == 200
    busy = response.json()["busy"]
    assert len(busy) == 1
    assert set(busy[0]) == {"seat_id", "starts_at", "ends_at"}
    assert datetime.fromisoformat(busy[0]["starts_at"]) == MONDAY_14
    other_day = client.get(f"/places/{room.id}/availability", params={"date": "2026-10-13"})
    assert other_day.json()["busy"] == []
