"""Wave 14.5: the demo campus's webhook tester, a receiver on our own site."""

import socket
from datetime import timedelta
from urllib.parse import urlsplit

import httpx
import pytest
from conftest import SUNDAY_10AM
from sqlalchemy import func, select

from app import campus_admin, webhook_tester, webhooks
from app.config import Settings, get_settings
from app.main import app
from app.models import User, UserRole, WebhookDelivery, WebhookTestHit
from app.seed import seed_demo

KEY = webhooks.webhook_key(get_settings().jwt_secret_bytes())


@pytest.fixture
def demo(session):
    return seed_demo(session)


@pytest.fixture
def demo_admin(session, demo) -> User:
    user = User(institution_id=demo.id, email="d@studyspot.invalid", display_name="D", role=UserRole.INSTITUTION_ADMIN)
    session.add(user)
    session.flush()
    return user


@pytest.fixture
def demo_on(client):
    settings = Settings(
        database_url="postgresql+psycopg://unused@localhost/unused",
        demo_login_enabled=True,
        webhook_allow_private=True,  # the tester's address is localhost here
        public_api_url="http://localhost:8000",
        jwt_secret=get_settings().jwt_secret,
        _env_file=None,
    )
    app.dependency_overrides[get_settings] = lambda: settings
    return settings


@pytest.fixture
def wire(client, session):
    """Deliveries reach the tester as they would over HTTP: same body, same headers."""

    def forward(request: httpx.Request) -> httpx.Response:
        endpoint_id = int(urlsplit(str(request.url)).path.rsplit("/", 1)[1])
        headers = {k.lower(): v for k, v in request.headers.items()}
        answered = webhook_tester.receive(session, endpoint_id, request.content, headers, client.clock.now, KEY)
        return httpx.Response(answered or 404)

    app.dependency_overrides[webhooks.get_transport] = lambda: httpx.MockTransport(forward)
    app.dependency_overrides[webhooks.get_resolver] = lambda: (
        lambda host, port, type=0: [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", port))]
    )


def _open(client, demo_admin):
    client.user = demo_admin
    answer = client.get("/admin/institutions/demo/webhook-tester")
    assert answer.status_code == 200, answer.text
    return answer.json()


def test_opening_it_makes_the_built_in_address_once(client, session, demo, demo_admin, demo_on):
    first = _open(client, demo_admin)
    assert first["webhook"]["built_in"] is True
    assert first["webhook"]["url"] == f"http://localhost:8000/v1/webhook-tester/{first['webhook']['id']}"
    assert set(first["webhook"]["events"]) == set(webhooks.EVENTS)
    assert _open(client, demo_admin)["webhook"]["id"] == first["webhook"]["id"]


def test_a_sample_arrives_signed_and_is_shown(client, demo, demo_admin, demo_on, wire):
    _open(client, demo_admin)
    sent = client.post("/admin/institutions/demo/webhook-tester/send").json()
    assert (sent["status"], sent["last_status_code"]) == ("sent", 200)
    [hit] = _open(client, demo_admin)["hits"]
    assert hit["signature_ok"] is True and hit["answered"] == 200
    assert hit["event_type"] == "checkin.started" and hit["event_id"] == sent["event_id"]
    assert '"occupied"' in hit["body"] and "\n" in hit["body"]  # pretty-printed
    assert set(hit["headers"]) >= {"studyspot-signature", "studyspot-event", "studyspot-delivery"}


def test_failing_shows_a_try_again_then_sending_again_works(client, demo, demo_admin, demo_on, wire):
    _open(client, demo_admin)
    client.patch("/admin/institutions/demo/webhook-tester", json={"failing": True})
    failed = client.post("/admin/institutions/demo/webhook-tester/send").json()
    assert (failed["status"], failed["last_status_code"]) == ("pending", 503)
    assert failed["next_attempt_at"] is not None
    client.patch("/admin/institutions/demo/webhook-tester", json={"failing": False})
    again = client.post(f"/admin/webhook-deliveries/{failed['id']}/redeliver").json()
    assert again["status"] == "sent" and again["event_id"] == failed["event_id"]
    assert [h["answered"] for h in _open(client, demo_admin)["hits"]] == [200, 503]


def test_a_bad_signature_is_refused_and_not_kept(client, session, demo, demo_admin, demo_on):
    endpoint_id = _open(client, demo_admin)["webhook"]["id"]
    client.user = None  # a delivery, not a person
    answer = client.post(
        f"/v1/webhook-tester/{endpoint_id}",
        content=b'{"type":"checkin.started"}',
        headers={"StudySpot-Signature": "t=1,v1=00", "StudySpot-Event": "checkin.started"},
    )
    assert (answer.status_code, answer.json()["detail"]) == (401, "webhook_signature_invalid")
    # Unsigned posts never push the real deliveries out of the list.
    assert _open(client, demo_admin)["hits"] == []


def test_samples_have_a_cap_for_the_whole_site(client, demo, demo_admin, demo_on, wire, monkeypatch):
    from app.api import webhook_tester as tester_api

    _open(client, demo_admin)
    monkeypatch.setattr(tester_api._samples, "limit", 1)
    assert client.post("/admin/institutions/demo/webhook-tester/send").status_code == 200
    assert client.post("/admin/institutions/demo/webhook-tester/send").status_code == 429


def test_only_a_built_in_address_receives(client, session, demo, demo_admin, demo_on):
    from app.models import WebhookEndpoint

    other = WebhookEndpoint(
        institution_id=demo.id, url="https://x.example", events=["checkin.started"], created_at=SUNDAY_10AM
    )
    session.add(other)
    session.flush()
    client.user = None
    assert client.post(f"/v1/webhook-tester/{other.id}", content=b"{}").status_code == 404
    assert client.post("/v1/webhook-tester/999999", content=b"{}").status_code == 404


def test_only_the_last_twenty_are_kept_and_an_hour_at_most(session, demo, demo_admin):
    endpoint = webhook_tester.ensure_tester(session, demo, "http://localhost:8000", SUNDAY_10AM)
    secret = webhooks.secret_for(KEY, endpoint)
    signed = {"studyspot-signature": webhooks.signature_header(secret, int(SUNDAY_10AM.timestamp()), b"{}")}
    for _ in range(webhook_tester.MAX_HITS + 5):
        assert webhook_tester.receive(session, endpoint.id, b"{}", signed, SUNDAY_10AM, KEY) == 200
    assert len(webhook_tester.hits(session, endpoint)) == webhook_tester.MAX_HITS
    assert webhook_tester.delete_old(session, SUNDAY_10AM + timedelta(minutes=59)) == 0
    assert webhook_tester.delete_old(session, SUNDAY_10AM + timedelta(hours=2)) == webhook_tester.MAX_HITS


def test_another_campus_has_no_tester(client, session, braude):
    admin = User(institution_id=braude.id, email="a@braude.example", display_name="A", role=UserRole.INSTITUTION_ADMIN)
    session.add(admin)
    session.flush()
    client.user = admin
    assert client.get("/admin/institutions/braude/webhook-tester").status_code == 404
    assert client.post("/admin/institutions/braude/webhook-tester/send").status_code == 404


def test_a_visitor_cannot_edit_delete_or_re_key_the_built_in_address(client, demo, demo_admin, demo_on):
    hook = _open(client, demo_admin)["webhook"]["id"]
    assert client.delete(f"/admin/webhooks/{hook}").json()["detail"] == "webhook_built_in"
    assert client.post(f"/admin/webhooks/{hook}/secret").status_code == 403
    assert client.patch(f"/admin/webhooks/{hook}", json={"active": False}).status_code == 403


def test_the_daily_reset_empties_it_and_turns_failing_off(client, session, demo, demo_admin, demo_on, wire):
    _open(client, demo_admin)
    client.patch("/admin/institutions/demo/webhook-tester", json={"failing": True})
    client.post("/admin/institutions/demo/webhook-tester/send")
    campus_admin.reset_demo_extras(session, "demo")
    session.expire_all()
    assert session.scalar(select(func.count()).select_from(WebhookTestHit)) == 0
    assert session.scalar(select(func.count()).select_from(WebhookDelivery)) == 0
    assert _open(client, demo_admin)["failing"] is False
