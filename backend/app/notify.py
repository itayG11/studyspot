"""The notification channel: one way to tell a user something, whatever
carries it. Web Push first (wave 10); email when no browser got it and the
user asked for email too (wave 11).

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

Email, in short:
- only to an address the last sign-in proved (User.email_verified), and only
  if the user turned it on (User.email_notices);
- a daily budget: Brevo's free plan sends 300 a day, and the sign-in codes
  keep 250 of them (app/email_codes.py CODES_PER_DAY), so notices get 40,
  and 3 a user;
- every email has a signed link that turns it off, with no sign-in needed.
"""

import base64
import hashlib
import hmac
import json
import logging
import re
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta
from urllib.parse import urlsplit

import http_ece
import httpx
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from py_vapid import Vapid02
from sqlalchemy import exists, func, or_, select, text
from sqlalchemy.orm import Session

from app.errors import Refusal
from app.mailer import Mailer, mailer_from_settings
from app.models import NoticeEmail, PushSubscription, User

log = logging.getLogger(__name__)

MAX_ENDPOINT = 1000
TTL_SECONDS = 15 * 60  # a reminder older than this is no use
TOKEN_SECONDS = 30 * 60  # VAPID tokens: short-lived, under every push service's limit
_PUSH_HOSTS = ("fcm.googleapis.com", "updates.push.services.mozilla.com")
_PUSH_SUFFIXES = (".push.apple.com", ".notify.windows.com")
_TOKEN = re.compile(r"[0-9]{1,12}\.[0-9a-f]{32}")
EMAILS_PER_DAY = 40  # for the whole site; see the module docstring
EMAILS_PER_USER_DAY = 3
_EMAIL_BUDGET_LOCK = 0x5715_E3A1  # pg_advisory_xact_lock: one counter at a time
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


def reachable(user_id):
    """A condition on a user id column: someone we can tell, by a subscribed
    browser or by email notices on a proved address."""
    return or_(
        exists().where(PushSubscription.user_id == user_id),
        exists().where(User.id == user_id, User.email_notices, User.email_verified),
    )


def unsubscribe_key(jwt_secret: bytes) -> bytes:
    """A key of its own for the links that turn email notices off."""
    return hmac.new(jwt_secret, b"studyspot email notices unsubscribe", hashlib.sha256).digest()


def unsubscribe_token(key: bytes, user_id: int) -> str:
    mac = hmac.new(key, f"unsubscribe {user_id}".encode(), hashlib.sha256).hexdigest()[:32]
    return f"{user_id}.{mac}"


def read_unsubscribe_token(key: bytes, token: str) -> int | None:
    """The user the token was made for, or None if it is not ours."""
    if not _TOKEN.fullmatch(token):  # ASCII only: compare_digest refuses anything else
        return None
    user_id = int(token.partition(".")[0])
    return user_id if hmac.compare_digest(unsubscribe_token(key, user_id), token) else None


@dataclass(frozen=True)
class EmailSender:
    mailer: Mailer
    site: str  # https://..., no trailing slash
    key: bytes  # unsubscribe_key

    def send(self, to: str, user_id: int, notice: Notice) -> None:
        token = unsubscribe_token(self.key, user_id)
        text_body = (
            f"{notice.body}\n\n"
            f"לפתיחה: {self.site}{notice.url}\n\n"
            f"להפסקת ההתראות במייל: {self.site}/unsubscribe#t={token}"
        )
        headers = {
            # One click in the mail app turns them off (RFC 8058).
            "List-Unsubscribe": f"<{self.site}/api/notices/unsubscribe?t={token}>",
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        }
        self.mailer.send(to, notice.title, text_body, headers)


def _email(session: Session, user_id: int, notice: Notice, email: EmailSender, now: datetime) -> bool:
    user = session.get(User, user_id)
    if user is None or not (user.email_notices and user.email_verified):
        return False
    # Counted and committed before sending, under one lock, so two
    # processes never both take the last one.
    session.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": _EMAIL_BUDGET_LOCK})
    since = now - timedelta(days=1)
    sent = select(func.count()).select_from(NoticeEmail).where(NoticeEmail.sent_at > since)
    if session.scalar(sent) >= EMAILS_PER_DAY:
        log.warning("email notices: the daily budget is spent")
        session.commit()  # lets the lock go: the next pushes must not hold it
        return False
    if session.scalar(sent.where(NoticeEmail.user_id == user_id)) >= EMAILS_PER_USER_DAY:
        session.commit()
        return False
    session.add(NoticeEmail(user_id=user_id, sent_at=now))
    address = user.email
    session.commit()
    try:
        email.send(address, user_id, notice)
    except Refusal:
        return False  # logged by the mailer; the budget stays spent
    return True


def notify(
    session: Session,
    user_id: int,
    notice: Notice,
    push: PushSender | None,
    email: EmailSender | None = None,
    now: datetime | None = None,
) -> int:
    """Tell the user on every browser they subscribed; by email if none got
    it and they asked for email. The number delivered.
    A browser the push service no longer knows (404, 410) is forgotten.
    An email is counted and committed before it is sent: so this commits
    the caller's session. Mark what is being sent, and commit, first."""
    delivered = 0
    if push is not None:
        for subscription in session.scalars(select(PushSubscription).where(PushSubscription.user_id == user_id)).all():
            status = push.send(subscription, notice)
            if status in (404, 410):
                session.delete(subscription)
            elif status is not None and 200 <= status < 300:
                delivered += 1
            else:
                log.warning("push refused: status %s", status)
        session.flush()
    if delivered == 0 and email is not None:
        if now is None:
            from app.clock import get_now

            now = get_now()
        delivered += _email(session, user_id, notice, email, now)
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


def email_from_settings(settings, http: httpx.Client | None = None) -> EmailSender | None:
    """Email notices are on when a mailer is, the site has an https address
    for the links, and there is a JWT secret to sign them with."""
    global _http
    site = settings.frontend_url.rstrip("/")
    if not site.startswith("https://") or settings.jwt_secret is None:
        return None
    if http is None:
        if _http is None:
            _http = httpx.Client()
        http = _http
    mailer = mailer_from_settings(settings, http)
    if mailer is None:
        return None
    return EmailSender(mailer, site, unsubscribe_key(settings.jwt_secret_bytes()))
