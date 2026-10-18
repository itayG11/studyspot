"""Sign-in with a password (wave 11).

A password is never the first proof: the address is proved by an emailed
code, and only then may a password be set. The same code-then-password step
signs up, changes and resets it. The database keeps an argon2id hash.
"""

from datetime import timedelta

import pytest
from conftest import SUNDAY_10AM, Clock
from factories import assert_rejected
from fastapi.testclient import TestClient
from sqlalchemy import delete, select
from test_email_sign_in import FRONTEND, STUDENT, FakeMailer, make_settings, start

from app.api.auth import get_mailer
from app.api.deps import get_session
from app.clock import get_now
from app.config import get_settings
from app.errors import Refusal
from app.main import app
from app.models import AuthProvider, AuthSession, InstitutionLoginRule, User, UserIdentity
from app.passwords import LOCK_FOR, MAX_FAILURES, check_strength, hash_password, verify_password

GOOD = "Kfar-Tavor 7 rain"


@pytest.fixture
def mailer() -> FakeMailer:
    return FakeMailer()


@pytest.fixture
def make_client(session, braude, mailer):
    def build(**overrides) -> TestClient:
        settings = make_settings(**overrides)
        clock = Clock(SUNDAY_10AM)
        app.dependency_overrides[get_session] = lambda: session
        app.dependency_overrides[get_now] = lambda: clock.now
        app.dependency_overrides[get_settings] = lambda: settings
        app.dependency_overrides[get_mailer] = lambda: mailer
        client = TestClient(app, base_url="https://testserver", headers={"Origin": FRONTEND})
        client.clock = clock
        return client

    yield build
    app.dependency_overrides.clear()


@pytest.fixture
def client(make_client) -> TestClient:
    return make_client()


def set_password(client, mailer, password=GOOD, email=STUDENT, code=None):
    if code is None:
        assert start(client, email).status_code == 202
        code = mailer.last_code()
    return client.post("/auth/password/set", json={"email": email, "code": code, "password": password})


def login(client, password=GOOD, email=STUDENT):
    return client.post("/auth/password/login", json={"email": email, "password": password})


def identity(session, email=STUDENT) -> UserIdentity | None:
    return session.scalars(
        select(UserIdentity).where(UserIdentity.provider == AuthProvider.EMAIL, UserIdentity.subject == email.lower())
    ).first()


# --- strength ------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("password", "reason"),
    [
        ("Short1!x", "password_too_short"),
        ("A1!" + "x" * 126, "password_too_long"),
        ("no-upper-case-7", "password_needs_upper"),
        ("NO-LOWER-CASE-7", "password_needs_lower"),
        ("No-Digits-Here", "password_needs_digit"),
        ("NoSymbolsHere7", "password_needs_symbol"),
        ("Password123!", "password_too_common"),
        ("Qwerty!2024", "password_too_common"),
        ("Itay.Gabay#2026", "password_has_email"),
    ],
)
def test_a_weak_password_is_refused_with_its_reason(password, reason):
    with pytest.raises(Refusal) as refused:
        check_strength(password, STUDENT.lower())
    assert (refused.value.status, refused.value.code) == (422, reason)


def test_a_strong_password_passes():
    check_strength(GOOD, STUDENT.lower())
    check_strength("מים-קרים Tz9", STUDENT.lower())  # Hebrew counts as letters too


def test_the_hash_is_argon2id_and_not_the_password():
    hashed = hash_password(GOOD)
    assert hashed.startswith("$argon2id$") and GOOD not in hashed
    assert hash_password(GOOD) != hashed  # a new salt each time
    assert verify_password(hashed, GOOD) and not verify_password(hashed, GOOD + "x")


def test_only_an_email_identity_may_have_a_password(session, student):
    google = UserIdentity(user_id=student.id, provider=AuthProvider.GOOGLE, subject="g-1", password_hash="$argon2id$x")
    assert_rejected(session, lambda: session.add(google), "ck_user_identities_password_only_email")


# --- setting it ------------------------------------------------------------------------


def test_a_code_then_a_password_signs_a_new_student_up(client, mailer, session):
    response = set_password(client, mailer)
    assert response.status_code == 200, response.text
    assert response.json()["user"]["has_password"] is True
    assert "studyspot_refresh" in response.cookies
    row = identity(session)
    assert row.password_hash.startswith("$argon2id$") and row.password_set_at == SUNDAY_10AM


def test_a_weak_password_does_not_use_up_the_code(client, mailer, session):
    start(client)
    code = mailer.last_code()
    weak = set_password(client, mailer, "NoSymbolsHere7", code=code)
    assert (weak.status_code, weak.json()["detail"]) == (422, "password_needs_symbol")
    assert set_password(client, mailer, code=code).status_code == 200


def test_a_wrong_code_sets_nothing(client, mailer, session):
    start(client)
    wrong = "000000" if mailer.last_code() != "000000" else "111111"
    refused = set_password(client, mailer, code=wrong)
    assert (refused.status_code, refused.json()["detail"]) == (400, "email_code_invalid")
    assert identity(session) is None


def test_a_new_password_signs_out_every_other_device(client, mailer, session):
    start(client)
    assert client.post("/auth/email/verify", json={"email": STUDENT, "code": mailer.last_code()}).status_code == 200
    user_id = identity(session).user_id
    assert set_password(client, mailer).status_code == 200
    sessions = session.scalars(select(AuthSession).where(AuthSession.user_id == user_id)).all()
    assert [s.revoked_at is None for s in sessions].count(True) == 1  # only this device's new one


def test_a_reset_replaces_the_old_password(client, mailer):
    set_password(client, mailer)
    assert set_password(client, mailer, "Another-Good 42").status_code == 200
    assert login(client).status_code == 401
    assert login(client, "Another-Good 42").status_code == 200


# --- signing in with it ----------------------------------------------------------------


def test_the_right_password_signs_in(client, mailer, session):
    set_password(client, mailer)
    response = login(client, email="  " + STUDENT.upper())
    assert response.status_code == 200, response.text
    assert response.json()["user"]["email"] == STUDENT.lower()
    assert "studyspot_refresh" in response.cookies


def test_every_failure_looks_the_same(client, mailer, session, braude):
    set_password(client, mailer)
    start(client, "code.only@e.braude.ac.il")
    client.post("/auth/email/verify", json={"email": "code.only@e.braude.ac.il", "code": mailer.last_code()})
    answers = [
        login(client, "Wrong-Password 1"),
        login(client, email="nobody@e.braude.ac.il"),
        login(client, email="code.only@e.braude.ac.il"),
    ]
    assert {(a.status_code, a.json()["detail"]) for a in answers} == {(401, "password_invalid")}


def test_wrong_tries_lock_it_for_a_while(client, mailer, session):
    set_password(client, mailer)
    for _ in range(MAX_FAILURES):
        assert login(client, "Wrong-Password 1").status_code == 401
    assert login(client).status_code == 401  # locked: even the right one
    client.clock.now = SUNDAY_10AM + LOCK_FOR + timedelta(seconds=1)
    assert login(client).status_code == 200
    assert identity(session).failed_logins == 0


def test_a_right_password_clears_the_wrong_tries(client, mailer, session):
    set_password(client, mailer)
    for _ in range(MAX_FAILURES - 1):
        login(client, "Wrong-Password 1")
    assert login(client).status_code == 200
    assert identity(session).failed_logins == 0


def test_a_domain_no_longer_supported_cannot_sign_in(client, mailer, session, braude):
    set_password(client, mailer)
    session.execute(delete(InstitutionLoginRule).where(InstitutionLoginRule.value == "e.braude.ac.il"))
    session.flush()
    refused = login(client)
    assert (refused.status_code, refused.json()["detail"]) == (403, "email_domain_not_supported")


def test_a_page_on_another_site_cannot_sign_in(client, mailer):
    set_password(client, mailer)
    assert client.post(
        "/auth/password/login", json={"email": STUDENT, "password": GOOD}, headers={"Origin": "https://evil.example"}
    ).status_code == 403


def test_off_when_email_sign_in_is_off(make_client):
    client = make_client(email_login_dev_log=False)
    assert login(client).status_code == 404


@pytest.mark.parametrize(
    "body",
    [{"email": STUDENT}, {"email": STUDENT, "password": ""}, {"email": STUDENT, "password": "x" * 200}, {"email": STUDENT, "password": GOOD, "extra": 1}],
)
def test_bad_login_requests_are_refused(client, body):
    assert client.post("/auth/password/login", json=body).status_code == 422


def test_a_user_without_one_says_so(client, mailer, session):
    start(client)
    signed_in = client.post("/auth/email/verify", json={"email": STUDENT, "code": mailer.last_code()})
    assert signed_in.json()["user"]["has_password"] is False
    assert signed_in.json()["user"]["can_set_password"] is True
    assert session.get(User, identity(session).user_id) is not None


def test_a_user_who_never_used_a_code_cannot_set_one(client, session, student):
    """A Microsoft or Google student: a code would make a second account."""
    from app.api.auth import _me

    me = _me(session, student)
    assert (me.has_password, me.can_set_password) == (False, False)
