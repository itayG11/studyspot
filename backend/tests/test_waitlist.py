"""The waiting list for group rooms (wave 11): join when the time is taken,
told once when the whole range frees, first in line first, never held."""

from datetime import timedelta

import pytest
from conftest import SUNDAY_10AM, place_named
from test_api_bookings import HOURS_2, MONDAY_14, book, refused
from test_email_notices import FakeMailer, channel

from app.bookings import NO_SHOW_AFTER
from app.demo import Persona, demo_user
from app.models import Booking, BookingStatus, User
from app.models.waitlist import WaitlistEntry
from app.reminders import next_due, send_reminders
from app.waitlist import HEAD_START, MAX_WAITING, delete_past, take_freed


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


@pytest.fixture(autouse=True)
def reachable_students(session, student, other_student):
    """Only a student we can tell may wait: by default, everyone can."""
    for user in (student, other_student):
        user.email_verified, user.email_notices = True, True
    session.flush()


def wait(client, place, start, end):
    return client.post(f"/places/{place.id}/waitlist", json={"starts_at": start.isoformat(), "ends_at": end.isoformat()})


def taken_by(client, other, place, start=MONDAY_14, end=None):
    """`other` books the room; the client's user is signed in again after."""
    me, client.user = client.user, other
    booking = book(client, place, start, end or start + HOURS_2).json()
    client.user = me
    return booking


def opt_in(session, user):
    user.email_verified, user.email_notices = True, True
    session.flush()


def test_join_when_taken_and_see_it(client, room, other_student):
    taken_by(client, other_student, room)
    joined = wait(client, room, MONDAY_14, MONDAY_14 + HOURS_2)
    assert joined.status_code == 201
    [mine] = client.get("/me/waitlist").json()
    assert (mine["place_name"], mine["notified"]) == ("EM107", False)
    # Asking again for the same start is the same request.
    assert wait(client, room, MONDAY_14, MONDAY_14 + HOURS_2).json()["id"] == mine["id"]


def test_a_free_time_is_booked_not_waited_for(client, room):
    assert refused(wait(client, room, MONDAY_14, MONDAY_14 + HOURS_2), 409, "waitlist_slot_free")


def test_only_group_rooms(client, lab):
    assert refused(wait(client, lab, MONDAY_14, MONDAY_14 + HOURS_2), 409, "waitlist_rooms_only")


def test_the_booking_rules_apply(client, room, other_student):
    taken_by(client, other_student, room)
    assert refused(wait(client, room, MONDAY_14, MONDAY_14 + timedelta(hours=5)), 400, "too_long")
    assert refused(wait(client, room, MONDAY_14 + timedelta(days=9), MONDAY_14 + timedelta(days=9, hours=1)), 400, "too_far_ahead")


def test_a_few_at_most(client, room, session, braude):
    from factories import make_user

    starts = [MONDAY_14 + timedelta(days=d, hours=h) for d in (0, 1) for h in (-4, 0)][: MAX_WAITING + 1]
    for n, start in enumerate(starts):  # the bookers need no notices
        taken_by(client, make_user(session, braude, f"booker{n}@braude.example"), room, start)
    assert all(wait(client, room, s, s + HOURS_2).status_code == 201 for s in starts[:MAX_WAITING])
    over = starts[MAX_WAITING]
    assert refused(wait(client, room, over, over + HOURS_2), 409, "waitlist_too_many")


def test_someone_elses_request_cannot_be_removed(client, room, other_student, session):
    taken_by(client, other_student, room)
    entry = wait(client, room, MONDAY_14, MONDAY_14 + HOURS_2).json()
    client.user = other_student
    assert refused(client.delete(f"/me/waitlist/{entry['id']}"), 404, "waitlist_not_found")
    assert session.query(WaitlistEntry).count() == 1


def test_leave(client, room, other_student, session):
    taken_by(client, other_student, room)
    entry = wait(client, room, MONDAY_14, MONDAY_14 + HOURS_2).json()
    assert client.delete(f"/me/waitlist/{entry['id']}").status_code == 204
    assert client.get("/me/waitlist").json() == []


def test_another_institutions_room_is_not_found(client, room, session):
    from factories import make_institution, make_user

    client.user = make_user(session, make_institution(session, "other-college"))
    assert refused(wait(client, room, MONDAY_14, MONDAY_14 + HOURS_2), 404, "place_not_found")


def test_the_shared_demo_student_cannot_join(client, session, room):
    from factories import make_institution

    demo = make_institution(session, "demo-campus")
    client.user = demo_user(session, demo.slug, Persona.STUDENT, SUNDAY_10AM)
    client.user.institution_id = room.institution_id
    assert refused(wait(client, room, MONDAY_14, MONDAY_14 + HOURS_2), 403, "push_demo_account")


def test_signed_out_is_refused(client, room):
    client.user = None
    assert wait(client, room, MONDAY_14, MONDAY_14 + HOURS_2).status_code == 401
    assert client.get("/me/waitlist").status_code == 401


# --- freeing -------------------------------------------------------------------------


def test_told_once_when_the_booking_is_cancelled(client, session, room, student, other_student):
    booking = taken_by(client, other_student, room)
    wait(client, room, MONDAY_14, MONDAY_14 + HOURS_2)
    opt_in(session, student)
    email = channel(FakeMailer())
    assert send_reminders(session, None, SUNDAY_10AM, email) == 0  # still taken
    client.user = other_student
    client.post(f"/bookings/{booking['id']}/cancel")
    assert send_reminders(session, None, SUNDAY_10AM + timedelta(minutes=1), email) == 1
    [(_to, subject, text, _)] = email.mailer.sent
    assert subject == "החדר התפנה" and "EM107" in text and "14:00–16:00" in text
    assert f"/spaces/{room.id}" in text
    send_reminders(session, None, SUNDAY_10AM + timedelta(minutes=2), email)
    assert len(email.mailer.sent) == 1  # once
    client.user = student
    assert client.get("/me/waitlist").json()[0]["notified"] is True


def test_only_when_the_whole_range_is_free(session, client, room, other_student, student):
    taken_by(client, other_student, room, MONDAY_14, MONDAY_14 + timedelta(hours=1))
    second = taken_by(client, other_student, room, MONDAY_14 + timedelta(hours=1), MONDAY_14 + HOURS_2)
    wait(client, room, MONDAY_14, MONDAY_14 + HOURS_2)
    client.user = other_student
    client.post(f"/bookings/{second['id']}/cancel")
    assert take_freed(session, SUNDAY_10AM) == []  # 14:00-15:00 is still taken


def test_a_no_show_frees_it_and_the_alarm_knows_when(session, client, room, other_student, student):
    taken_by(client, other_student, room, SUNDAY_10AM + timedelta(hours=1))
    wait(client, room, SUNDAY_10AM + timedelta(hours=1), SUNDAY_10AM + timedelta(hours=3))
    released = SUNDAY_10AM + timedelta(hours=1) + NO_SHOW_AFTER
    assert next_due(session, SUNDAY_10AM) <= released
    assert take_freed(session, released - timedelta(minutes=1)) == []
    [freed] = take_freed(session, released)
    assert freed.user_id == student.id
    assert "11:15–13:00" in freed.notice.body  # from the slot that can still be booked


def test_the_first_in_line_gets_a_head_start(session, client, room, other_student, student, braude):
    from factories import make_user

    booking = taken_by(client, other_student, room)
    wait(client, room, MONDAY_14, MONDAY_14 + HOURS_2)
    third = make_user(session, braude, "third@braude.example")
    opt_in(session, third)
    client.user = third
    wait(client, room, MONDAY_14, MONDAY_14 + HOURS_2)
    client.user = other_student
    client.post(f"/bookings/{booking['id']}/cancel")
    assert [f.user_id for f in take_freed(session, SUNDAY_10AM)] == [student.id]
    assert take_freed(session, SUNDAY_10AM + HEAD_START - timedelta(minutes=1)) == []
    # The first did not book it: now the next one is told.
    assert [f.user_id for f in take_freed(session, SUNDAY_10AM + HEAD_START)] == [third.id]


def test_the_room_is_not_held(session, client, room, other_student, student):
    booking = taken_by(client, other_student, room)
    wait(client, room, MONDAY_14, MONDAY_14 + HOURS_2)
    client.user = other_student
    client.post(f"/bookings/{booking['id']}/cancel")
    take_freed(session, SUNDAY_10AM)
    # Someone else may book it before the one who waited.
    assert book(client, room, MONDAY_14, MONDAY_14 + HOURS_2).status_code == 201


def test_past_requests_are_removed(session, client, room, other_student):
    taken_by(client, other_student, room)
    wait(client, room, MONDAY_14, MONDAY_14 + HOURS_2)
    assert delete_past(session, MONDAY_14 + timedelta(minutes=89)) == 0  # 31 minutes left
    assert delete_past(session, MONDAY_14 + timedelta(minutes=90)) == 1


def test_after_a_round_the_next_time_is_never_in_the_past(session, client, room, other_student):
    taken_by(client, other_student, room, SUNDAY_10AM + timedelta(hours=1))
    wait(client, room, SUNDAY_10AM + timedelta(hours=1), SUNDAY_10AM + timedelta(hours=2))
    for minutes in (0, 60, 74, 75, 76, 90):
        now = SUNDAY_10AM + timedelta(minutes=minutes)
        send_reminders(session, None, now, channel(FakeMailer()))
        ahead = next_due(session, now)
        assert ahead is None or ahead > now, now


def test_it_goes_with_the_user(session, client, room, other_student, student):
    taken_by(client, other_student, room)
    wait(client, room, MONDAY_14, MONDAY_14 + HOURS_2)
    session.delete(student)
    session.flush()
    assert session.query(WaitlistEntry).count() == 0
    assert session.query(Booking).filter(Booking.status == BookingStatus.BOOKED).count() == 1


def test_no_way_to_be_told_no_waiting(client, session, room, student, other_student):
    taken_by(client, other_student, room)
    student.email_notices = False
    session.flush()
    assert refused(wait(client, room, MONDAY_14, MONDAY_14 + HOURS_2), 409, "waitlist_no_notices")


def test_one_who_turned_notices_off_does_not_hold_up_the_next(session, client, room, student, other_student, braude):
    from factories import make_user

    booking = taken_by(client, other_student, room)
    wait(client, room, MONDAY_14, MONDAY_14 + HOURS_2)
    third = make_user(session, braude, "third@braude.example")
    opt_in(session, third)
    client.user = third
    wait(client, room, MONDAY_14, MONDAY_14 + HOURS_2)
    student.email_notices = False  # the first in line can no longer be told
    client.user = other_student
    client.post(f"/bookings/{booking['id']}/cancel")
    assert [f.user_id for f in take_freed(session, SUNDAY_10AM)] == [third.id]


def test_asking_twice_at_once_is_one_request(client, session, room, other_student):
    """The second request waits on the user's lock, then finds the first."""
    taken_by(client, other_student, room)
    first = wait(client, room, MONDAY_14, MONDAY_14 + HOURS_2).json()
    again = wait(client, room, MONDAY_14, MONDAY_14 + timedelta(hours=1))
    assert again.status_code == 201 and again.json()["id"] == first["id"]
    assert session.query(WaitlistEntry).count() == 1
