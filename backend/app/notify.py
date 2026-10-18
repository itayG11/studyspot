"""The notification channel (wave 10): one way to tell a user something,
whatever carries it. Today that is Web Push; email joins in wave 11.

Web Push, in short:
- the browser subscribes with its push service (Google's, Mozilla's,
  Apple's or Microsoft's) and gives us an address there (the endpoint) and
  two keys;
- we encrypt the message to the browser's key (RFC 8291, http-ece), so the
  push service carries it without being able to read it;
- we sign the request with our VAPID key (RFC 8292, py-vapid), so the push
  service knows it comes from this site.

The VAPID key is derived from JWT_SECRET, like the email codes' key: no new
secret to keep. Changing JWT_SECRET means every browser subscribes again.

The endpoint comes from the browser, so it is checked against the known push
services before the server ever sends anything there: otherwise anyone could
aim the server at any address (server-side request forgery).
"""

import base64
import hashlib
import hmac
import json
import logging
import time
from dataclasses import asdict, dataclass
from urllib.parse import urlsplit

import http_ece
import httpx
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from py_vapid import Vapid02
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import Refusal
from app.models import PushSubscription

log = logging.getLogger(__name__)

MAX_ENDPOINT = 1000
TTL_SECONDS = 15 * 60  # a reminder older than this is no use
TOKEN_SECONDS = 30 * 60  # VAPID tokens: short-lived, under every push service's limit
_PUSH_HOSTS = ("fcm.googleapis.com", "updates.push.services.mozilla.com")
_PUSH_SUFFIXES = (".push.apple.com", ".notify.windows.com")
_P256_ORDER = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551


@dataclass(frozen=True)
class Notice:
    title: str
    body: str
    url: str  # a path on the site, opened when the notification is tapped


def vapid_key(jwt_secret: bytes) -> ec.EllipticCurvePrivateKey:
    """A P-256 key, the same for the same secret, from an HMAC of it."""
    digest = hmac.new(jwt_secret, b"studyspot web push vapid key", hashlib.sha256).digest()
    return ec.derive_private_key(int.from_bytes(digest) % (_P256_ORDER - 1) + 1, ec.SECP256R1())


def public_key_b64(key: ec.EllipticCurvePrivateKey) -> str:
    """What the browser needs to subscribe (applicationServerKey)."""
    raw = key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    return _b64(raw)


def check_endpoint(endpoint: str) -> None:
    """Only https, on a known push service, on the standard port."""
    if len(endpoint) > MAX_ENDPOINT:
        raise Refusal(422, "push_endpoint")
    try:
        parts = urlsplit(endpoint)
        port = parts.port
    except ValueError:
        raise Refusal(422, "push_endpoint") from None
    host = (parts.hostname or "").lower()
    known = host in _PUSH_HOSTS or any(host.endswith(s) for s in _PUSH_SUFFIXES)
    if parts.scheme != "https" or not known or port not in (None, 443) or parts.username or parts.password:
        raise Refusal(422, "push_endpoint")


def decode_key(value: str, size: int) -> bytes:
    """A base64url key from the browser, of the size the standard sets."""
    try:
        raw = base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
    except ValueError:
        raise Refusal(422, "push_keys") from None
    if len(raw) != size or (size == 65 and raw[0] != 4):
        raise Refusal(422, "push_keys")
    return raw


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


class PushSender:
    def __init__(self, http: httpx.Client, key: ec.EllipticCurvePrivateKey, subject: str):
        self.http, self.vapid, self.subject = http, Vapid02(private_key=key), subject

    def send(self, subscription: PushSubscription, notice: Notice) -> int | None:
        """The push service's status code, or None when it could not be reached."""
        check_endpoint(subscription.endpoint)  # checked when stored; again, as it is what we call
        body = http_ece.encrypt(
            json.dumps(asdict(notice), ensure_ascii=False).encode(),
            private_key=ec.generate_private_key(ec.SECP256R1()),
            dh=decode_key(subscription.p256dh, 65),
            auth_secret=decode_key(subscription.auth, 16),
            version="aes128gcm",
        )
        parts = urlsplit(subscription.endpoint)
        claims = {"aud": f"{parts.scheme}://{parts.hostname}", "sub": self.subject, "exp": int(time.time()) + TOKEN_SECONDS}
        headers = {
            **self.vapid.sign(claims),
            "Content-Encoding": "aes128gcm",
            "Content-Type": "application/octet-stream",
            "TTL": str(TTL_SECONDS),
            "Urgency": "high",
        }
        try:
            return self.http.post(subscription.endpoint, content=body, headers=headers, timeout=5).status_code
        except httpx.HTTPError as error:
            log.warning("push not delivered: %s", type(error).__name__)
            return None


def notify(session: Session, user_id: int, notice: Notice, push: PushSender | None) -> int:
    """Tell the user on every browser they subscribed. The number delivered.
    A browser the push service no longer knows (404, 410) is forgotten."""
    if push is None:
        return 0
    delivered = 0
    for subscription in session.scalars(select(PushSubscription).where(PushSubscription.user_id == user_id)).all():
        status = push.send(subscription, notice)
        if status in (404, 410):
            session.delete(subscription)
        elif status is not None and 200 <= status < 300:
            delivered += 1
        else:
            log.warning("push refused: status %s", status)
    session.flush()
    return delivered


_http: httpx.Client | None = None


def sender_from_settings(settings) -> PushSender | None:
    """Push is on when the site has an https address (VAPID needs one as
    its contact) and a JWT secret to derive the key from."""
    global _http
    site = settings.frontend_url.rstrip("/")
    if not site.startswith("https://") or settings.jwt_secret is None:
        return None
    if _http is None:
        _http = httpx.Client()
    return PushSender(_http, vapid_key(settings.jwt_secret_bytes()), site)
