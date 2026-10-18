""""Still here?" (wave 11): before a check-in without a booking ends, the
student is asked, and can extend it once from the app. After that, a scan."""

from datetime import timedelta

from conftest import SUNDAY_10AM, code_for, place_named
from test_email_notices import FakeMailer, channel

from app.models import CheckIn
from app.reminders import STILL_HERE_AHEAD, next_due, send_reminders


def checked_in(client, braude, name="מתחם לימוד"):
    place = place_named(braude, "L", name)
    response = client.post("/check-ins", json={"code": code_for(place)})
    assert response.status_code == 201, response.text
    return response.json()


def opt_in(session, user):
    user.email_verified, user.email_notices = True, True
    session.flush()


def test_asked_once_before_it_ends(client, session, braude, student):
    row = checked_in(client, braude)
    opt_in(session, student)
    ends = SUNDAY_10AM + timedelta(hours=2)
    assert next_due(session, SUNDAY_10AM) == ends - STILL_HERE_AHEAD
    email = channel(FakeMailer())
    send_reminders(session, None, ends - STILL_HERE_AHEAD - timedelta(minutes=1), email)
    assert email.mailer.sent == []
    send_reminders(session, None, ends - STILL_HERE_AHEAD, email)
    send_reminders(session, None, ends - STILL_HERE_AHEAD + timedelta(minutes=1), email)
    [(_to, subject, text, _)] = email.mailer.sent
    assert subject == "עדיין כאן?" and "12:00" in text
    assert session.get(CheckIn, row["id"]).reminded_at is not None


def test_never_for_the_made_up_students_or_without_a_way_to_tell(client, session, braude, student):
    row = checked_in(client, braude)
    email = channel(FakeMailer())
    near_end = SUNDAY_10AM + timedelta(hours=2) - STILL_HERE_AHEAD
    send_reminders(session, None, near_end, email)  # not opted in
    session.get(CheckIn, row["id"]).simulated = True
    opt_in(session, student)
    send_reminders(session, None, near_end, email)
    assert email.mailer.sent == []


def test_still_here_extends_once(client, session, braude):
    row = checked_in(client, braude)
    assert row["can_extend"] is True
    client.clock.now = SUNDAY_10AM + timedelta(hours=1, minutes=50)
    longer = client.post(f"/check-ins/{row['id']}/still-here")
    assert longer.status_code == 200
    assert longer.json()["expires_at"].startswith("2026-10-11T10:50")  # 13:50 in Israel: two hours from now
    assert longer.json()["can_extend"] is False
    again = client.post(f"/check-ins/{row['id']}/still-here")
    assert (again.status_code, again.json()["detail"]) == (409, "still_here_used")
    # Scanning the place again still works as before.
    assert client.post("/check-ins", json={"code": code_for(place_named(braude, "L", "מתחם לימוד"))}).status_code == 200


def test_someone_elses_check_in_is_not_found(client, session, braude):
    from factories import make_user

    row = checked_in(client, braude)
    client.user = make_user(session, braude, "other@braude.example")
    refused = client.post(f"/check-ins/{row['id']}/still-here")
    assert (refused.status_code, refused.json()["detail"]) == (404, "check_in_not_found")


def test_an_ended_check_in_cannot_be_extended(client, braude):
    row = checked_in(client, braude)
    client.clock.now = SUNDAY_10AM + timedelta(hours=3)
    refused = client.post(f"/check-ins/{row['id']}/still-here")
    assert (refused.status_code, refused.json()["detail"]) == (404, "check_in_not_found")


def test_signed_out_is_refused(client, braude):
    row = checked_in(client, braude)
    client.user = None
    assert client.post(f"/check-ins/{row['id']}/still-here").status_code == 401
