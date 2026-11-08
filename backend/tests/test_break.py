"""Wave 19.1b: "going on a break". A student sitting in a room or at a lab seat
can step out for a while and keep the place; coming back means scanning the
sign again. If the break runs out with no scan, the place is let go at once
(not when the sweep gets to it), and shown as maybe still taken for a moment,
because their things may still be there."""

from datetime import timedelta

import pytest
from conftest import SUNDAY_10AM, code_for, place_named
from test_push import Browser, subscribe
from test_reminders import push

from app.breaks import BREAK_ENDING_AHEAD
from app.lingering import lingering_room_ids, lingering_seat_ids
from app.models import Booking, BookingSource, BookingStatus, CheckIn, CheckInEndReason, User
from app.reminders import END_AHEAD, next_due, send_reminders
from app.sweeper import sweep

NOW = SUNDAY_10AM
BREAK = timedelta(minutes=20)


@pytest.fixture
def other(session, braude) -> User:
    user = User(institution_id=braude.id, email="other@braude.example", display_name="Other")
    session.add(user)
    session.flush()
    return user


def lab_of(braude):
    return next(p for b in braude.buildings for p in b.places if p.name == "M206")


def room_stay(client, session, braude, user, hours=1):
    """A booked room, scanned: a check-in that lasts until the booking ends."""
    room = place_named(braude, "EM", "EM107")
    session.add(Booking(
        institution_id=braude.id, user_id=user.id, place_id=room.id, starts_at=NOW,
        ends_at=NOW + timedelta(hours=hours), status=BookingStatus.BOOKED, source=BookingSource.ADVANCE,
    ))
    session.flush()
    response = client.post("/check-ins", json={"code": code_for(room)})
    assert response.status_code == 201, response.text
    return room, response.json()


def seat_stay(client, braude):
    lab = lab_of(braude)
    response = client.post("/check-ins", json={"code": code_for(lab), "seat_id": lab.seats[0].id})
    assert response.status_code == 201, response.text
    return lab, lab.seats[0], response.json()


def go_on_break(client, stay):
    return client.post(f"/check-ins/{stay['id']}/break")


# --- Starting a break -----------------------------------------------------------------------


def test_a_break_lasts_twenty_minutes_and_can_be_offered_only_once(client, session, braude, student):
    _, stay = room_stay(client, session, braude, student)
    assert stay["can_break"] is True and stay["break_until"] is None
    response = go_on_break(client, stay)
    assert response.status_code == 200
    body = response.json()
    assert body["break_until"].startswith((NOW + BREAK).strftime("%Y-%m-%dT%H:%M"))
    assert body["can_break"] is False
    assert go_on_break(client, stay).json() == {"detail": "break_used"}


def test_a_seat_in_a_lab_can_go_on_a_break_too(client, braude):
    _, _, stay = seat_stay(client, braude)
    assert go_on_break(client, stay).status_code == 200


def test_an_open_area_has_no_break(client, braude):
    area = place_named(braude, "L", "מתחם לימוד")
    stay = client.post("/check-ins", json={"code": code_for(area)}).json()
    assert stay["can_break"] is False
    response = go_on_break(client, stay)
    assert (response.status_code, response.json()) == (409, {"detail": "break_not_allowed"})


def test_an_institution_can_turn_breaks_off(client, session, braude, student):
    _, stay = room_stay(client, session, braude, student)
    braude.break_minutes = 0
    session.flush()
    response = go_on_break(client, stay)
    assert (response.status_code, response.json()) == (409, {"detail": "break_disabled"})
    assert client.get("/me/check-in").json()["can_break"] is False


def test_too_close_to_the_end_there_is_no_time_to_leave(client, session, braude, student):
    room = place_named(braude, "EM", "EM107")
    session.add(Booking(
        institution_id=braude.id, user_id=student.id, place_id=room.id, starts_at=NOW,
        ends_at=NOW + timedelta(minutes=15), status=BookingStatus.BOOKED, source=BookingSource.ADVANCE,
    ))
    session.flush()
    stay = client.post("/check-ins", json={"code": code_for(room)}).json()
    client.clock.now = NOW + timedelta(minutes=12)  # three minutes left
    response = go_on_break(client, stay)
    assert (response.status_code, response.json()) == (409, {"detail": "break_too_late"})


def test_someone_elses_stay_answers_like_a_missing_one(client, session, braude, student, other):
    _, stay = room_stay(client, session, braude, student)
    client.user = other
    assert go_on_break(client, stay).status_code == 404


# --- What others see ------------------------------------------------------------------------


def test_the_room_shows_a_break_and_is_still_not_free(client, session, braude, student):
    room, stay = room_stay(client, session, braude, student)
    go_on_break(client, stay)
    body = client.get(f"/places/{room.id}").json()
    assert body["free_now"] is False
    assert body["on_break_until"].startswith((NOW + BREAK).strftime("%Y-%m-%dT%H:%M"))


def test_the_seat_shows_a_break_and_is_still_taken(client, braude):
    lab, seat, stay = seat_stay(client, braude)
    go_on_break(client, stay)
    seats = {s["id"]: s for s in client.get(f"/places/{lab.id}").json()["seats"]}
    assert seats[seat.id]["occupied"] is True and seats[seat.id]["free_now"] is False
    assert seats[seat.id]["break_until"].startswith((NOW + BREAK).strftime("%Y-%m-%dT%H:%M"))
    assert seats[lab.seats[1].id]["break_until"] is None


# --- Coming back, and not coming back -------------------------------------------------------


def test_scanning_the_sign_again_ends_the_break_and_keeps_the_stay(client, session, braude, student):
    room, stay = room_stay(client, session, braude, student)
    go_on_break(client, stay)
    client.clock.now = NOW + timedelta(minutes=10)
    back = client.post("/check-ins", json={"code": code_for(room)})
    assert back.status_code == 200 and back.json()["id"] == stay["id"]
    assert back.json()["break_until"] is None
    assert client.get(f"/places/{room.id}").json()["on_break_until"] is None
    assert go_on_break(client, stay).json() == {"detail": "break_used"}  # one break per stay


def test_a_break_that_runs_out_lets_the_place_go_at_once(client, session, braude, student, other):
    room, stay = room_stay(client, session, braude, student)
    go_on_break(client, stay)
    client.clock.now = NOW + BREAK + timedelta(minutes=1)  # nobody ran the sweep
    assert client.get("/me/check-in").json() is None
    # A new booking for the same room, in the time the first one still had, is not blocked.
    client.user = other
    response = client.post("/bookings", json={
        "place_id": room.id, "starts_at": (NOW + timedelta(minutes=30)).isoformat(),
        "ends_at": (NOW + timedelta(minutes=45)).isoformat(),
    })
    assert response.status_code == 201, response.text
    row = session.get(CheckIn, stay["id"])
    assert row.end_reason == CheckInEndReason.BREAK_OVER and row.ended_at == NOW + BREAK


def test_the_sweep_ends_it_completes_the_booking_and_tells_the_webhooks(client, session, braude, student, monkeypatch):
    seen = []
    monkeypatch.setattr("app.breaks.check_in_event", lambda s, kind, place_id, inst, now: seen.append((kind, place_id)))
    room, stay = room_stay(client, session, braude, student)
    seen.clear()
    go_on_break(client, stay)
    sweep(session, NOW + BREAK + timedelta(minutes=1))
    row = session.get(CheckIn, stay["id"])
    assert row.end_reason == CheckInEndReason.BREAK_OVER
    assert session.get(Booking, row.booking_id).status == BookingStatus.COMPLETED
    assert seen == [("checkin.ended", room.id)]


def test_a_made_up_student_does_not_make_an_event(client, session, braude, student, monkeypatch):
    seen = []
    monkeypatch.setattr("app.breaks.check_in_event", lambda s, kind, place_id, inst, now: seen.append(kind))
    _, stay = room_stay(client, session, braude, student)
    go_on_break(client, stay)
    session.get(CheckIn, stay["id"]).simulated = True
    seen.clear()
    sweep(session, NOW + BREAK + timedelta(minutes=1))
    assert seen == []


def test_a_break_that_ran_out_is_marked_maybe_still_taken_for_a_moment(client, session, braude, student):
    room, stay = room_stay(client, session, braude, student)
    go_on_break(client, stay)
    sweep(session, NOW + BREAK + timedelta(minutes=2))
    later = NOW + BREAK + timedelta(minutes=2)
    assert lingering_room_ids(session, [room.id], later, 5) == {room.id}
    assert lingering_room_ids(session, [room.id], NOW + BREAK + timedelta(minutes=6), 5) == set()


def test_a_seat_whose_break_ran_out_is_marked_too(client, session, braude):
    lab, seat, stay = seat_stay(client, braude)
    go_on_break(client, stay)
    sweep(session, NOW + BREAK + timedelta(minutes=1))
    assert lingering_seat_ids(session, lab.id, NOW + BREAK + timedelta(minutes=2), 5) == {seat.id}


# --- The reminder ---------------------------------------------------------------------------


def test_a_reminder_five_minutes_before_the_break_ends_once(client, session, braude, student):
    browser, seen = Browser(), []
    subscribe(session, student, browser)
    _, stay = room_stay(client, session, braude, student)
    go_on_break(client, stay)
    until = NOW + BREAK
    send_reminders(session, push(seen), until - BREAK_ENDING_AHEAD - timedelta(minutes=1))
    assert seen == []  # not yet
    send_reminders(session, push(seen), until - BREAK_ENDING_AHEAD)
    send_reminders(session, push(seen), until - BREAK_ENDING_AHEAD + timedelta(minutes=1))
    [request] = seen
    body = browser.read(request.content)["body"]
    assert "סורקים" in body
    # What is left to wake for is the booking's own "ends soon" (an hour in), not the break again.
    assert next_due(session, until - BREAK_ENDING_AHEAD + timedelta(minutes=1)) == NOW + timedelta(hours=1) - END_AHEAD


def test_no_break_reminder_after_coming_back_or_without_a_subscription(client, session, braude, student):
    seen = []
    room, stay = room_stay(client, session, braude, student)
    go_on_break(client, stay)
    send_reminders(session, push(seen), NOW + BREAK - BREAK_ENDING_AHEAD)  # nobody to tell
    assert seen == []
    subscribe(session, student, Browser())
    client.clock.now = NOW + timedelta(minutes=5)
    client.post("/check-ins", json={"code": code_for(room)})  # back
    send_reminders(session, push(seen), NOW + BREAK - BREAK_ENDING_AHEAD)
    assert seen == []


def test_no_break_reminder_once_the_institution_switched_it_off(client, session, braude, student):
    seen = []
    subscribe(session, student, Browser())
    _, stay = room_stay(client, session, braude, student)
    go_on_break(client, stay)
    braude.overstay_policy = "none"
    session.flush()
    send_reminders(session, push(seen), NOW + BREAK - BREAK_ENDING_AHEAD)
    assert seen == []
