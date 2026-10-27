"""Signed webhooks (wave 14.3): StudySpot calls an institution's address
when a check-in starts or ends, or a booking is made or cancelled there.

The flow:
1. emit() writes one delivery row per endpoint that wants the event, in
   the same transaction as the event itself (the outbox pattern): rolled
   back together, never one without the other.
2. The background sweep claims due rows (FOR UPDATE SKIP LOCKED, then moves
   their next try a lease ahead and commits), and only then calls out, each
   call under a total deadline, all of them within a time budget shorter
   than the lease. No row stays locked during a slow HTTP call, two servers
   never send the same row, and a row whose server died mid-send comes back
   when its lease ends.
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
import threading
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout
from datetime import datetime, timedelta
from typing import Any
from urllib.parse import urlsplit

import anyio
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
LEASE = timedelta(minutes=2)  # a claimed row is free again after this: longer than SWEEP_BUDGET plus one call
TIMEOUT_SECONDS = 5.0  # each connect, read and write
TOTAL_SECONDS = 8.0  # the whole call, whatever the server does
SWEEP_BUDGET = timedelta(seconds=40)  # deliveries per sweep stop after this
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


RESOLVE_SECONDS = 3.0  # a name that does not answer by then is "unresolved", so a sweep never waits on it
_resolver_threads = ThreadPoolExecutor(max_workers=8, thread_name_prefix="webhook-dns")
# One slot per thread, held until the lookup really ends (even after we stopped
# waiting): names that never answer cannot queue up behind each other and make
# every other lookup wait; with no slot free a lookup is refused at once.
_lookup_slots = threading.BoundedSemaphore(8)


def _resolve_by_deadline(resolve: Callable, host: str, port: int):
    """The lookup runs in a thread we stop waiting for after RESOLVE_SECONDS
    (the thread itself ends when the system's own resolver gives up)."""
    if not _lookup_slots.acquire(blocking=False):
        raise OSError("too many name lookups stuck")
    try:
        future = _resolver_threads.submit(resolve, host, port, type=socket.SOCK_STREAM)
    except BaseException:
        _lookup_slots.release()
        raise
    future.add_done_callback(lambda _: _lookup_slots.release())
    try:
        return future.result(timeout=RESOLVE_SECONDS)
    except FutureTimeout:
        raise OSError("name lookup timed out") from None


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
        found = _resolve_by_deadline(resolve, parts.hostname, port)
    except (OSError, ValueError, UnicodeError):
        return "webhook_url_unresolved"
    if not found:
        return "webhook_url_unresolved"
    if not allow_private:
        for *_, sockaddr in found:
            address = ipaddress.ip_address(sockaddr[0])
            mapped = getattr(address, "ipv4_mapped", None)
            if not (mapped or address).is_global or any(address in net for net in _TUNNELS):
                return "webhook_url_private"
    return None


# IPv6 ranges that carry an IPv4 address inside, which Python counts as
# global: NAT64 (64:ff9b::1.2.3.4 reaches 1.2.3.4), the old IPv4-compatible
# form (::127.0.0.1), and 6to4. None is needed to reach a real server.
_TUNNELS = tuple(
    ipaddress.ip_network(net) for net in ("64:ff9b::/96", "64:ff9b:1::/48", "::/96", "2002::/16")
)


# --- writing an event (in the event's own transaction) ---------------------------------


def _place_data(session: Session, place_id: int, now: datetime) -> dict[str, Any]:
    from app.occupancy import occupied_by_place

    found = session.execute(
        select(Place, Building.code).join(Building, Building.id == Place.building_id).where(Place.id == place_id)
    ).first()
    if found is None:  # deleted in the same transaction: the event still goes out
        return {"place": {"id": place_id}}
    place, code = found
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


def booking_event(session: Session, event_type: str, booking, now: datetime, reason: str | None = None) -> None:
    """`reason` is only for a cancel the student did not ask for: "no_show"
    or "institution_closing". A student's own cancel has none."""

    def data() -> dict[str, Any]:
        place = _place_data(session, booking.place_id, now)
        body: dict[str, Any] = {
            "place": place["place"],
            "booking": {
                "id": booking.id,
                "starts_at": booking.starts_at.isoformat(),
                "ends_at": booking.ends_at.isoformat(),
                "seat_id": booking.seat_id,
            },
        }
        if reason is not None:
            body["reason"] = reason
        return body

    emit(session, booking.institution_id, event_type, now, data)


# --- sending ----------------------------------------------------------------------------


def body_of(payload: dict[str, Any]) -> bytes:
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()


def _post(url: str, body: bytes, headers: dict[str, str], transport: httpx.AsyncBaseTransport | None) -> int:
    """POST, and the status code. Under a deadline for the whole call:
    httpx's own timeout counts each read separately, so a server sending a
    byte every few seconds would hold the call (and the sweep) for hours.
    Streamed and closed unread: the answer's body is never loaded. Redirects
    are not followed (they could lead inside our network)."""

    async def go() -> int:
        with anyio.fail_after(TOTAL_SECONDS):
            async with (
                httpx.AsyncClient(transport=transport, timeout=TIMEOUT_SECONDS, follow_redirects=False) as http,
                http.stream("POST", url, content=body, headers=headers) as answer,
            ):
                return answer.status_code

    return anyio.run(go)


def attempt(
    delivery: WebhookDelivery,
    endpoint: WebhookEndpoint,
    transport: httpx.AsyncBaseTransport | None,
    key: bytes,
    now: datetime,
    allow_private: bool,
    resolve: Callable = socket.getaddrinfo,
) -> None:
    """One try, recorded on the row. The caller commits. `now` is read just
    before the call: the signature's time is the time it is sent."""
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
            status_code = _post(endpoint.url, body, headers, transport)
        except TimeoutError:
            error = "Timeout"
        except Exception as failure:  # noqa: BLE001 - any failure is a failed try, counted, never a loop
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
    transport: httpx.AsyncBaseTransport | None,
    key: bytes,
    clock: Callable[[], datetime],
    allow_private: bool,
    resolve: Callable = socket.getaddrinfo,
) -> int:
    """Due deliveries, one by one, within SWEEP_BUDGET: the rest of the
    sweep (no-shows, reminders) never waits long. Claimed rows not reached
    are taken again when their lease ends, which is longer than the budget
    plus one call, so no row is sent by two servers."""
    started = clock()
    with session_maker() as session:
        ids = claim(session, started)
        session.commit()
    sent = 0
    for delivery_id in ids:
        now = clock()
        if now - started > SWEEP_BUDGET:
            break
        with session_maker() as session:
            delivery = session.get(WebhookDelivery, delivery_id)
            endpoint = session.get(WebhookEndpoint, delivery.endpoint_id) if delivery else None
            if delivery is None or endpoint is None:
                continue  # deleted meanwhile
            attempt(delivery, endpoint, transport, key, now, allow_private, resolve)
            session.commit()
            sent += 1
    return sent


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
    transport: httpx.AsyncBaseTransport | None,
    key: bytes,
    now: datetime,
    allow_private: bool,
    resolve: Callable = socket.getaddrinfo,
) -> WebhookDelivery:
    """A test, or "send again", from the admin: tried within the request, so
    the admin sees the answer at once. Later tries, if needed, by the sweep.

    The row is committed before the call: no transaction (and no pooled
    connection) is held open while a slow server answers."""
    delivery = _delivery(endpoint, payload, now)
    session.add(delivery)
    session.commit()
    attempt(delivery, endpoint, transport, key, now, allow_private, resolve)
    return delivery


def test_payload(now: datetime) -> dict[str, Any]:
    return {
        "id": "evt_" + secrets.token_hex(12),
        "type": TEST_EVENT,
        "created_at": now.isoformat(),
        "data": {"message": "A test from StudySpot. If you see this, the address and the signature work."},
    }


def get_transport() -> httpx.AsyncBaseTransport | None:
    """How deliveries go out: None is the real network. A dependency, so
    tests swap in an httpx.MockTransport."""
    return None


def get_resolver() -> Callable:
    """How names are looked up: a dependency, so tests answer without DNS."""
    return socket.getaddrinfo
