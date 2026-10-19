"""Proving a login domain with a DNS TXT record (wave 11): the institution's
IT people add one record, and the waiting rule works without the system
admin. Anything but the exact record is no proof."""

import httpx
import pytest
from sqlalchemy import select

from app.api.auth import get_http_client
from app.dns_verify import has_proof, record_name, record_value
from app.main import app
from app.models import AuthProvider, Institution, InstitutionLoginRule, User, UserRole

TENANT = "11111111-2222-3333-4444-555555555555"
RESOLVER = "https://dns.example/dns-query"


@pytest.fixture
def tel_hai(session) -> Institution:
    institution = Institution(name="מכללת תל חי", slug="tel-hai", timezone="Asia/Jerusalem")
    session.add(institution)
    session.flush()
    return institution


@pytest.fixture
def manager(client, session, tel_hai):
    admin = User(institution_id=tel_hai.id, email="a@gmail.com", display_name="A", role=UserRole.INSTITUTION_ADMIN)
    session.add(admin)
    session.flush()
    client.user = admin
    return client


def answer(*texts: str, status: int = 0) -> dict:
    return {"Status": status, "Answer": [{"name": "x", "type": 16, "TTL": 300, "data": t} for t in texts]}


def resolver(body=None, code=200, seen=None):
    def handle(request: httpx.Request) -> httpx.Response:
        if seen is not None:
            seen.append(request)
        return httpx.Response(code, json=body if body is not None else answer())

    return httpx.Client(transport=httpx.MockTransport(handle))


@pytest.fixture
def dns():
    """What the resolver answers, set by each test."""
    state = {"body": answer(), "code": 200, "seen": []}
    app.dependency_overrides[get_http_client] = lambda: resolver(state["body"], state["code"], state["seen"])
    yield state
    app.dependency_overrides.pop(get_http_client, None)


def add_rule(client, value="telhai.ac.il", provider="email"):
    response = client.post("/admin/institutions/tel-hai/login-rules", json={"provider": provider, "value": value})
    assert response.status_code == 201, response.text
    return response.json()


def verify(client, rule_id):
    return client.post(f"/admin/login-rules/{rule_id}/verify")


# --- the lookup itself ------------------------------------------------------------------


def test_the_exact_record_is_proof():
    token = "ab" * 16
    seen = []
    http = resolver(answer('"other=1"', f'"{record_value(token)}"'), seen=seen)
    assert has_proof(http, RESOLVER, "telhai.ac.il", token)
    assert seen[0].url.params["name"] == "_studyspot.telhai.ac.il" and seen[0].url.params["type"] == "TXT"
    assert seen[0].headers["accept"] == "application/dns-json"


def test_a_long_record_in_pieces_is_joined():
    token = "cd" * 16
    value = record_value(token)
    assert has_proof(resolver(answer(f'"{value[:20]}" "{value[20:]}"')), RESOLVER, "x.ac.il", token)


@pytest.mark.parametrize(
    "body,code",
    [
        (answer('"studyspot-verify=wrong"'), 200),
        (answer(), 200),
        (answer('"studyspot-verify=' + "ab" * 16 + '"', status=3), 200),  # NXDOMAIN
        ({"Answer": "nonsense"}, 200),
        ([1, 2], 200),
        (answer('"studyspot-verify=' + "ab" * 16 + '"'), 500),
    ],
)
def test_anything_else_is_no_proof(body, code):
    assert not has_proof(resolver(body, code), RESOLVER, "telhai.ac.il", "ab" * 16)


def test_a_record_of_another_type_is_no_proof():
    token = "ab" * 16
    body = {"Status": 0, "Answer": [{"type": 5, "data": record_value(token)}]}  # a CNAME
    assert not has_proof(resolver(body), RESOLVER, "telhai.ac.il", token)


def test_a_resolver_that_fails_is_no_proof():
    def fail(request):
        raise httpx.ConnectError("down")

    assert not has_proof(httpx.Client(transport=httpx.MockTransport(fail)), RESOLVER, "telhai.ac.il", "ab" * 16)


# --- the endpoint ---------------------------------------------------------------------


def test_a_waiting_email_rule_shows_the_record_to_add(manager):
    rule = add_rule(manager)
    assert rule["approved"] is False
    assert rule["verify_record"] == record_name("telhai.ac.il") == "_studyspot.telhai.ac.il"
    assert rule["verify_value"].startswith("studyspot-verify=") and len(rule["verify_value"]) == 17 + 32
    assert "verify_token" not in rule


def test_the_record_approves_the_rule(manager, session, dns):
    rule = add_rule(manager)
    dns["body"] = answer(f'"{rule["verify_value"]}"')
    response = verify(manager, rule["id"])
    assert response.status_code == 200, response.text
    assert response.json()["approved"] is True and response.json()["verify_record"] is None
    row = session.get(InstitutionLoginRule, rule["id"])
    session.refresh(row)
    assert (row.approved, row.verify_token) == (True, None)


def test_no_record_yet_says_so_and_leaves_it_waiting(manager, session, dns):
    rule = add_rule(manager)
    refused = verify(manager, rule["id"])
    assert (refused.status_code, refused.json()["detail"]) == (409, "dns_record_not_found")
    assert session.get(InstitutionLoginRule, rule["id"]).approved is False


def test_another_institutions_record_proves_nothing_here(manager, session, dns, tel_hai):
    """Two institutions ask for the same domain: each has its own token, and
    only the one whose token is in the DNS gets it."""
    rival = Institution(name="מזויף", slug="fake", timezone="Asia/Jerusalem")
    session.add(rival)
    session.flush()
    theirs = InstitutionLoginRule(institution_id=rival.id, provider=AuthProvider.EMAIL, value="telhai.ac.il",
                                  approved=False, verify_token="ff" * 16)
    session.add(theirs)
    session.flush()
    ours = add_rule(manager)
    dns["body"] = answer(f'"{ours["verify_value"]}"')
    assert verify(manager, ours["id"]).status_code == 200
    # The rival's waiting rule for the same domain is gone (approve_login_rule).
    assert session.scalars(select(InstitutionLoginRule).where(InstitutionLoginRule.institution_id == rival.id)).all() == []


def test_someone_elses_rule_is_not_found(manager, session, dns):
    rival = Institution(name="אחר", slug="other", timezone="Asia/Jerusalem")
    session.add(rival)
    session.flush()
    rule = InstitutionLoginRule(institution_id=rival.id, provider=AuthProvider.EMAIL, value="other.ac.il",
                                approved=False, verify_token="ee" * 16)
    session.add(rule)
    session.flush()
    dns["body"] = answer(f'"{record_value("ee" * 16)}"')
    refused = verify(manager, rule.id)
    assert (refused.status_code, refused.json()["detail"]) == (404, "login_rule_not_found")
    assert dns["seen"] == []  # not even asked


def test_a_microsoft_tenant_cannot_be_proved_this_way(manager, dns):
    rule = add_rule(manager, TENANT, "microsoft")
    assert rule["verify_record"] is None
    assert verify(manager, rule["id"]).json()["detail"] == "login_rule_not_verifiable"


def test_an_approved_rule_needs_no_proof(manager, session, dns):
    rule = add_rule(manager)
    session.get(InstitutionLoginRule, rule["id"]).approved = True
    session.flush()
    assert verify(manager, rule["id"]).json()["detail"] == "login_rule_not_verifiable"


def test_a_student_cannot(client, session, tel_hai, dns):
    rule = InstitutionLoginRule(institution_id=tel_hai.id, provider=AuthProvider.EMAIL, value="telhai.ac.il",
                                approved=False, verify_token="ab" * 16)
    session.add(rule)
    session.flush()
    assert verify(client, rule.id).status_code == 403


def test_tries_are_limited(manager, dns):
    rule = add_rule(manager)
    codes = [verify(manager, rule["id"]).status_code for _ in range(7)]
    assert codes[:6] == [409] * 6 and codes[6] == 429


def teardown_module():
    app.dependency_overrides.clear()


def test_a_closing_institution_proves_nothing(manager, session, dns, tel_hai):
    from datetime import UTC, datetime

    rule = add_rule(manager)
    tel_hai.closes_at = datetime(2026, 11, 1, tzinfo=UTC)
    session.flush()
    dns["body"] = answer(f'"{rule["verify_value"]}"')
    refused = verify(manager, rule["id"])
    assert (refused.status_code, refused.json()["detail"]) == (409, "institution_closing")
    assert dns["seen"] == []


def test_the_open_campus_cannot_be_closed_by_a_rule(manager, session, dns, tel_hai, monkeypatch):
    """An approved rule ends an open campus being open (app/accounts.py)."""
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "open_sign_in_institution", "tel-hai")
    rule = add_rule(manager)
    dns["body"] = answer(f'"{rule["verify_value"]}"')
    refused = verify(manager, rule["id"])
    assert (refused.status_code, refused.json()["detail"]) == (403, "demo_campus_locked")
