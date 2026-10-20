"""Signed webhooks (wave 14.3): StudySpot calls an institution's address
when a check-in starts or ends, or a booking is made or cancelled there.

The flow:
1. emit() writes one delivery row per endpoint that wants the event, in
   the same transaction as the event itself (the outbox pattern): rolled
   back together, never one without the other.
2. The background sweep claims due rows (FOR UPDATE SKIP LOCKED, then moves
   their next try a minute on and commits), and only then calls out. No
   row stays locked during a slow HTTP call, two servers never send the
   same row, and a row whose server died mid-send comes back after the minute.
3. A 2xx answer is "sent". Anything else is tried again after 1 minute,
   5 minutes, 30 minutes, 2 hours and 6 hours, and then it is "failed".

Every request is signed the way Stripe does it:
    StudySpot-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>">
The receiver recomputes it with its secret, compares in constant time, and
refuses an old t: a captured request cannot be replayed later. The event
id (StudySpot-Delivery) stays the same on every try, so the receiver can
skip one it already handled ("at least once" delivery).

No personal data is sent: a place, its occupancy, and times. Never a user.
"""

import base64
import hashlib
import hmac
import ipaddress
import json
import secrets
import socket
from collections.abc import Callable
from datetime import datetime, timedelta
from typing import Any
from urllib.parse import urlsplit

import httpx
from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app.models import Building, DeliveryStatus, Place, WebhookDelivery, WebhookEndpoint

EVENTS = ("checkin.started", "checkin.ended", "booking.created", "booking.cancelled")
TEST_EVENT = "test.ping"
MAX_ENDPOINTS = 3
RETRY_AFTER = (
    timedelta(minutes=1),
    timedelta(minutes=5),
    timedelta(minutes=30),
    timedelta(hours=2),
    timedelta(hours=6),
)
MAX_ATTEMPTS = len(RETRY_AFTER) + 1
LEASE = timedelta(minutes=1)  # a claimed row is free again after this, if its server died
TIMEOUT_SECONDS = 5.0
KEEP = timedelta(days=7)
SIGNATURE_TOLERANCE = 300  # seconds: how old a signed request a receiver should accept
CLAIM_BATCH = 50


# --- the secret and the signature ---------------------------------------------------


def webhook_key(jwt_secret: bytes) -> bytes:
    return hmac.new(jwt_secret, b"studyspot webhook secrets", hashlib.sha256).digest()


def secret_for(key: bytes, endpoint: WebhookEndpoint) -> str:
    """Derived, never stored: the same endpoint and version always give the
    same secret, and a new version gives a new one."""
    digest = hmac.new(key, f"{endpoint.id}:{endpoint.secret_version}".encode(), hashlib.sha256).digest()
    return "whsec_" + base64.urlsafe_b64encode(digest).rstrip(b"=").decode()


def signature(secret: str, timestamp: int, body: bytes) -> str:
    return hmac.new(secret.encode(), f"{timestamp}.".encode() + body, hashlib.sha256).hexdigest()


def signature_header(secret: str, timestamp: int, body: bytes) -> str:
    return f"t={timestamp},v1={signature(secret, timestamp, body)}"


def verify(secret: str, header: str, body: bytes, now: datetime, tolerance: int = SIGNATURE_TOLERANCE) -> bool:
    """What a receiver does (and the demo's tester, wave 14.5)."""
    parts = dict(part.split("=", 1) for part in header.split(",") if "=" in part)
    try:
        timestamp = int(parts["t"])
    except (KeyError, ValueError):
        return False
    if abs(now.timestamp() - timestamp) > tolerance:
        return False
    return hmac.compare_digest(parts.get("v1", ""), signature(secret, timestamp, body))


# --- the address: no calls into a private network (SSRF) ------------------------------


def url_problem(url: str, allow_private: bool, resolve: Callable = socket.getaddrinfo) -> str | None:
    """None if the address may be called, else why not.

    Every address the name resolves to must be on the public internet: a
    name that points at 127.0.0.1, 10.x or the cloud's metadata address
    (169.254.169.254) would let anyone make our server call inside its own
    network. Checked when the endpoint is saved and again before each call,
    since a name can be pointed elsewhere later.
    """
    parts = urlsplit(url)
    if parts.scheme != "https" and not (allow_private and parts.scheme == "http"):
        return "webhook_url_https"
    if not parts.hostname or parts.username or parts.password:
        return "webhook_url_invalid"
    try:
        port = parts.port or (443 if parts.scheme == "https" else 80)
        found = resolve(parts.hostname, port, type=socket.SOCK_STREAM)
    except (OSError, ValueError, UnicodeError):
        return "webhook_url_unresolved"
    if not found:
        return "webhook_url_unresolved"
    if not allow_private:
        for *_, sockaddr in found:
            address = ipaddress.ip_address(sockaddr[0])
            mapped = getattr(address, "ipv4_mapped", None)
            if not (mapped or address).is_global:
                return "webhook_url_private"
    return None


# --- writing an event (in the event's own transaction) ---------------------------------


def _place_data(session: Session, place_id: int, now: datetime) -> dict[str, Any]:
    from app.occupancy import occupied_by_place

    place, code = session.execute(
        select(Place, Building.code).join(Building, Building.id == Place.building_id).where(Place.id == place_id)
    ).one()
    occupied = occupied_by_place(session, [place.id], now).get(place.id, 0)
    return {
        "place": {"id": place.id, "name": place.name, "building_code": code, "kind": place.kind.value},
        "occupied": occupied,
        "capacity": place.capacity,
    }


def emit(
    session: Session, institution_id: int, event_type: str, now: datetime, data: Callable[[], dict[str, Any]]
) -> int:
    """One delivery per active endpoint that wants this event. `data` is
    called only when someone listens, so a campus with no webhooks pays one
    query per event and nothing more."""
    endpoints = session.scalars(
        select(WebhookEndpoint).where(
            WebhookEndpoint.institution_id == institution_id,
            WebhookEndpoint.active,
            WebhookEndpoint.events.contains([event_type]),
        )
    ).all()
    if not endpoints:
        return 0
    payload = {
        "id": "evt_" + secrets.token_hex(12),
        "type": event_type,
        "created_at": now.isoformat(),
        "data": data(),
    }
    for endpoint in endpoints:
        session.add(_delivery(endpoint, payload, now))
    session.flush()
    from app.reminders import ALARM  # here: app.reminders imports the booking rules, which import this

    ALARM.earliest(now)  # the sweep wakes for it even with no visitors
    return len(endpoints)


def _delivery(endpoint: WebhookEndpoint, payload: dict[str, Any], now: datetime) -> WebhookDelivery:
    return WebhookDelivery(
        endpoint_id=endpoint.id,
        event_id=payload["id"],
        event_type=payload["type"],
        payload=payload,
        status=DeliveryStatus.PENDING,
        attempts=0,
        next_attempt_at=now,
        created_at=now,
    )


def check_in_event(session: Session, event_type: str, place_id: int, institution_id: int, now: datetime) -> None:
    session.flush()  # the occupancy sent counts this very change
    emit(session, institution_id, event_type, now, lambda: _place_data(session, place_id, now))


def booking_event(session: Session, event_type: str, booking, now: datetime) -> None:
    def data() -> dict[str, Any]:
        place = _place_data(session, booking.place_id, now)
        return {
            "place": place["place"],
            "booking": {
                "id": booking.id,
                "starts_at": booking.starts_at.isoformat(),
                "ends_at": booking.ends_at.isoformat(),
                "seat_id": booking.seat_id,
            },
        }

    emit(session, booking.institution_id, event_type, now, data)


# --- sending ----------------------------------------------------------------------------


def body_of(payload: dict[str, Any]) -> bytes:
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()


def attempt(
    delivery: WebhookDelivery,
    endpoint: WebhookEndpoint,
    client: httpx.Client,
    key: bytes,
    now: datetime,
    allow_private: bool,
    resolve: Callable = socket.getaddrinfo,
) -> None:
    """One try, recorded on the row. The caller commits."""
    status_code: int | None = None
    error: str | None = None
    if not endpoint.active:
        error = "endpoint_disabled"
    else:
        error = url_problem(endpoint.url, allow_private, resolve)
    if error is None:
        body = body_of(delivery.payload)
        stamp = int(now.timestamp())
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "StudySpot-Webhooks/1",
            "StudySpot-Event": delivery.event_type,
            "StudySpot-Delivery": delivery.event_id,
            "StudySpot-Signature": signature_header(secret_for(key, endpoint), stamp, body),
        }
        try:
            # Streamed and closed unread: the answer's body is never loaded,
            # however big. Redirects are not followed (they could lead inside).
            with client.stream(
                "POST", endpoint.url, content=body, headers=headers, timeout=TIMEOUT_SECONDS, follow_redirects=False
            ) as answer:
                status_code = answer.status_code
        except httpx.HTTPError as failure:
            error = type(failure).__name__
    delivery.attempts += 1
    delivery.last_status_code = status_code
    if status_code is not None and 200 <= status_code < 300:
        delivery.status, delivery.delivered_at, delivery.next_attempt_at, delivery.last_error = (
            DeliveryStatus.SENT, now, None, None,
        )
        return
    delivery.last_error = (error or f"HTTP {status_code}")[:200]
    if delivery.attempts >= MAX_ATTEMPTS or error == "endpoint_disabled":
        delivery.status, delivery.next_attempt_at = DeliveryStatus.FAILED, None
    else:
        delivery.next_attempt_at = now + RETRY_AFTER[delivery.attempts - 1]


def claim(session: Session, now: datetime, limit: int = CLAIM_BATCH) -> list[int]:
    """Take due rows for this server: a row another server holds is
    skipped, not waited for. The caller commits at once."""
    due = (
        select(WebhookDelivery.id)
        .where(WebhookDelivery.status == DeliveryStatus.PENDING, WebhookDelivery.next_attempt_at <= now)
        .order_by(WebhookDelivery.next_attempt_at)
        .limit(limit)
        .with_for_update(skip_locked=True)
    )
    return list(
        session.scalars(
            update(WebhookDelivery)
            .where(WebhookDelivery.id.in_(due))
            .values(next_attempt_at=now + LEASE)
            .returning(WebhookDelivery.id)
        )
    )


def deliver_due(
    session_maker: Callable[[], Session],
    client: httpx.Client,
    key: bytes,
    now: datetime,
    allow_private: bool,
    resolve: Callable = socket.getaddrinfo,
) -> int:
    with session_maker() as session:
        ids = claim(session, now)
        session.commit()
    for delivery_id in ids:
        with session_maker() as session:
            delivery = session.get(WebhookDelivery, delivery_id)
            endpoint = session.get(WebhookEndpoint, delivery.endpoint_id) if delivery else None
            if delivery is None or endpoint is None:
                continue  # deleted meanwhile
            attempt(delivery, endpoint, client, key, now, allow_private, resolve)
            session.commit()
    return len(ids)


def next_due(session: Session) -> datetime | None:
    return session.scalar(
        select(func.min(WebhookDelivery.next_attempt_at)).where(WebhookDelivery.status == DeliveryStatus.PENDING)
    )


def delete_old(session: Session, now: datetime) -> int:
    return session.execute(delete(WebhookDelivery).where(WebhookDelivery.created_at < now - KEEP)).rowcount


def send_now(
    session: Session,
    endpoint: WebhookEndpoint,
    payload: dict[str, Any],
    client: httpx.Client,
    key: bytes,
    now: datetime,
    allow_private: bool,
    resolve: Callable = socket.getaddrinfo,
) -> WebhookDelivery:
    """A test, or "send again", from the admin: tried within the request, so
    the admin sees the answer at once. Later tries, if needed, by the sweep."""
    delivery = _delivery(endpoint, payload, now)
    session.add(delivery)
    session.flush()
    attempt(delivery, endpoint, client, key, now, allow_private, resolve)
    return delivery


def test_payload(now: datetime) -> dict[str, Any]:
    return {
        "id": "evt_" + secrets.token_hex(12),
        "type": TEST_EVENT,
        "created_at": now.isoformat(),
        "data": {"message": "A test from StudySpot. If you see this, the address and the signature work."},
    }


_http: httpx.Client | None = None


def get_resolver() -> Callable:
    """How names are looked up: a dependency, so tests answer without DNS."""
    return socket.getaddrinfo


def get_client() -> httpx.Client:
    """One shared client (connection reuse). A dependency, so tests swap in
    an httpx.MockTransport."""
    global _http
    if _http is None:
        _http = httpx.Client()
    return _http
