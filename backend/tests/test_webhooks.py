"""Wave 14.3: signed webhooks, with retries and a delivery log."""

import json
import socket
from datetime import timedelta

import httpx
import pytest
from conftest import SUNDAY_10AM, code_for, place_named
from factories import make_institution
from sqlalchemy import Engine, delete, func, select
from sqlalchemy.orm import Session

from app import webhooks
from app.config import get_settings
from app.main import app
from app.models import CheckIn, DeliveryStatus, Institution, User, UserRole, WebhookDelivery, WebhookEndpoint
from app.sweeper import sweep

KEY = webhooks.webhook_key(get_settings().jwt_secret_bytes())
PUBLIC = "93.184.216.34"


def resolve_to(address: str):
    def resolve(host, port, type=0):
        family = socket.AF_INET6 if ":" in address else socket.AF_INET
        return [(family, socket.SOCK_STREAM, 6, "", (address, port))]

    return resolve


class Receiver:
    """The institution's server, faked: records every request, answers `status`."""

    def __init__(self):
        self.requests: list[httpx.Request] = []
        self.status = 200
        self.fail_with: Exception | None = None

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if self.fail_with is not None:
            raise self.fail_with
        return httpx.Response(self.status)


@pytest.fixture
def receiver(client) -> Receiver:
    fake = Receiver()
    app.dependency_overrides[webhooks.get_transport] = lambda: httpx.MockTransport(fake)
    app.dependency_overrides[webhooks.get_resolver] = lambda: resolve_to(PUBLIC)
    return fake


@pytest.fixture
def admin(session, braude) -> User:
    user = User(
        institution_id=braude.id, email="admin@braude.example", display_name="Admin", role=UserRole.INSTITUTION_ADMIN
    )
    session.add(user)
    session.flush()
    return user


def _endpoint(session, institution, events=webhooks.EVENTS, active=True) -> WebhookEndpoint:
    row = WebhookEndpoint(
        institution_id=institution.id, url="https://hooks.example.edu/studyspot", events=list(events),
        active=active, created_at=SUNDAY_10AM,
    )
    session.add(row)
    session.flush()
    return row


def _deliveries(session, endpoint=None) -> list[WebhookDelivery]:
    query = select(WebhookDelivery).order_by(WebhookDelivery.id)
    if endpoint is not None:
        query = query.where(WebhookDelivery.endpoint_id == endpoint.id)
    return list(session.scalars(query))


# --- the signature --------------------------------------------------------------------


def test_the_signature_verifies_and_a_change_or_an_old_one_does_not():
    body = b'{"type":"test.ping"}'
    stamp = int(SUNDAY_10AM.timestamp())
    header = webhooks.signature_header("whsec_abc", stamp, body)
    assert header.startswith(f"t={stamp},v1=")
    assert webhooks.verify("whsec_abc", header, body, SUNDAY_10AM)
    assert not webhooks.verify("whsec_abc", header, body + b" ", SUNDAY_10AM)
    assert not webhooks.verify("whsec_other", header, body, SUNDAY_10AM)
    assert not webhooks.verify("whsec_abc", header, body, SUNDAY_10AM + timedelta(minutes=10))  # replayed later
    assert not webhooks.verify("whsec_abc", "garbage", body, SUNDAY_10AM)


def test_the_secret_is_derived_and_a_new_version_changes_it(session, braude):
    endpoint = _endpoint(session, braude)
    first = webhooks.secret_for(KEY, endpoint)
    assert first.startswith("whsec_") and first == webhooks.secret_for(KEY, endpoint)
    endpoint.secret_version += 1
    assert webhooks.secret_for(KEY, endpoint) != first


# --- the address (SSRF) ------------------------------------------------------------------


@pytest.mark.parametrize(
    "address",
    [
        "127.0.0.1", "10.1.2.3", "192.168.1.1", "169.254.169.254", "::1", "::ffff:127.0.0.1", "fd00::1",
        # IPv6 forms that carry an IPv4 address inside (wave 14 review):
        "64:ff9b::a00:1", "::127.0.0.1", "2002:7f00:1::1",
    ],
)
def test_an_address_inside_a_private_network_is_refused(address):
    assert webhooks.url_problem("https://looks-public.example", False, resolve_to(address)) == "webhook_url_private"


def test_only_https_a_real_name_and_no_password_in_it():
    public = resolve_to(PUBLIC)
    assert webhooks.url_problem("https://hooks.example.edu/x", False, public) is None
    assert webhooks.url_problem("http://hooks.example.edu/x", False, public) == "webhook_url_https"
    assert webhooks.url_problem("ftp://hooks.example.edu", False, public) == "webhook_url_https"
    assert webhooks.url_problem("https://user:pw@hooks.example.edu", False, public) == "webhook_url_invalid"

    def unknown(*_args, **_kw):
        raise socket.gaierror("no such name")

    assert webhooks.url_problem("https://nowhere.invalid", False, unknown) == "webhook_url_unresolved"
    # Development: plain http to localhost, only when allowed.
    assert webhooks.url_problem("http://localhost:9000", True, resolve_to("127.0.0.1")) is None


# --- writing an event, in the event's own transaction --------------------------------------


def test_a_check_in_writes_a_delivery_without_who(client, session, braude, student):
    endpoint = _endpoint(session, braude)
    library = place_named(braude, "EF", "ספרייה")
    assert client.post("/check-ins", json={"code": code_for(library)}).status_code == 201
    [delivery] = _deliveries(session, endpoint)
    assert (delivery.event_type, delivery.status, delivery.attempts) == ("checkin.started", DeliveryStatus.PENDING, 0)
    data = delivery.payload["data"]
    assert data["place"]["name"] == "ספרייה" and data["occupied"] == 1 and data["capacity"] == library.capacity
    text = json.dumps(delivery.payload, ensure_ascii=False)
    assert student.email not in text and "Student" not in text and "user" not in text


def test_only_endpoints_that_want_the_event_and_are_on_get_it(client, session, braude):
    wants_bookings = _endpoint(session, braude, events=["booking.created"])
    off = _endpoint(session, braude, active=False)
    client.post("/check-ins", json={"code": code_for(place_named(braude, "EF", "ספרייה"))})
    assert _deliveries(session, wants_bookings) == [] and _deliveries(session, off) == []


def test_a_rolled_back_event_leaves_no_delivery(session, braude):
    _endpoint(session, braude)
    library = place_named(braude, "EF", "ספרייה")
    with pytest.raises(RuntimeError), session.begin_nested():
        webhooks.check_in_event(session, "checkin.started", library.id, braude.id, SUNDAY_10AM)
        assert len(_deliveries(session)) == 1
        raise RuntimeError("the check-in failed after all")
    assert _deliveries(session) == []


def test_check_out_and_bookings_are_events_too(client, session, braude):
    endpoint = _endpoint(session, braude)
    stay = client.post("/check-ins", json={"code": code_for(place_named(braude, "EF", "ספרייה"))}).json()["id"]
    client.post(f"/check-ins/{stay}/checkout")
    room = place_named(braude, "EM", "EM107")
    start = SUNDAY_10AM + timedelta(hours=2)
    booked = client.post(
        "/bookings",
        json={"place_id": room.id, "starts_at": start.isoformat(), "ends_at": (start + timedelta(hours=1)).isoformat()},
    ).json()
    client.post(f"/bookings/{booked['id']}/cancel")
    types = [d.event_type for d in _deliveries(session, endpoint)]
    assert types == ["checkin.started", "checkin.ended", "booking.created", "booking.cancelled"]
    assert _deliveries(session, endpoint)[1].payload["data"]["occupied"] == 0
    assert _deliveries(session, endpoint)[2].payload["data"]["booking"]["starts_at"].startswith(start.isoformat()[:16])


def test_the_sweep_sends_ended_for_real_check_ins_not_made_up_ones(client, session, braude, student):
    endpoint = _endpoint(session, braude, events=["checkin.ended"])
    library = place_named(braude, "EF", "ספרייה")
    client.post("/check-ins", json={"code": code_for(library)})
    made_up = User(institution_id=braude.id, email="sim@studyspot.invalid", display_name="Sim", simulated=True)
    session.add(made_up)
    session.flush()
    session.add(
        CheckIn(
            institution_id=braude.id, user_id=made_up.id, place_id=library.id, started_at=SUNDAY_10AM,
            expires_at=SUNDAY_10AM + timedelta(minutes=5), simulated=True,
        )
    )
    session.flush()
    sweep(session, SUNDAY_10AM + timedelta(hours=12))
    assert [d.event_type for d in _deliveries(session, endpoint)] == ["checkin.ended"]


# --- sending and trying again --------------------------------------------------------------


def _attempt(session, delivery, receiver, now):
    client = httpx.MockTransport(receiver)
    endpoint = session.get(WebhookEndpoint, delivery.endpoint_id)
    webhooks.attempt(delivery, endpoint, client, KEY, now, False, resolve_to(PUBLIC))


def _one_delivery(session, braude) -> WebhookDelivery:
    endpoint = _endpoint(session, braude)
    delivery = webhooks._delivery(endpoint, webhooks.test_payload(SUNDAY_10AM), SUNDAY_10AM)
    session.add(delivery)
    session.flush()
    return delivery


def test_a_2xx_is_sent_and_the_request_is_signed(session, braude):
    receiver = Receiver()
    delivery = _one_delivery(session, braude)
    _attempt(session, delivery, receiver, SUNDAY_10AM)
    assert (delivery.status, delivery.attempts, delivery.last_status_code) == (DeliveryStatus.SENT, 1, 200)
    [request] = receiver.requests
    endpoint = session.get(WebhookEndpoint, delivery.endpoint_id)
    assert request.headers["StudySpot-Event"] == "test.ping"
    assert request.headers["StudySpot-Delivery"] == delivery.event_id
    secret = webhooks.secret_for(KEY, endpoint)
    assert webhooks.verify(secret, request.headers["StudySpot-Signature"], request.content, SUNDAY_10AM)


def test_failures_are_tried_again_on_the_schedule_and_then_given_up(session, braude):
    receiver = Receiver()
    receiver.status = 503
    delivery = _one_delivery(session, braude)
    now = SUNDAY_10AM
    waits = []
    for _ in range(webhooks.MAX_ATTEMPTS - 1):
        _attempt(session, delivery, receiver, now)
        assert delivery.status is DeliveryStatus.PENDING
        waits.append(delivery.next_attempt_at - now)
        now = delivery.next_attempt_at
    assert waits == list(webhooks.RETRY_AFTER)
    _attempt(session, delivery, receiver, now)
    assert (delivery.status, delivery.attempts, delivery.next_attempt_at) == (
        DeliveryStatus.FAILED, webhooks.MAX_ATTEMPTS, None,
    )
    assert delivery.last_error == "HTTP 503"


def test_a_timeout_or_a_redirect_is_a_failure(session, braude):
    receiver = Receiver()
    receiver.fail_with = httpx.ReadTimeout("slow")
    delivery = _one_delivery(session, braude)
    _attempt(session, delivery, receiver, SUNDAY_10AM)
    assert (delivery.status, delivery.last_error) == (DeliveryStatus.PENDING, "ReadTimeout")
    receiver.fail_with, receiver.status = None, 302
    _attempt(session, delivery, receiver, SUNDAY_10AM)
    assert delivery.last_error == "HTTP 302" and len(receiver.requests) == 2  # not followed


def test_an_address_that_turned_private_is_not_called(session, braude):
    receiver = Receiver()
    delivery = _one_delivery(session, braude)
    endpoint = session.get(WebhookEndpoint, delivery.endpoint_id)
    client = httpx.MockTransport(receiver)
    webhooks.attempt(delivery, endpoint, client, KEY, SUNDAY_10AM, False, resolve_to("10.0.0.5"))
    assert receiver.requests == [] and delivery.last_error == "webhook_url_private"


def test_two_servers_never_claim_the_same_row(engine: Engine):
    """Real commits through separate connections, as in test_booking_concurrency.py."""
    with Session(engine) as setup:
        institution = make_institution(setup, slug="hook-race")
        endpoint = _endpoint(setup, institution)
        for _ in range(6):
            setup.add(webhooks._delivery(endpoint, webhooks.test_payload(SUNDAY_10AM), SUNDAY_10AM))
        setup.commit()
        institution_id = institution.id
    try:
        with Session(engine) as first, Session(engine) as second:
            mine = webhooks.claim(first, SUNDAY_10AM, limit=4)  # holds its rows' locks until commit
            theirs = webhooks.claim(second, SUNDAY_10AM, limit=4)  # skips them, does not wait
            assert len(mine) == 4 and len(theirs) == 2 and not set(mine) & set(theirs)
            first.commit()
            second.commit()
        with Session(engine) as later:
            # Claimed: not due again until the lease ends.
            assert webhooks.claim(later, SUNDAY_10AM) == []
            assert len(webhooks.claim(later, SUNDAY_10AM + webhooks.LEASE)) == 6
            later.rollback()
    finally:
        with Session(engine) as cleanup:
            cleanup.execute(delete(Institution).where(Institution.id == institution_id))
            cleanup.commit()


def test_old_deliveries_are_deleted_after_a_week(session, braude):
    delivery = _one_delivery(session, braude)
    assert webhooks.delete_old(session, SUNDAY_10AM + timedelta(days=6)) == 0
    assert webhooks.delete_old(session, SUNDAY_10AM + timedelta(days=8)) == 1
    assert session.get(WebhookDelivery, delivery.id) is None or _deliveries(session) == []


# --- the admin's endpoints -------------------------------------------------------------------


def _add(client, admin, url="https://hooks.example.edu/studyspot", events=("checkin.started",), slug="braude"):
    client.user = admin
    return client.post(f"/admin/institutions/{slug}/webhooks", json={"url": url, "events": list(events)})


def test_an_admin_adds_an_endpoint_and_sees_its_secret_once(client, admin, receiver):
    answer = _add(client, admin)
    assert answer.status_code == 201, answer.text
    assert answer.json()["secret"].startswith("whsec_")
    listed = client.get("/admin/institutions/braude/webhooks").json()
    assert [w["url"] for w in listed] == ["https://hooks.example.edu/studyspot"]
    assert "secret" not in listed[0]


def test_at_most_three_endpoints(client, admin, receiver):
    for number in range(webhooks.MAX_ENDPOINTS):
        assert _add(client, admin, url=f"https://hooks.example.edu/{number}").status_code == 201
    answer = _add(client, admin, url="https://hooks.example.edu/more")
    assert (answer.status_code, answer.json()["detail"]) == (409, "webhook_limit")


def test_a_private_or_plain_http_address_is_refused(client, admin):
    app.dependency_overrides[webhooks.get_resolver] = lambda: resolve_to("127.0.0.1")
    assert _add(client, admin).json()["detail"] == "webhook_url_private"
    assert _add(client, admin, url="http://hooks.example.edu").json()["detail"] == "webhook_url_https"


def test_another_campus_admin_gets_404_and_a_student_403(client, session, admin, receiver, student):
    hook = _add(client, admin).json()["webhook"]["id"]
    other = make_institution(session, slug="other-college")
    stranger = User(institution_id=other.id, email="s@other.example", display_name="S", role=UserRole.INSTITUTION_ADMIN)
    session.add(stranger)
    session.flush()
    client.user = stranger
    assert client.get(f"/admin/webhooks/{hook}/deliveries").status_code == 404
    assert client.post(f"/admin/webhooks/{hook}/test").status_code == 404
    assert client.delete(f"/admin/webhooks/{hook}").status_code == 404
    client.user = student
    assert client.get("/admin/institutions/braude/webhooks").status_code == 403


def test_the_test_button_sends_now_and_the_log_shows_it(client, admin, receiver):
    hook = _add(client, admin).json()["webhook"]["id"]
    sent = client.post(f"/admin/webhooks/{hook}/test").json()
    assert (sent["event_type"], sent["status"], sent["last_status_code"]) == ("test.ping", "sent", 200)
    assert len(receiver.requests) == 1
    receiver.status = 500
    failed = client.post(f"/admin/webhooks/{hook}/test").json()
    assert failed["status"] == "pending" and failed["next_attempt_at"] is not None
    log = client.get(f"/admin/webhooks/{hook}/deliveries").json()
    assert [d["status"] for d in log] == ["pending", "sent"]  # newest first
    receiver.status = 200
    again = client.post(f"/admin/webhook-deliveries/{log[0]['id']}/redeliver").json()
    assert again["event_id"] == log[0]["event_id"] and again["status"] == "sent"


def test_a_new_secret_stops_the_old_one(client, admin, receiver):
    made = _add(client, admin).json()
    renewed = client.post(f"/admin/webhooks/{made['webhook']['id']}/secret").json()
    assert renewed["secret"] != made["secret"]
    client.post(f"/admin/webhooks/{made['webhook']['id']}/test")
    request = receiver.requests[-1]
    header = request.headers["StudySpot-Signature"]
    assert webhooks.verify(renewed["secret"], header, request.content, SUNDAY_10AM)
    assert not webhooks.verify(made["secret"], header, request.content, SUNDAY_10AM)


def test_turning_off_and_deleting(client, session, admin, receiver):
    hook = _add(client, admin).json()["webhook"]["id"]
    assert client.patch(f"/admin/webhooks/{hook}", json={"active": False}).json()["active"] is False
    assert client.patch(f"/admin/webhooks/{hook}", json={"events": ["booking.created"]}).json()["events"] == [
        "booking.created"
    ]
    assert client.patch(f"/admin/webhooks/{hook}", json={"events": ["nope"]}).status_code == 422
    assert client.delete(f"/admin/webhooks/{hook}").status_code == 204
    assert session.scalar(select(func.count()).select_from(WebhookEndpoint)) == 0


def test_the_demo_campus_cannot_add_addresses(client, session, receiver, monkeypatch):
    from app.config import Settings
    from app.config import get_settings as real
    from app.seed import seed_demo

    demo = seed_demo(session)
    demo_admin = User(institution_id=demo.id, email="d@studyspot.invalid", display_name="D", role=UserRole.INSTITUTION_ADMIN)
    session.add(demo_admin)
    session.flush()
    settings = Settings(database_url="postgresql+psycopg://unused@localhost/unused", demo_login_enabled=True,
                        jwt_secret=real().jwt_secret, _env_file=None)
    app.dependency_overrides[real] = lambda: settings
    answer = _add(client, demo_admin, slug="demo")
    assert (answer.status_code, answer.json()["detail"]) == (403, "demo_campus_locked")


# --- the wave 14 review: slow servers, long batches, odd failures --------------------------


def test_a_server_that_drips_is_cut_off_by_the_total_deadline(session, braude, monkeypatch):
    import anyio

    async def slow(request):
        await anyio.sleep(10)
        return httpx.Response(200)

    monkeypatch.setattr(webhooks, "TOTAL_SECONDS", 0.2)
    delivery = _one_delivery(session, braude)
    endpoint = session.get(WebhookEndpoint, delivery.endpoint_id)
    webhooks.attempt(delivery, endpoint, httpx.MockTransport(slow), KEY, SUNDAY_10AM, False, resolve_to(PUBLIC))
    assert (delivery.status, delivery.last_error, delivery.attempts) == (DeliveryStatus.PENDING, "Timeout", 1)


def test_any_failure_is_a_counted_try_never_a_silent_loop(session, braude):
    def broken(request):
        raise ValueError("not an httpx error")

    delivery = _one_delivery(session, braude)
    endpoint = session.get(WebhookEndpoint, delivery.endpoint_id)
    webhooks.attempt(delivery, endpoint, httpx.MockTransport(broken), KEY, SUNDAY_10AM, False, resolve_to(PUBLIC))
    assert (delivery.attempts, delivery.last_error) == (1, "ValueError")


def test_a_long_batch_signs_each_call_with_its_own_time_and_stops_at_its_budget(engine: Engine, monkeypatch):
    """Real commits, as in the race test: deliver_due opens its own sessions."""
    with Session(engine) as setup:
        institution = make_institution(setup, slug="hook-budget")
        endpoint = _endpoint(setup, institution)
        for _ in range(5):
            setup.add(webhooks._delivery(endpoint, webhooks.test_payload(SUNDAY_10AM), SUNDAY_10AM))
        setup.commit()
        institution_id = institution.id
    seen: list[int] = []

    def record(request):
        seen.append(int(request.headers["StudySpot-Signature"].split(",")[0][2:]))
        return httpx.Response(200)

    ticks = iter(SUNDAY_10AM + timedelta(seconds=15 * n) for n in range(100))
    try:
        sent = webhooks.deliver_due(
            lambda: Session(engine), httpx.MockTransport(record), KEY, lambda: next(ticks), False, resolve_to(PUBLIC)
        )
        # Clock: claim at 0 s, then 15, 30 and 45 s: the third is past the 40 s budget.
        assert sent == 2
        assert seen == [int((SUNDAY_10AM + timedelta(seconds=s)).timestamp()) for s in (15, 30)]
        assert webhooks.LEASE > webhooks.SWEEP_BUDGET + timedelta(seconds=webhooks.TOTAL_SECONDS)
    finally:
        with Session(engine) as cleanup:
            cleanup.execute(delete(Institution).where(Institution.id == institution_id))
            cleanup.commit()


def test_an_event_that_fails_never_stops_the_sweep(client, session, braude, monkeypatch):
    from app import sweeper

    client.post("/check-ins", json={"code": code_for(place_named(braude, "EF", "ספרייה"))})

    def boom(*_args, **_kw):
        raise RuntimeError("the event could not be written")

    monkeypatch.setattr(sweeper, "check_in_event", boom)
    result = sweep(session, SUNDAY_10AM + timedelta(hours=12))
    assert result.expired_check_ins == 1
