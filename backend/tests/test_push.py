"""Push notifications (wave 10): a browser subscribes, the server sends it
messages encrypted to that browser (RFC 8291) and signed with the site's
VAPID key (RFC 8292), and only ever to a known push service."""

import base64
import json

import http_ece
import httpx
import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from factories import make_user

from app.errors import Refusal
from app.models import PushSubscription
from app.notify import Notice, PushSender, check_endpoint, notify, vapid_key


def b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


class Browser:
    """What a real browser holds: its key pair and its auth secret."""

    def __init__(self):
        self.key = ec.generate_private_key(ec.SECP256R1())
        self.auth = b"0123456789abcdef"
        public = self.key.public_key().public_bytes(
            serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
        )
        self.p256dh = b64(public)

    def read(self, body: bytes) -> dict:
        return json.loads(http_ece.decrypt(body, private_key=self.key, auth_secret=self.auth, version="aes128gcm"))


def subscribe(session, user, browser, endpoint="https://fcm.googleapis.com/fcm/send/abc"):
    row = PushSubscription(user_id=user.id, endpoint=endpoint, p256dh=browser.p256dh, auth=b64(browser.auth))
    session.add(row)
    session.flush()
    return row


def sender(seen, status=201):
    def handle(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(status)

    return PushSender(httpx.Client(transport=httpx.MockTransport(handle)), vapid_key(b"x" * 32), "https://site.example")


def test_the_browser_can_read_it_and_the_signature_is_ours(session, braude):
    user, browser, seen = make_user(session, braude), Browser(), []
    subscribe(session, user, browser)
    sent = notify(session, user.id, Notice("הזמנה בעוד 10 דקות", "EM107, 14:00", "/me"), sender(seen))
    assert sent == 1
    [request] = seen
    assert request.headers["content-encoding"] == "aes128gcm"
    assert int(request.headers["ttl"]) > 0
    assert browser.read(request.content) == {"title": "הזמנה בעוד 10 דקות", "body": "EM107, 14:00", "url": "/me"}
    # The VAPID header: a JWT for this push service, signed by our key.
    scheme, params = request.headers["authorization"].split(" ", 1)
    fields = dict(p.split("=", 1) for p in params.split(","))
    assert scheme == "vapid"
    public = vapid_key(b"x" * 32).public_key()
    claims = jwt.decode(fields["t"], public, algorithms=["ES256"], audience="https://fcm.googleapis.com")
    assert claims["sub"] == "https://site.example"


def test_the_key_is_stable_for_one_secret_and_differs_for_another():
    def raw(key):
        return key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)

    assert raw(vapid_key(b"a" * 32)) == raw(vapid_key(b"a" * 32))
    assert raw(vapid_key(b"a" * 32)) != raw(vapid_key(b"b" * 32))


@pytest.mark.parametrize("status", [404, 410])
def test_a_browser_that_is_gone_is_forgotten(session, braude, status):
    user, seen = make_user(session, braude), []
    subscribe(session, user, Browser())
    assert notify(session, user.id, Notice("t", "b", "/me"), sender(seen, status)) == 0
    assert session.query(PushSubscription).count() == 0


def test_a_failing_push_service_keeps_the_subscription(session, braude):
    user, seen = make_user(session, braude), []
    subscribe(session, user, Browser())
    assert notify(session, user.id, Notice("t", "b", "/me"), sender(seen, 500)) == 0
    assert session.query(PushSubscription).count() == 1


def test_every_browser_of_the_user_and_no_one_else(session, braude):
    user, other, seen = make_user(session, braude), make_user(session, braude, "other@example.com"), []
    subscribe(session, user, Browser(), "https://fcm.googleapis.com/fcm/send/one")
    subscribe(session, user, Browser(), "https://web.push.apple.com/two")
    subscribe(session, other, Browser(), "https://updates.push.services.mozilla.com/three")
    assert notify(session, user.id, Notice("t", "b", "/me"), sender(seen)) == 2
    assert {r.url.host for r in seen} == {"fcm.googleapis.com", "web.push.apple.com"}


def test_without_a_sender_nothing_is_sent(session, braude):
    user = make_user(session, braude)
    subscribe(session, user, Browser())
    assert notify(session, user.id, Notice("t", "b", "/me"), None) == 0


@pytest.mark.parametrize(
    "endpoint",
    [
        "https://fcm.googleapis.com/fcm/send/abc",
        "https://updates.push.services.mozilla.com/wpush/v2/abc",
        "https://web.push.apple.com/QGx",
        "https://wns2-par02p.notify.windows.com/w/?token=abc",
    ],
)
def test_known_push_services_are_accepted(endpoint):
    check_endpoint(endpoint)


@pytest.mark.parametrize(
    "endpoint",
    [
        "http://fcm.googleapis.com/fcm/send/abc",  # not encrypted
        "https://evil.example/fcm.googleapis.com",
        "https://fcm.googleapis.com.evil.example/x",
        "https://localhost/x",
        "https://169.254.169.254/latest/meta-data",
        "https://user:pw@fcm.googleapis.com/x",
        "https://fcm.googleapis.com:8443/x",
        "https://" + "a" * 1000 + ".push.apple.com/x",
    ],
)
def test_anything_else_is_refused_so_the_server_cannot_be_aimed_elsewhere(endpoint):
    with pytest.raises(Refusal) as refused:
        check_endpoint(endpoint)
    assert refused.value.code == "push_endpoint"
