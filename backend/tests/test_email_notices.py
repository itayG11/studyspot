"""Notices by email (wave 11): only to a proved address, only when the user
asked, only when no browser got the push, within a daily budget, and with a
signed link that turns them off."""

from datetime import timedelta

import httpx
from conftest import SUNDAY_10AM
from factories import make_institution, make_user
from fastapi.testclient import TestClient
from test_push import Browser, sender, subscribe

from app.accounts import sign_in
from app.config import get_settings
from app.demo import Persona, demo_user
from app.mailer import BrevoMailer
from app.main import app
from app.models import AuthProvider, NoticeEmail
from app.notify import (
    EMAILS_PER_DAY,
    EMAILS_PER_USER_DAY,
    EmailSender,
    Notice,
    notify,
    read_unsubscribe_token,
    unsubscribe_key,
    unsubscribe_token,
)
from app.oidc import ProviderIdentity

KEY = unsubscribe_key(b"x" * 32)
NOTICE = Notice("ההזמנה שלך מתחילה בקרוב", "EM107, ב-11:00.", "/me")


class FakeMailer:
    def __init__(self):
        self.sent: list[tuple[str, str, str, dict]] = []

    def send(self, to, subject, text, headers=None):
        self.sent.append((to, subject, text, headers or {}))


def channel(mailer=None) -> EmailSender:
    return EmailSender(mailer or FakeMailer(), "https://site.example", KEY)


def opted_in(session, braude, email="student@e.braude.ac.il"):
    user = make_user(session, braude, email)
    user.email_verified, user.email_notices = True, True
    session.flush()
    return user


def test_an_email_when_no_browser_is_subscribed(session, braude):
    user, email = opted_in(session, braude), channel()
    assert notify(session, user.id, NOTICE, None, email, SUNDAY_10AM) == 1
    [(to, subject, text, headers)] = email.mailer.sent
    assert to == user.email and subject == NOTICE.title
    assert "EM107" in text and "https://site.example/me" in text
    token = unsubscribe_token(KEY, user.id)
    assert f"https://site.example/unsubscribe#t={token}" in text
    assert headers["List-Unsubscribe"] == f"<https://site.example/api/notices/unsubscribe?t={token}>"
    assert headers["List-Unsubscribe-Post"] == "List-Unsubscribe=One-Click"


def test_no_email_when_a_browser_got_it(session, braude):
    user, email, seen = opted_in(session, braude), channel(), []
    subscribe(session, user, Browser())
    assert notify(session, user.id, NOTICE, sender(seen), email, SUNDAY_10AM) == 1
    assert len(seen) == 1 and email.mailer.sent == []


def test_an_email_when_the_push_service_fails(session, braude):
    user, email = opted_in(session, braude), channel()
    subscribe(session, user, Browser())
    assert notify(session, user.id, NOTICE, sender([], status=500), email, SUNDAY_10AM) == 1
    assert len(email.mailer.sent) == 1


def test_no_email_unless_asked_and_proved(session, braude):
    email = channel()
    asked_not_proved = make_user(session, braude, "a@example.com")
    asked_not_proved.email_notices = True
    proved_not_asked = make_user(session, braude, "b@example.com")
    proved_not_asked.email_verified = True
    session.flush()
    for user in (asked_not_proved, proved_not_asked):
        assert notify(session, user.id, NOTICE, None, email, SUNDAY_10AM) == 0
    assert email.mailer.sent == []


def test_a_user_gets_a_few_a_day(session, braude):
    user, email = opted_in(session, braude), channel()
    for n in range(EMAILS_PER_USER_DAY + 2):
        notify(session, user.id, NOTICE, None, email, SUNDAY_10AM + timedelta(minutes=n))
    assert len(email.mailer.sent) == EMAILS_PER_USER_DAY
    # A day later the count starts again.
    assert notify(session, user.id, NOTICE, None, email, SUNDAY_10AM + timedelta(days=1, minutes=5)) == 1


def test_the_site_sends_at_most_its_daily_budget(session, braude):
    email = channel()
    users = [opted_in(session, braude, f"s{n}@e.braude.ac.il") for n in range(EMAILS_PER_DAY + 1)]
    for user in users:
        notify(session, user.id, NOTICE, None, email, SUNDAY_10AM)
    assert len(email.mailer.sent) == EMAILS_PER_DAY
    assert session.query(NoticeEmail).count() == EMAILS_PER_DAY


def test_a_failed_send_is_not_counted_as_delivered(session, braude):
    user = opted_in(session, braude)
    http = httpx.Client(transport=httpx.MockTransport(lambda request: httpx.Response(500)))
    email = channel(BrevoMailer(http, api_key="k", sender="noreply@site.example"))
    assert notify(session, user.id, NOTICE, None, email, SUNDAY_10AM) == 0


def test_brevo_gets_the_unsubscribe_headers(session, braude):
    user, seen = opted_in(session, braude), []

    def handle(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(201)

    http = httpx.Client(transport=httpx.MockTransport(handle))
    email = channel(BrevoMailer(http, api_key="k", sender="noreply@site.example"))
    notify(session, user.id, NOTICE, None, email, SUNDAY_10AM)
    import json

    body = json.loads(seen[0].content)
    assert body["headers"]["List-Unsubscribe-Post"] == "List-Unsubscribe=One-Click"
    assert "htmlContent" not in body  # plain text: no tracking pixel


def test_the_token_is_ours_and_for_one_user():
    token = unsubscribe_token(KEY, 42)
    assert read_unsubscribe_token(KEY, token) == 42
    assert read_unsubscribe_token(unsubscribe_key(b"y" * 32), token) is None
    forged = "43" + token[2:]
    assert read_unsubscribe_token(KEY, forged) is None
    for junk in ("", "abc", "42", "42.", "-1.x", "9" * 40 + ".x"):
        assert read_unsubscribe_token(KEY, junk) is None


# --- who counts as proved --------------------------------------------------------


def test_a_code_sign_in_proves_the_address(session, braude):
    identity = ProviderIdentity("s@e.braude.ac.il", "e.braude.ac.il", "s@e.braude.ac.il", "S")
    user = sign_in(session, AuthProvider.EMAIL, identity, SUNDAY_10AM)
    assert user.email_verified


def test_a_microsoft_sign_in_does_not_prove_the_address(session):
    open_campus = make_institution(session, "open-campus")
    ms = ProviderIdentity("tid:oid", None, "someone@outlook.com", "S")
    user = sign_in(session, AuthProvider.MICROSOFT, ms, SUNDAY_10AM, open_slug=open_campus.slug)
    assert not user.email_verified


def test_a_sign_in_that_proves_nothing_turns_email_off(session):
    open_campus = make_institution(session, "open-campus")
    google = ProviderIdentity("g-sub", None, "me@gmail.com", "Me", email_verified=True)
    user = sign_in(session, AuthProvider.GOOGLE, google, SUNDAY_10AM, open_slug=open_campus.slug)
    assert user.email_verified
    user.email_notices = True
    unverified = ProviderIdentity("g-sub", None, "me@gmail.com", "Me", email_verified=False)
    sign_in(session, AuthProvider.GOOGLE, unverified, SUNDAY_10AM, open_slug=open_campus.slug)
    assert not user.email_verified and not user.email_notices


# --- the addresses -----------------------------------------------------------------


def mail_on(monkeypatch):
    monkeypatch.setenv("EMAIL_LOGIN_DEV_LOG", "true")
    get_settings.cache_clear()


def test_turning_it_on_and_off(client: TestClient, session, student, monkeypatch):
    mail_on(monkeypatch)
    student.email_verified = True
    session.flush()
    assert client.get("/me/email-notices").json() == {
        "enabled": False, "available": True, "reason": None, "address": student.email,
    }
    assert client.post("/me/email-notices", json={"enabled": True}).json()["enabled"] is True
    assert student.email_notices
    assert client.post("/me/email-notices", json={"enabled": False}).json()["enabled"] is False


def test_an_unproved_address_cannot_turn_it_on(client: TestClient, monkeypatch):
    mail_on(monkeypatch)
    assert client.get("/me/email-notices").json()["reason"] == "unverified"
    refused = client.post("/me/email-notices", json={"enabled": True})
    assert (refused.status_code, refused.json()["detail"]) == (409, "email_notices_unverified")


def test_without_a_mailer_it_is_off(client: TestClient, session, student):
    student.email_verified = True
    session.flush()
    assert client.get("/me/email-notices").json()["reason"] == "off"
    assert client.post("/me/email-notices", json={"enabled": True}).status_code == 409


def test_the_shared_demo_student_cannot_turn_it_on(client: TestClient, session, monkeypatch):
    mail_on(monkeypatch)
    demo = make_institution(session, "demo-campus")
    client.user = demo_user(session, demo.slug, Persona.STUDENT, SUNDAY_10AM)
    client.user.email_verified = True
    refused = client.post("/me/email-notices", json={"enabled": True})
    assert (refused.status_code, refused.json()["detail"]) == (403, "push_demo_account")


def test_the_link_turns_it_off_without_signing_in(client: TestClient, session, student, monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "s" * 40)
    get_settings.cache_clear()
    student.email_verified, student.email_notices = True, True
    session.flush()
    client.user = None
    token = unsubscribe_token(unsubscribe_key(get_settings().jwt_secret_bytes()), student.id)
    assert client.post(f"/notices/unsubscribe?t={token}").status_code == 204
    assert not student.email_notices
    assert client.post(f"/notices/unsubscribe?t={token}").status_code == 204  # again: still fine
    forged = client.post(f"/notices/unsubscribe?t={student.id}.{'0' * 32}")
    assert (forged.status_code, forged.json()["detail"]) == (404, "unsubscribe_invalid")


def test_signed_out_cannot_read_or_set(client: TestClient):
    client.user = None
    assert client.get("/me/email-notices").status_code == 401
    assert client.post("/me/email-notices", json={"enabled": True}).status_code == 401


def teardown_module():
    app.dependency_overrides.clear()


def test_the_sweep_forgets_old_counts(session, braude):
    from app.sweeper import NOTICE_EMAILS_KEPT, sweep

    user = opted_in(session, braude)
    session.add_all([NoticeEmail(user_id=user.id, sent_at=SUNDAY_10AM - NOTICE_EMAILS_KEPT - timedelta(minutes=1)),
                     NoticeEmail(user_id=user.id, sent_at=SUNDAY_10AM - timedelta(hours=1))])
    session.flush()
    sweep(session, SUNDAY_10AM)
    assert session.query(NoticeEmail).count() == 1
