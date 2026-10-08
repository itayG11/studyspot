"""Sign-in with a one-time code sent by email.

A student types their college address, gets a 6-digit code by email, and
types it back. Which institution they join comes from the address's domain
(an "email" login rule); only those domains get a code, so the site cannot
be used to send mail to anyone else. The database keeps an HMAC of the
code, never the code.
"""

from datetime import timedelta

import pytest
from conftest import SUNDAY_10AM, Clock
from factories import assert_rejected
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import func, select

from app.api.auth import get_mailer
from app.api.deps import get_session
from app.clock import get_now
from app.config import Settings, get_settings
from app.email_codes import CODE_LIFETIME, MAX_ATTEMPTS, hash_code, normalize_email
from app.errors import Refusal
from app.mailer import BrevoMailer
from app.main import app
from app.models import AuthProvider, EmailSignInCode, InstitutionLoginRule, User, UserIdentity, UserRole
from app.seed import seed_demo

FRONTEND = "https://app.example"
STUDENT = "Itay.Gabay@e.braude.ac.il"


class FakeMailer:
    """Keeps the sent codes instead of sending them."""

    def __init__(self):
        self.sent: list[tuple[str, str]] = []
        self.fail = False

    def send_code(self, to: str, code: str) -> None:
        if self.fail:
            raise Refusal(502, "email_not_sent")
        self.sent.append((to, code))

    def last_code(self) -> str:
        return self.sent[-1][1]


def make_settings(**overrides) -> Settings:
    defaults = {
        "public_api_url": "https://testserver",
        "frontend_url": FRONTEND,
        "email_login_dev_log": True,
    }
    return Settings(
        database_url="postgresql+psycopg://unused@localhost/unused",
        jwt_secret="test-jwt-secret-that-is-long-enough-0123456789",
        _env_file=None,
        **{**defaults, **overrides},
    )


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


def start(client, email=STUDENT):
    return client.post("/auth/email/start", json={"email": email})


def verify(client, code, email=STUDENT):
    return client.post("/auth/email/verify", json={"email": email, "code": code})


# --- The rules in the database ----------------------------------------------------


def test_braude_signs_in_by_its_two_email_domains(braude):
    rules = {(r.provider, r.value) for r in braude.login_rules}
    assert (AuthProvider.EMAIL, "e.braude.ac.il") in rules  # students
    assert (AuthProvider.EMAIL, "braude.ac.il") in rules  # staff


def test_an_email_login_rule_is_allowed(session, braude):
    session.add(InstitutionLoginRule(institution_id=braude.id, provider=AuthProvider.EMAIL, value="x.example"))
    session.flush()


def test_a_code_row_is_lowercase_and_expires_after_creation(session):
    def row(**kw):
        values = {
            "email": "a@e.braude.ac.il",
            "code_hash": "0" * 64,
            "created_at": SUNDAY_10AM,
            "expires_at": SUNDAY_10AM + CODE_LIFETIME,
            **kw,
        }
        return EmailSignInCode(**values)

    assert_rejected(session, lambda: session.add(row(email="A@e.braude.ac.il")), "ck_email_sign_in_codes_email_lowercase")
    assert_rejected(session, lambda: session.add(row(expires_at=SUNDAY_10AM)), "ck_email_sign_in_codes_expires_after_creation")
    assert_rejected(session, lambda: session.add(row(attempts=-1)), "ck_email_sign_in_codes_attempts_not_negative")


def test_the_code_hash_depends_on_the_secret_the_email_and_the_code():
    base = hash_code(b"secret-one", "a@e.braude.ac.il", "123456")
    assert len(base) == 64
    assert base == hash_code(b"secret-one", "a@e.braude.ac.il", "123456")
    assert base != hash_code(b"secret-two", "a@e.braude.ac.il", "123456")
    assert base != hash_code(b"secret-one", "b@e.braude.ac.il", "123456")
    assert base != hash_code(b"secret-one", "a@e.braude.ac.il", "123457")


@pytest.mark.parametrize(
    "raw, clean",
    [("  Itay.Gabay@E.Braude.AC.IL ", "itay.gabay@e.braude.ac.il"), ("a@braude.ac.il", "a@braude.ac.il")],
)
def test_emails_are_trimmed_and_lowercased(raw, clean):
    assert normalize_email(raw) == clean


@pytest.mark.parametrize(
    "raw", ["", "no-at-sign", "a@b@e.braude.ac.il", "@e.braude.ac.il", "a@", "a b@e.braude.ac.il", "a@localhost"]
)
def test_malformed_emails_are_refused(raw):
    with pytest.raises(Refusal) as refused:
        normalize_email(raw)
    assert refused.value.code == "invalid_email"


# --- Asking for a code --------------------------------------------------------------


def test_a_braude_student_gets_a_six_digit_code(client, mailer, session):
    response = start(client)
    assert response.status_code == 202
    assert len(mailer.sent) == 1
    to, code = mailer.sent[0]
    assert to == "itay.gabay@e.braude.ac.il"
    assert code.isdigit() and len(code) == 6
    stored = session.scalars(select(EmailSignInCode)).one()
    assert stored.code_hash != code and code not in stored.code_hash  # only the HMAC is kept
    assert stored.expires_at == SUNDAY_10AM + CODE_LIFETIME


def test_an_address_of_another_domain_gets_no_email(client, mailer, session):
    # Otherwise anyone could make the site mail any address.
    response = start(client, "someone@gmail.com")
    assert response.status_code == 403
    assert response.json()["detail"] == "email_domain_not_supported"
    assert mailer.sent == []


def test_a_subdomain_is_not_its_parent_domain(client, mailer):
    assert start(client, "a@evil.e.braude.ac.il").status_code == 403
    assert start(client, "a@e.braude.ac.il.evil.com").status_code == 403
    assert mailer.sent == []


def test_a_new_and_a_known_student_get_the_same_answer(client, mailer):
    # The answer never says whether an account exists.
    first = start(client)
    verify(client, mailer.last_code())
    second = start(client)
    assert first.status_code == second.status_code == 202
    assert first.json() == second.json()


def test_a_page_on_another_site_cannot_ask_for_codes(client, mailer):
    response = client.post("/auth/email/start", json={"email": STUDENT}, headers={"Origin": "https://evil.example"})
    assert response.status_code == 403
    assert mailer.sent == []


def test_codes_per_address_are_limited(client, mailer):
    for _ in range(5):
        assert start(client).status_code == 202
    response = start(client)
    assert response.status_code == 429
    assert response.json()["detail"] == "too_many_codes"
    assert len(mailer.sent) == 5
    client.clock.now += timedelta(hours=1, seconds=1)
    assert start(client).status_code == 202


def test_codes_for_the_whole_site_are_capped_per_day(client, mailer, monkeypatch):
    # The free email plan sends 300 a day; the site stops below that.
    from app import email_codes

    monkeypatch.setattr(email_codes, "CODES_PER_DAY", 2)
    assert start(client, "a@e.braude.ac.il").status_code == 202
    assert start(client, "b@e.braude.ac.il").status_code == 202
    response = start(client, "c@e.braude.ac.il")
    assert response.status_code == 429
    assert response.json()["detail"] == "email_daily_limit"


def test_a_failed_email_leaves_no_code_behind(client, mailer, session):
    mailer.fail = True
    response = start(client)
    assert response.status_code == 502
    assert response.json()["detail"] == "email_not_sent"
    assert session.scalar(select(func.count()).select_from(EmailSignInCode)) == 0


def test_email_sign_in_is_off_without_a_mail_service(make_client, mailer):
    client = make_client(email_login_dev_log=False)
    assert start(client).status_code == 404
    assert client.get("/auth/providers").json()["email"] is False
    assert mailer.sent == []


def test_the_providers_list_says_email_sign_in_is_on(client):
    assert client.get("/auth/providers").json()["email"] is True


@pytest.mark.parametrize("body", [{}, {"email": "x" * 400 + "@e.braude.ac.il"}, {"email": STUDENT, "extra": 1}])
def test_bad_start_requests_are_refused(client, body, mailer):
    assert client.post("/auth/email/start", json=body).status_code == 422
    assert mailer.sent == []


# --- Typing the code back ---------------------------------------------------------------


def test_the_right_code_signs_a_new_student_in_to_braude(client, mailer, session, braude):
    start(client)
    response = verify(client, mailer.last_code())
    assert response.status_code == 200, response.json()
    body = response.json()
    assert body["user"]["institution_slug"] == "braude"
    assert body["user"]["role"] == "student"
    assert body["user"]["email"] == "itay.gabay@e.braude.ac.il"
    assert body["user"]["display_name"] == "Itay Gabay"
    assert "studyspot_refresh" in response.cookies
    identity = session.scalars(select(UserIdentity).where(UserIdentity.provider == AuthProvider.EMAIL)).one()
    assert identity.subject == "itay.gabay@e.braude.ac.il"
    me = client.get("/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.json()["id"] == body["user"]["id"]


def test_a_staff_address_joins_braude_as_a_student_too(client, mailer):
    # The address says where someone belongs, never what they may manage.
    start(client, "lecturer@braude.ac.il")
    body = verify(client, mailer.last_code(), "lecturer@braude.ac.il").json()
    assert body["user"]["institution_slug"] == "braude"
    assert body["user"]["role"] == UserRole.STUDENT


def test_signing_in_again_is_the_same_user(client, mailer, session):
    start(client)
    first = verify(client, mailer.last_code()).json()["user"]["id"]
    start(client, "  ITAY.GABAY@e.braude.ac.il")
    second = verify(client, mailer.last_code(), "itay.gabay@E.braude.ac.il").json()["user"]["id"]
    assert first == second
    assert session.scalar(select(func.count()).select_from(User).where(User.email == "itay.gabay@e.braude.ac.il")) == 1


def test_a_code_works_once(client, mailer):
    start(client)
    code = mailer.last_code()
    assert verify(client, code).status_code == 200
    response = verify(client, code)
    assert response.status_code == 400
    assert response.json()["detail"] == "invalid_code"


def test_a_code_expires_after_ten_minutes(client, mailer):
    start(client)
    client.clock.now += CODE_LIFETIME
    response = verify(client, mailer.last_code())
    assert response.status_code == 400
    assert response.json()["detail"] == "invalid_code"


def test_only_the_newest_code_counts(client, mailer):
    start(client)
    old = mailer.last_code()
    start(client)
    new = mailer.last_code()
    if old != new:
        assert verify(client, old).status_code == 400
    assert verify(client, new).status_code == 200


def test_a_wrong_code_is_refused(client, mailer):
    start(client)
    wrong = "000000" if mailer.last_code() != "000000" else "111111"
    response = verify(client, wrong)
    assert response.status_code == 400
    assert response.json()["detail"] == "invalid_code"


def test_after_five_wrong_tries_even_the_right_code_is_refused(client, mailer):
    start(client)
    right = mailer.last_code()
    wrong = "000000" if right != "000000" else "111111"
    for _ in range(MAX_ATTEMPTS):
        assert verify(client, wrong).status_code == 400
    response = verify(client, right)
    assert response.status_code == 400
    assert response.json()["detail"] == "too_many_attempts"


def test_a_code_belongs_to_its_address(client, mailer):
    start(client, "a@e.braude.ac.il")
    response = verify(client, mailer.last_code(), "b@e.braude.ac.il")
    assert response.status_code == 400
    assert response.json()["detail"] == "invalid_code"


def test_no_code_was_asked_for(client):
    response = verify(client, "123456")
    assert response.status_code == 400
    assert response.json()["detail"] == "invalid_code"


@pytest.mark.parametrize("code", ["12345", "1234567", "abcdef", "12 456", ""])
def test_a_code_is_exactly_six_digits(client, code):
    assert verify(client, code).status_code == 422


def test_a_page_on_another_site_cannot_verify(client, mailer):
    start(client)
    response = client.post(
        "/auth/email/verify",
        json={"email": STUDENT, "code": mailer.last_code()},
        headers={"Origin": "https://evil.example"},
    )
    assert response.status_code == 403


def test_a_user_of_another_institution_with_the_same_address_is_refused(client, mailer, session):
    # An email identity that somehow sits in another institution is not moved.
    other = seed_demo(session)
    user = User(institution_id=other.id, email="itay.gabay@e.braude.ac.il", display_name="X")
    session.add(user)
    session.flush()
    session.add(UserIdentity(user_id=user.id, provider=AuthProvider.EMAIL, subject="itay.gabay@e.braude.ac.il"))
    session.flush()
    start(client)
    response = verify(client, mailer.last_code())
    assert response.status_code == 403
    assert response.json()["detail"] == "institution_not_supported"


# --- The real mail service, with its HTTP calls faked ----------------------------------


def test_brevo_is_called_with_the_key_in_a_header_and_the_code_in_the_body():
    import httpx

    seen: list[httpx.Request] = []

    def handle(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(201, json={"messageId": "<x@brevo>"})

    http = httpx.Client(transport=httpx.MockTransport(handle))
    BrevoMailer(http, api_key="test-key", sender="noreply@studyspot.example").send_code("a@e.braude.ac.il", "123456")
    (request,) = seen
    assert str(request.url) == "https://api.brevo.com/v3/smtp/email"
    assert request.headers["api-key"] == "test-key"
    body = request.read().decode()
    assert "123456" in body and "a@e.braude.ac.il" in body and "noreply@studyspot.example" in body
    assert "test-key" not in body


def test_a_brevo_error_becomes_email_not_sent():
    import httpx

    http = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(401, json={"code": "unauthorized"})))
    with pytest.raises(Refusal) as refused:
        BrevoMailer(http, api_key="bad", sender="noreply@studyspot.example").send_code("a@e.braude.ac.il", "123456")
    assert refused.value.code == "email_not_sent"


def test_brevo_needs_a_sender_address():
    with pytest.raises(ValidationError, match="EMAIL_SENDER"):
        make_settings(email_login_dev_log=False, brevo_api_key="k" * 40)


def test_codes_are_never_printed_to_a_deployed_sites_log():
    with pytest.raises(ValidationError, match="EMAIL_LOGIN_DEV_LOG"):
        make_settings(site_url="https://studyspot.example")


def test_empty_mail_settings_mean_email_sign_in_is_off():
    settings = make_settings(email_login_dev_log=False, brevo_api_key="", email_sender=" ")
    assert settings.email_login_enabled() is False
