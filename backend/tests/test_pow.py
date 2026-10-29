"""Proof of work on the request for an email sign-in code.

Each request for a code sends an email, and the day's email quota is small,
so a script asking for thousands of codes could use it all up. Before the
server sends anything it asks the browser for a small piece of work (find a
number whose hash starts with some zero bits). A visitor pays about a
second; a script pays that for every request. The challenge is signed by the
server, expires, and works once.
"""

from datetime import timedelta

import pytest
from conftest import SUNDAY_10AM, Clock
from fastapi.testclient import TestClient
from test_email_sign_in import FRONTEND, STUDENT, FakeMailer, make_settings

from app.api.auth import get_mailer
from app.api.deps import get_session
from app.clock import get_now
from app.config import Settings, get_settings
from app.errors import Refusal
from app.main import app
from app.pow import CHALLENGE_LIFETIME, UsedSalts, make_challenge, solve, verify

SECRET = b"a-test-secret-that-is-at-least-32-bytes-long!!"
NOW = SUNDAY_10AM
BITS = 8  # about 256 tries: fast in a test


def code_of(refusal: pytest.ExceptionInfo[Refusal]) -> str:
    return refusal.value.code


def solved(bits: int = BITS, now=NOW):
    challenge = make_challenge(SECRET, bits, now)
    return challenge, solve(challenge.salt, challenge.bits)


# --- The check itself -------------------------------------------------------------


def test_a_solved_challenge_passes():
    challenge, nonce = solved()
    verify(SECRET, challenge, nonce, NOW, UsedSalts(), minimum_bits=BITS)


def test_a_wrong_answer_is_refused():
    challenge, nonce = solved()
    # Some other number is, with overwhelming probability, not a solution
    wrong = next(n for n in range(nonce + 1, nonce + 10_000) if n != nonce and not _is_solution(challenge, n))
    with pytest.raises(Refusal) as refusal:
        verify(SECRET, challenge, wrong, NOW, UsedSalts(), minimum_bits=BITS)
    assert code_of(refusal) == "pow_invalid"


def _is_solution(challenge, nonce: int) -> bool:
    from app.pow import leading_zero_bits, work_hash

    return leading_zero_bits(work_hash(challenge.salt, nonce)) >= challenge.bits


def test_a_changed_difficulty_breaks_the_signature():
    # An easier challenge made up by the visitor is not one the server signed
    challenge, _ = solved()
    easier = type(challenge)(challenge.salt, challenge.expires, 1, challenge.signature)
    with pytest.raises(Refusal) as refusal:
        verify(SECRET, easier, 0, NOW, UsedSalts(), minimum_bits=1)
    assert code_of(refusal) == "pow_invalid"


def test_another_servers_signature_is_refused():
    challenge, nonce = solved()
    with pytest.raises(Refusal) as refusal:
        verify(b"another-secret-that-is-also-32-bytes-long!!!", challenge, nonce, NOW, UsedSalts(), minimum_bits=BITS)
    assert code_of(refusal) == "pow_invalid"


def test_an_old_challenge_expires():
    challenge, nonce = solved()
    with pytest.raises(Refusal) as refusal:
        verify(SECRET, challenge, nonce, NOW + CHALLENGE_LIFETIME + timedelta(seconds=1), UsedSalts(), minimum_bits=BITS)
    assert code_of(refusal) == "pow_expired"


def test_a_challenge_works_once():
    challenge, nonce = solved()
    used = UsedSalts()
    verify(SECRET, challenge, nonce, NOW, used, minimum_bits=BITS)
    with pytest.raises(Refusal) as refusal:
        verify(SECRET, challenge, nonce, NOW, used, minimum_bits=BITS)
    assert code_of(refusal) == "pow_used"


def test_a_challenge_easier_than_the_current_setting_is_refused():
    # The setting was raised after this challenge was handed out
    challenge, nonce = solved(bits=4)
    with pytest.raises(Refusal) as refusal:
        verify(SECRET, challenge, nonce, NOW, UsedSalts(), minimum_bits=BITS)
    assert code_of(refusal) == "pow_invalid"


def test_the_table_of_used_challenges_forgets_expired_ones():
    used = UsedSalts(max_entries=3)
    for n in range(3):
        assert used.claim(f"s{n}", NOW + timedelta(seconds=n), NOW)
    # Past all their expiries the table is empty again, and room is made
    later = NOW + timedelta(minutes=10)
    assert used.claim("fresh", later + timedelta(minutes=5), later)
    assert len(used) == 1


def test_a_full_table_drops_its_oldest_rather_than_refusing_everyone():
    used = UsedSalts(max_entries=2)
    for n in range(3):
        assert used.claim(f"s{n}", NOW + timedelta(minutes=5), NOW)
    assert len(used) == 2


# --- On the route -----------------------------------------------------------------


@pytest.fixture
def mailer() -> FakeMailer:
    return FakeMailer()


@pytest.fixture
def make_client(session, braude, mailer):
    def build(**overrides) -> TestClient:
        settings: Settings = make_settings(**overrides)
        clock = Clock(NOW)
        app.dependency_overrides[get_session] = lambda: session
        app.dependency_overrides[get_now] = lambda: clock.now
        app.dependency_overrides[get_settings] = lambda: settings
        app.dependency_overrides[get_mailer] = lambda: mailer
        client = TestClient(app, base_url="https://testserver", headers={"Origin": FRONTEND})
        client.clock = clock
        return client

    yield build
    app.dependency_overrides.clear()


def get_challenge(client):
    response = client.get("/auth/email/challenge")
    assert response.status_code == 200
    return response.json()


def pow_body(data: dict) -> dict:
    return {"salt": data["salt"], "expires": data["expires"], "bits": data["bits"], "signature": data["signature"], "nonce": solve(data["salt"], data["bits"])}


def test_the_challenge_says_how_hard_the_work_is(make_client):
    data = get_challenge(make_client(email_pow_bits=BITS))
    assert data["bits"] == BITS
    assert {"salt", "expires", "signature"} <= data.keys()


def test_with_the_work_switched_off_the_challenge_asks_for_none(make_client):
    assert get_challenge(make_client(email_pow_bits=0))["bits"] == 0


def test_a_code_is_sent_only_with_the_work_done(make_client, mailer):
    client = make_client(email_pow_bits=BITS)
    response = client.post("/auth/email/start", json={"email": STUDENT, "pow": pow_body(get_challenge(client))})
    assert response.status_code == 202
    assert len(mailer.sent) == 1


def test_without_the_work_no_mail_is_sent(make_client, mailer):
    client = make_client(email_pow_bits=BITS)
    response = client.post("/auth/email/start", json={"email": STUDENT})
    assert (response.status_code, response.json()["detail"]) == (400, "pow_required")
    assert mailer.sent == []


def test_a_wrong_answer_sends_no_mail(make_client, mailer):
    client = make_client(email_pow_bits=BITS)
    body = pow_body(get_challenge(client))
    body["nonce"] += 1
    # One in 256 neighbours is a solution too: take a failing one
    while not _refuses(client, body):
        body["nonce"] += 1
    assert mailer.sent == []


def _refuses(client, body) -> bool:
    response = client.post("/auth/email/start", json={"email": STUDENT, "pow": body})
    return response.status_code == 400 and response.json()["detail"] == "pow_invalid"


def test_the_same_work_cannot_be_used_twice(make_client, mailer):
    client = make_client(email_pow_bits=BITS)
    body = pow_body(get_challenge(client))
    assert client.post("/auth/email/start", json={"email": STUDENT, "pow": body}).status_code == 202
    again = client.post("/auth/email/start", json={"email": "other@e.braude.ac.il", "pow": body})
    assert (again.status_code, again.json()["detail"]) == (400, "pow_used")
    assert len(mailer.sent) == 1


def test_the_work_is_checked_before_anything_else_is(make_client, mailer):
    # A made-up domain is refused for its domain only when the work is done:
    # nobody learns which domains are supported without paying for the question
    client = make_client(email_pow_bits=BITS)
    assert client.post("/auth/email/start", json={"email": "someone@elsewhere.example"}).json()["detail"] == "pow_required"


def test_with_the_work_switched_off_a_request_needs_none(make_client, mailer):
    client = make_client(email_pow_bits=0)
    assert client.post("/auth/email/start", json={"email": STUDENT}).status_code == 202

