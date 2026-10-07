"""Arriving for a booking, walk-in lab seats around bookings, renewal and no-shows."""

from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from conftest import SUNDAY_10AM, code_for, place_named

from app.models import User

TZ = ZoneInfo("Asia/Jerusalem")
MIN = timedelta(minutes=1)
HOUR = timedelta(hours=1)


def local(*args) -> datetime:
    return datetime(*args, tzinfo=TZ)


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
    response = client.post("/bookings", json=body)
    assert response.status_code == 201, response.json()
    return response.json()


def scan(client, place, seat_id=None):
    body = {"code": code_for(place)}
    if seat_id is not None:
        body["seat_id"] = seat_id
    return client.post("/check-ins", json=body)


def at(client, moment: datetime):
    client.clock.now = moment.astimezone(UTC)


def detail(response) -> str | None:
    return response.json().get("detail")


ROOM_START = local(2026, 10, 11, 14, 0)  # Sunday 14:00, two hours


@pytest.fixture
def room_booking(client, room):
    return book(client, room, ROOM_START, ROOM_START + 2 * HOUR)


# --- Group rooms ------------------------------------------------------------------


def test_room_without_booking_cannot_be_entered(client, room):
    response = scan(client, room)
    assert (response.status_code, detail(response)) == (409, "no_booking_now")


def test_arrival_window_opens_ten_minutes_early(client, room, room_booking):
    at(client, ROOM_START - 11 * MIN)
    assert detail(scan(client, room)) == "no_booking_now"
    at(client, ROOM_START - 10 * MIN)
    response = scan(client, room)
    assert response.status_code == 201
    assert datetime.fromisoformat(response.json()["expires_at"]) == ROOM_START + 2 * HOUR
    assert client.get("/me/bookings").json()[0]["status"] == "checked_in"


def test_arrival_window_closes_fifteen_minutes_after_the_start(client, room, room_booking):
    at(client, ROOM_START + 14 * MIN)
    assert scan(client, room).status_code == 201


def test_no_show_loses_the_room(client, room, room_booking, other_student):
    at(client, ROOM_START + 15 * MIN)
    assert detail(scan(client, room)) == "no_booking_now"
    client.user = other_student
    book(client, room, ROOM_START + 15 * MIN, ROOM_START + 2 * HOUR)  # the room is free again


def test_checking_out_frees_the_rest_of_the_booking(client, room, room_booking, other_student):
    at(client, ROOM_START)
    check_in = scan(client, room).json()
    at(client, ROOM_START + HOUR)
    client.post(f"/check-ins/{check_in['id']}/checkout")
    client.user = other_student
    book(client, room, ROOM_START + HOUR, ROOM_START + 2 * HOUR)


# --- Renewal ----------------------------------------------------------------------


def test_renew_when_the_next_slot_is_free(client, room, room_booking):
    at(client, ROOM_START)
    scan(client, room)
    at(client, ROOM_START + 90 * MIN)
    response = client.post(f"/bookings/{room_booking['id']}/extend")
    assert response.status_code == 200
    new_end = datetime.fromisoformat(response.json()["ends_at"])
    assert new_end == ROOM_START + 90 * MIN + 2 * HOUR
    assert datetime.fromisoformat(client.get("/me/check-in").json()["expires_at"]) == new_end


def test_renewal_is_blocked_by_the_next_booking(client, room, room_booking, other_student, student):
    at(client, ROOM_START)
    scan(client, room)
    client.user = other_student
    book(client, room, ROOM_START + 2 * HOUR, ROOM_START + 3 * HOUR)
    client.user = student
    at(client, ROOM_START + 90 * MIN)
    response = client.post(f"/bookings/{room_booking['id']}/extend")
    assert (response.status_code, detail(response)) == (409, "no_time_to_extend")


def test_renewal_runs_up_to_the_next_booking(client, room, room_booking, other_student, student):
    at(client, ROOM_START)
    scan(client, room)
    client.user = other_student
    book(client, room, ROOM_START + 3 * HOUR, ROOM_START + 4 * HOUR)
    client.user = student
    at(client, ROOM_START + 90 * MIN)
    response = client.post(f"/bookings/{room_booking['id']}/extend")
    assert datetime.fromisoformat(response.json()["ends_at"]) == ROOM_START + 3 * HOUR


def test_renewal_stops_at_closing_time(client, room):
    evening = local(2026, 10, 11, 18, 0)
    booking = book(client, room, evening, evening + 2 * HOUR)
    at(client, evening)
    scan(client, room)
    at(client, evening + 90 * MIN)
    response = client.post(f"/bookings/{booking['id']}/extend")
    assert (response.status_code, detail(response)) == (409, "no_time_to_extend")


def test_renewal_needs_check_in_and_ownership(client, room, room_booking, other_student):
    response = client.post(f"/bookings/{room_booking['id']}/extend")
    assert (response.status_code, detail(response)) == (409, "not_checked_in")
    client.user = other_student
    assert client.post(f"/bookings/{room_booking['id']}/extend").status_code == 404


# --- Lab seats -------------------------------------------------------------------


def test_lab_booking_gives_the_booked_seat(client, lab):
    seat = lab.seats[5]
    book(client, lab, ROOM_START, ROOM_START + 2 * HOUR, seat.id)
    at(client, ROOM_START)
    response = scan(client, lab)
    assert response.status_code == 201
    assert response.json()["seat_id"] == seat.id
    assert response.json()["cut_short_by"] is None


def test_lab_booking_holder_cannot_take_another_seat(client, lab):
    book(client, lab, ROOM_START, ROOM_START + 2 * HOUR, lab.seats[5].id)
    at(client, ROOM_START)
    assert detail(scan(client, lab, lab.seats[6].id)) == "booked_other_seat"


def test_seat_map_shows_until_when_each_seat_is_free(client, lab, other_student):
    seat = lab.seats[0]
    client.user = other_student
    start = SUNDAY_10AM.astimezone(TZ) + HOUR
    book(client, lab, start, start + 2 * HOUR, seat.id)
    client.user = None
    seats = client.get(f"/places/{lab.id}").json()["seats"]
    assert datetime.fromisoformat(seats[0]["free_until"]) == start
    # Without bookings, a seat is free until closing time (Sunday 20:00).
    assert datetime.fromisoformat(seats[1]["free_until"]) == local(2026, 10, 11, 20, 0)


def test_walk_in_is_cut_short_and_says_why(client, session, braude, lab, other_student, student):
    seat = lab.seats[0]
    client.user = other_student
    start = SUNDAY_10AM.astimezone(TZ) + 30 * MIN
    book(client, lab, start, start + 2 * HOUR, seat.id)
    client.user = student
    response = scan(client, lab, seat.id)
    assert response.status_code == 201
    body = response.json()
    assert datetime.fromisoformat(body["expires_at"]) == start
    assert body["cut_short_by"] == "booking"


def test_walk_in_refused_when_a_booking_starts_very_soon(client, lab, other_student, student):
    seat = lab.seats[0]
    client.user = other_student
    start = SUNDAY_10AM.astimezone(TZ) + 15 * MIN
    book(client, lab, start, start + 2 * HOUR, seat.id)
    at(client, start - 10 * MIN)  # only 10 minutes before someone's booking
    client.user = student
    assert detail(scan(client, lab, seat.id)) == "seat_booked_soon"


def test_walk_in_refused_on_a_seat_booked_right_now(client, lab, other_student, student):
    seat = lab.seats[0]
    client.user = other_student
    book(client, lab, ROOM_START, ROOM_START + 2 * HOUR, seat.id)
    at(client, ROOM_START + 5 * MIN)  # the owner has not arrived yet
    client.user = student
    assert detail(scan(client, lab, seat.id)) == "seat_booked"


def test_walk_in_cut_short_by_closing_time(client, lab):
    at(client, local(2026, 10, 11, 19, 0))
    body = scan(client, lab, lab.seats[0].id).json()
    assert body["cut_short_by"] == "closing"


def test_rescanning_a_lab_seat_renews_the_walk_in(client, lab):
    first = scan(client, lab, lab.seats[0].id).json()
    at(client, SUNDAY_10AM + 100 * MIN)
    again = scan(client, lab, lab.seats[0].id)
    assert again.status_code == 200
    assert again.json()["id"] == first["id"]
    # 11:40 + 2h = 13:40, rounded down to the 15-minute grid.
    assert datetime.fromisoformat(again.json()["expires_at"]) == local(2026, 10, 11, 13, 30)


# --- Edges found in code review --------------------------------------------------


def test_early_arrival_waits_for_the_previous_walk_in(client, lab, other_student, student):
    seat = lab.seats[0]
    start = local(2026, 10, 11, 14, 0)
    book(client, lab, start, start + 2 * HOUR, seat.id)  # student's booking at 14:00
    client.user = other_student
    at(client, local(2026, 10, 11, 13, 0))
    walk_in = scan(client, lab, seat.id).json()
    assert datetime.fromisoformat(walk_in["expires_at"]) == start  # cut short for the booking

    client.user = student
    at(client, start - 8 * MIN)
    assert detail(scan(client, lab)) == "seat_still_in_use"
    at(client, start + 1 * MIN)  # the walk-in has expired: no sweep needed
    assert scan(client, lab).status_code == 201


def test_renewal_ends_on_the_15_minute_grid(client, room, room_booking):
    at(client, ROOM_START)
    scan(client, room)
    at(client, ROOM_START + 97 * MIN + timedelta(seconds=33))  # 15:37:33
    response = client.post(f"/bookings/{room_booking['id']}/extend")
    assert datetime.fromisoformat(response.json()["ends_at"]) == local(2026, 10, 11, 17, 30)


def test_seat_with_less_than_fifteen_minutes_is_not_shown_as_free(client, lab, other_student):
    seat = lab.seats[0]
    client.user = other_student
    start = local(2026, 10, 11, 10, 15)
    book(client, lab, start, start + HOUR, seat.id)
    at(client, local(2026, 10, 11, 10, 5))
    client.user = None
    first = client.get(f"/places/{lab.id}").json()["seats"][0]
    assert (first["free_now"], first["free_until"]) == (False, None)


def test_booking_the_running_slot_needs_its_arrival_window_open(client, room):
    at(client, local(2026, 10, 11, 14, 15))
    late = local(2026, 10, 11, 14, 0)
    assert detail(client.post("/bookings", json={
        "place_id": room.id, "starts_at": late.isoformat(),
        "ends_at": (late + HOUR).isoformat(),
    })) == "in_the_past"
    at(client, local(2026, 10, 11, 14, 14))
    assert book(client, room, late, late + HOUR)["status"] == "booked"
