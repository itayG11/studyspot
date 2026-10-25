"""The push addresses: the site's public key, subscribing a browser,
unsubscribing it, and a test notification."""

import httpx
from conftest import SUNDAY_10AM
from fastapi.testclient import TestClient
from test_push import Browser, b64

from app.api.push import MAX_SUBSCRIPTIONS, get_push_sender
from app.demo import Persona, demo_user
from app.main import app
from app.models import PushSubscription
from app.notify import PushSender, vapid_key


def body(browser: Browser, endpoint="https://fcm.googleapis.com/fcm/send/abc"):
    return {"endpoint": endpoint, "keys": {"p256dh": browser.p256dh, "auth": b64(browser.auth)}}


def test_the_public_key_is_open_to_all(client: TestClient):
    client.user = None
    key = client.get("/push/key").json()["key"]
    assert len(key) == 87  # 65 bytes, base64url without padding


def test_subscribe_and_unsubscribe(client: TestClient, session, student):
    browser = Browser()
    assert client.post("/me/push", json=body(browser)).status_code == 204
    assert client.post("/me/push", json=body(browser)).status_code == 204  # again: still one row
    [row] = session.query(PushSubscription).all()
    assert row.user_id == student.id
    assert client.get("/me/push").json() == {"count": 1}
    assert client.request("DELETE", "/me/push", json={"endpoint": row.endpoint}).status_code == 204
    assert session.query(PushSubscription).count() == 0


def test_a_browser_taken_over_by_another_user_moves_to_them(client: TestClient, session, braude):
    from factories import make_user

    browser = Browser()
    client.post("/me/push", json=body(browser))
    other = make_user(session, braude, "other@example.com")
    client.user = other
    client.post("/me/push", json=body(browser))
    [row] = session.query(PushSubscription).all()
    assert row.user_id == other.id  # the one signed in on that browser now


def test_someone_elses_browser_cannot_be_removed(client: TestClient, session, braude):
    from factories import make_user

    client.post("/me/push", json=body(Browser()))
    client.user = make_user(session, braude, "other@example.com")
    client.request("DELETE", "/me/push", json={"endpoint": "https://fcm.googleapis.com/fcm/send/abc"})
    assert session.query(PushSubscription).count() == 1


def test_bad_endpoints_and_keys_are_refused(client: TestClient):
    browser = Browser()
    bad = client.post("/me/push", json=body(browser, "https://evil.example/x"))
    assert (bad.status_code, bad.json()["detail"]) == (422, "push_endpoint")
    wrong = body(browser)
    wrong["keys"]["auth"] = "short"
    assert client.post("/me/push", json=wrong).json()["detail"] == "push_keys"


def test_a_user_has_a_few_browsers_at_most(client: TestClient, session):
    for n in range(MAX_SUBSCRIPTIONS):
        client.post("/me/push", json=body(Browser(), f"https://fcm.googleapis.com/fcm/send/{n}"))
    over = client.post("/me/push", json=body(Browser(), "https://fcm.googleapis.com/fcm/send/over"))
    assert (over.status_code, over.json()["detail"]) == (409, "push_too_many")


def test_the_shared_demo_student_cannot_subscribe(client: TestClient, session):
    from factories import make_institution

    demo = make_institution(session, "demo-campus")  # no sign-in rules: a demo may live there
    client.user = demo_user(session, demo.slug, Persona.STUDENT, SUNDAY_10AM)
    refused = client.post("/me/push", json=body(Browser()))
    assert (refused.status_code, refused.json()["detail"]) == (403, "push_demo_account")


def test_signed_out_is_refused(client: TestClient):
    client.user = None
    assert client.post("/me/push", json=body(Browser())).status_code == 401


def test_a_test_notification_reaches_the_browser(client: TestClient):
    seen = []

    def handle(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(201)

    sender = PushSender(httpx.Client(transport=httpx.MockTransport(handle)), vapid_key(b"x" * 32), "https://site.example")
    app.dependency_overrides[get_push_sender] = lambda: sender
    browser = Browser()
    client.post("/me/push", json=body(browser))
    sent = client.post("/me/push/test")
    assert sent.json() == {"delivered": 1}
    assert browser.read(seen[0].content)["url"] == "/me"


def test_without_https_or_secret_push_is_off(client: TestClient):
    app.dependency_overrides[get_push_sender] = lambda: None
    client.post("/me/push", json=body(Browser()))
    assert client.post("/me/push/test").json() == {"delivered": 0}


def test_a_stranger_who_knows_the_address_cannot_take_the_browser(client: TestClient, session, student, braude):
    # From the test round's security review, 25 Oct: the endpoint alone
    # moved someone's browser to whoever sent it, with new keys, and the
    # owner stopped getting notices. Without the browser's own secret, no.
    from factories import make_user

    client.post("/me/push", json=body(Browser()))
    client.user = make_user(session, braude, "stranger@example.com")
    stranger = Browser()
    stranger.auth = b"not-the-same-key"  # 16 bytes: the browser's own secret differs
    response = client.post("/me/push", json=body(stranger))  # same address, other keys
    assert (response.status_code, response.json()["detail"]) == (409, "push_endpoint_taken")
    [row] = session.query(PushSubscription).all()
    assert row.user_id == student.id
