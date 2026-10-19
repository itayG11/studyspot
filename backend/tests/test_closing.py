"""Closing an institution (wave 11): hidden at once, nothing new starts in
it, its students told within the budget, and deleted after 14 days unless
the system admin takes it back."""

from datetime import timedelta

import pytest
from conftest import SUNDAY_10AM, code_for, place_named
from factories import make_institution, make_user
from sqlalchemy import func, select
from test_api_bookings import HOURS_2, MONDAY_14, book
from test_email_notices import FakeMailer, channel

from app import closing as closing_module
from app.accounts import sign_in
from app.api.auth import get_mailer
from app.closing import CLOSING_PERIOD, NOTICES_AGAIN_AFTER, delete_due, next_due, send_notices
from app.errors import Refusal
from app.main import app
from app.models import AuthProvider, Booking, BookingSource, BookingStatus, ClosingNotice, Institution, User, UserRole
from app.oidc import ProviderIdentity
from app.reminders import send_reminders
from app.seed import seed_demo

ENDS = SUNDAY_10AM + CLOSING_PERIOD


@pytest.fixture
def owner(session) -> User:
    ops = make_institution(session, "ops")
    user = User(institution_id=ops.id, email="owner@gmail.com", display_name="Owner", role=UserRole.SYSTEM_ADMIN)
    session.add(user)
    session.flush()
    return user


@pytest.fixture
def mail():
    sent = FakeMailer()
    app.dependency_overrides[get_mailer] = lambda: sent
    yield sent


@pytest.fixture
def room(braude):
    return place_named(braude, "EM", "EM107")


def close(client, owner, slug="braude"):
    me, client.user = client.user, owner
    response = client.post(f"/system/institutions/{slug}/close")
    client.user = me
    return response


def told(session) -> set[int]:
    return set(session.scalars(select(ClosingNotice.user_id)))


# --- closing --------------------------------------------------------------------------


def test_closing_hides_it_and_cancels_what_is_ahead(client, session, braude, owner, room, mail):
    braude.is_active = True
    ahead = book(client, room, MONDAY_14, MONDAY_14 + HOURS_2).json()
    past = Booking(
        user_id=client.user.id, institution_id=braude.id, place_id=room.id, status=BookingStatus.COMPLETED,
        source=BookingSource.ADVANCE,
        starts_at=SUNDAY_10AM - timedelta(days=1), ends_at=SUNDAY_10AM - timedelta(days=1, hours=-1),
    )
    session.add(past)
    session.flush()
    response = close(client, owner)
    assert response.status_code == 200, response.text
    assert response.json()["closes_at"].startswith("2026-10-25")
    session.refresh(braude)
    assert (braude.is_active, braude.closes_at) == (False, ENDS)
    assert session.get(Booking, ahead["id"]).status == BookingStatus.CANCELLED
    assert past.status == BookingStatus.COMPLETED
    assert client.get("/institutions/braude").json()["closes_at"] is not None


def test_only_the_system_admin_closes(client, session, braude):
    assert client.post("/system/institutions/braude/close").status_code == 403  # a student
    client.user = make_user(session, braude, "dalit@braude.ac.il")
    client.user.role = UserRole.INSTITUTION_ADMIN  # not even the institution's own admin
    assert client.post("/system/institutions/braude/close").status_code == 403
    assert braude.closes_at is None


def test_never_the_demo_campus_or_one_with_the_system_admin_in_it(client, session, braude, owner, mail):
    seed_demo(session)
    assert close(client, owner, "demo").json()["detail"] == "institution_demo"
    owner.institution_id = braude.id
    session.flush()
    refused = close(client, owner)
    assert (refused.status_code, refused.json()["detail"]) == (409, "institution_has_system_admin")


def test_closing_twice_is_refused_and_unknown_is_not_found(client, owner, mail):
    assert close(client, owner).status_code == 200
    assert close(client, owner).json()["detail"] == "institution_closing"
    assert close(client, owner, "nowhere").status_code == 404


def test_the_admins_get_an_email_only_at_a_proved_address(client, session, braude, owner, mail):
    proved = make_user(session, braude, "dalit@braude.ac.il")
    proved.role, proved.email_verified = UserRole.INSTITUTION_ADMIN, True
    unproved = make_user(session, braude, "other@outlook.com")
    unproved.role = UserRole.INSTITUTION_ADMIN
    session.flush()
    close(client, owner)
    [(to, subject, text, _)] = mail.sent
    assert to == "dalit@braude.ac.il" and braude.name in subject and "25.10.2026" in text


def test_a_failed_email_does_not_undo_the_closing(client, session, braude, owner, mail):
    admin = make_user(session, braude, "dalit@braude.ac.il")
    admin.role, admin.email_verified = UserRole.INSTITUTION_ADMIN, True
    session.flush()

    def fail(*args, **kwargs):
        raise Refusal(502, "email_not_sent")

    mail.send = fail
    assert close(client, owner).status_code == 200
    assert braude.closes_at == ENDS


# --- nothing new starts ------------------------------------------------------------------


def test_nothing_new_starts_while_closing(client, session, braude, owner, room, mail):
    close(client, owner)
    refused = book(client, room, MONDAY_14, MONDAY_14 + HOURS_2)
    assert (refused.status_code, refused.json()["detail"]) == (409, "institution_closing")
    scan = client.post("/check-ins", json={"code": code_for(place_named(braude, "L", "מתחם לימוד"))})
    assert (scan.status_code, scan.json()["detail"]) == (409, "institution_closing")
    wait = client.post(f"/places/{room.id}/waitlist", json={"starts_at": MONDAY_14.isoformat(), "ends_at": (MONDAY_14 + HOURS_2).isoformat()})
    assert (wait.status_code, wait.json()["detail"]) == (409, "institution_closing")


def test_no_new_account_but_the_old_ones_still_sign_in(session, braude, student):
    braude.closes_at = ENDS
    session.flush()
    new = ProviderIdentity("new@e.braude.ac.il", "e.braude.ac.il", "new@e.braude.ac.il", "New")
    with pytest.raises(Refusal) as refused:
        sign_in(session, AuthProvider.EMAIL, new, SUNDAY_10AM)
    assert refused.value.code == "institution_closing"
    first = ProviderIdentity("s@e.braude.ac.il", "e.braude.ac.il", "s@e.braude.ac.il", "S")
    braude.closes_at = None
    user = sign_in(session, AuthProvider.EMAIL, first, SUNDAY_10AM)
    braude.closes_at = ENDS
    assert sign_in(session, AuthProvider.EMAIL, first, SUNDAY_10AM).id == user.id  # to see the banner, or delete


# --- telling the students ------------------------------------------------------------------


def opted_in(session, braude, email):
    user = make_user(session, braude, email)
    user.email_verified, user.email_notices = True, True
    session.flush()
    return user


def test_each_student_we_can_tell_is_told_once(session, braude, student):
    reachable = opted_in(session, braude, "a@e.braude.ac.il")
    braude.closes_at = ENDS
    session.flush()
    email = channel(FakeMailer())
    assert send_notices(session, None, email, SUNDAY_10AM) == 1
    [(to, subject, text, _)] = email.mailer.sent
    assert to == reachable.email and subject == "המוסד שלך נסגר" and "25.10" in text
    assert told(session) == {reachable.id}  # the student without notices is not marked
    assert send_notices(session, None, email, SUNDAY_10AM + timedelta(minutes=1)) == 0


def test_a_spent_budget_goes_on_the_next_day(session, braude, monkeypatch):
    users = [opted_in(session, braude, f"s{n}@e.braude.ac.il") for n in range(3)]
    braude.closes_at = ENDS
    session.flush()
    monkeypatch.setattr("app.notify.EMAILS_PER_DAY", 2)
    email = channel(FakeMailer())
    assert send_notices(session, None, email, SUNDAY_10AM) == 2
    assert send_notices(session, None, email, SUNDAY_10AM + timedelta(hours=1)) == 0  # nothing marked for the third
    assert send_notices(session, None, email, SUNDAY_10AM + timedelta(days=1, minutes=1)) == 1
    assert told(session) == {u.id for u in users}


def test_the_reminders_round_sends_them_and_the_alarm_knows(session, braude):
    opted_in(session, braude, "a@e.braude.ac.il")
    braude.closes_at = ENDS
    session.flush()
    assert next_due(session, SUNDAY_10AM) == SUNDAY_10AM + NOTICES_AGAIN_AFTER
    assert send_reminders(session, None, SUNDAY_10AM, channel(FakeMailer())) == 1
    assert next_due(session, SUNDAY_10AM) == ENDS  # everyone told: only the deletion is ahead


def test_made_up_students_are_not_told(session, braude):
    fake = opted_in(session, braude, "fake@e.braude.ac.il")
    fake.simulated = True
    braude.closes_at = ENDS
    session.flush()
    assert send_notices(session, None, channel(FakeMailer()), SUNDAY_10AM) == 0


# --- taking it back, and the end ---------------------------------------------------------


def test_reopening_takes_it_back(client, session, braude, owner, mail):
    close(client, owner)
    session.add(ClosingNotice(user_id=client.user.id, sent_at=SUNDAY_10AM))
    session.flush()
    client.user = owner
    response = client.post("/system/institutions/braude/reopen")
    assert response.status_code == 200 and response.json()["closes_at"] is None
    assert braude.closes_at is None and told(session) == set()
    assert client.post("/system/institutions/braude/reopen").json()["detail"] == "institution_not_closing"


def test_deleted_on_the_day_not_before(session, braude, student):
    student_id = student.id
    braude.closes_at = ENDS
    session.flush()
    assert delete_due(session, ENDS - timedelta(minutes=1), {"demo"}, frozenset()) == 0
    assert delete_due(session, ENDS, {"demo"}, frozenset()) == 1
    assert session.scalar(select(func.count()).select_from(Institution).where(Institution.slug == "braude")) == 0
    session.expire_all()
    assert session.get(User, student_id) is None


def test_one_that_cannot_be_deleted_is_left_and_logged(session, braude, caplog):
    braude.closes_at = ENDS
    session.add(User(institution_id=braude.id, email="boss@gmail.com", display_name="B", role=UserRole.SYSTEM_ADMIN))
    session.flush()
    assert delete_due(session, ENDS, set(), frozenset()) == 0
    assert "institution_has_system_admin" in caplog.text
    assert next_due(session, ENDS + timedelta(minutes=5)) is None  # no alarm every minute for it


def teardown_module():
    app.dependency_overrides.clear()


# --- what the review found --------------------------------------------------------------


def test_closing_ends_the_waits_and_a_booking_starting_now(client, session, braude, owner, room, mail):
    """Cancelled bookings would read as "the room is free" to whoever waits,
    and booking it is refused. A booking starting now would be told to scan."""
    from app.models.waitlist import WaitlistEntry

    other = make_user(session, braude, "other@e.braude.ac.il")
    me, client.user = client.user, other
    taken = book(client, room, MONDAY_14, MONDAY_14 + HOURS_2).json()
    client.user = me
    other.email_verified, other.email_notices = True, True
    student = client.user
    student.email_verified, student.email_notices = True, True
    session.flush()
    waited = client.post(f"/places/{room.id}/waitlist", json={"starts_at": MONDAY_14.isoformat(), "ends_at": (MONDAY_14 + HOURS_2).isoformat()})
    assert waited.status_code == 201, waited.text
    starting = Booking(
        user_id=student.id, institution_id=braude.id, place_id=place_named(braude, "M", "M206").id,
        status=BookingStatus.BOOKED, source=BookingSource.ADVANCE,
        starts_at=SUNDAY_10AM - timedelta(minutes=5), ends_at=SUNDAY_10AM + timedelta(minutes=55),
    )
    session.add(starting)
    session.flush()
    close(client, owner)
    assert session.query(WaitlistEntry).count() == 0
    assert session.get(Booking, taken["id"]).status == BookingStatus.CANCELLED
    assert starting.status == BookingStatus.CANCELLED


def test_its_admin_cannot_show_it_again_or_add_rules(client, session, braude, owner, mail):
    close(client, owner)
    admin = make_user(session, braude, "dalit@braude.ac.il")
    admin.role = UserRole.INSTITUTION_ADMIN
    session.flush()
    client.user = admin
    shown = client.patch("/admin/institutions/braude", json={"is_active": True})
    assert (shown.status_code, shown.json()["detail"]) == (409, "institution_closing")
    rule = client.post("/admin/institutions/braude/login-rules", json={"provider": "email", "value": "new.ac.il"})
    assert (rule.status_code, rule.json()["detail"]) == (409, "institution_closing")
    assert braude.is_active is False


def test_no_admin_invite_is_taken_while_closing(session, braude):
    from app.institutions import accept_invite, create_invite

    key = b"k" * 32
    _, token = create_invite(session, braude, None, SUNDAY_10AM, key)
    braude.closes_at = ENDS
    newcomer = make_user(session, braude, "new@gmail.com")
    with pytest.raises(Refusal) as refused:
        accept_invite(session, newcomer, token, SUNDAY_10AM, key)
    assert refused.value.code == "institution_closing"


def test_a_mark_already_there_does_not_stop_the_round(session, braude):
    """Two rounds at once may tell one twice; the second mark is a no-op."""
    first = opted_in(session, braude, "a@e.braude.ac.il")
    braude.closes_at = ENDS
    session.flush()

    original = closing_module.notify

    def notify_then_race(db, user_id, *args):
        sent = original(db, user_id, *args)
        db.add(ClosingNotice(user_id=user_id, sent_at=SUNDAY_10AM))  # the other round marked it meanwhile
        db.flush()
        return sent

    closing_module.notify = notify_then_race
    try:
        assert send_notices(session, None, channel(FakeMailer()), SUNDAY_10AM) == 1
    finally:
        closing_module.notify = original
    assert told(session) == {first.id}


def test_after_a_full_round_the_next_one_comes_in_a_minute(session, braude, monkeypatch):
    monkeypatch.setattr(closing_module, "NOTICES_PER_ROUND", 2)
    for n in range(3):
        opted_in(session, braude, f"s{n}@e.braude.ac.il")
    braude.closes_at = ENDS
    session.flush()
    assert send_notices(session, None, channel(FakeMailer()), SUNDAY_10AM) == 2
    assert next_due(session, SUNDAY_10AM) == SUNDAY_10AM + timedelta(minutes=1)
    assert next_due(session, SUNDAY_10AM + timedelta(minutes=10)) == SUNDAY_10AM + timedelta(minutes=10) + NOTICES_AGAIN_AFTER


def test_extending_is_refused_while_closing(client, session, braude):
    scan = client.post("/check-ins", json={"code": code_for(place_named(braude, "L", "מתחם לימוד"))})
    assert scan.status_code == 201
    braude.closes_at = ENDS
    session.flush()
    again = client.post(f"/check-ins/{scan.json()['id']}/still-here")
    assert (again.status_code, again.json()["detail"]) == (409, "institution_closing")
