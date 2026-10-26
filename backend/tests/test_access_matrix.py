"""Who may call what: every route of the API, in one table.

The table below names, for each route, who may call it. The tests then
check the refusals for real, against the running app:
- a guest gets 401 from every route that needs a signed-in user;
- a student gets 403 from every admin and system route;
- an institution's admin gets 403 from every system route;
- an institution's admin gets 403 or 404 from every admin route aimed at
  another institution's things (IDOR: the id in the address belongs to
  someone else);
- a student gets 403 or 404 from routes aimed at another student's things.

A new route that is not in the table fails the first test: whoever adds
it has to say who may call it, and the refusals are then checked here too.
"""

from datetime import UTC, datetime, timedelta

import pytest
from conftest import code_for, place_named
from factories import make_building, make_institution, make_place
from fastapi.routing import APIRoute
from sqlalchemy import select

from app.main import app
from app.models import (
    ApiKey,
    AuthProvider,
    InstitutionLoginRule,
    User,
    UserRole,
    WaitlistEntry,
    WebhookDelivery,
    WebhookEndpoint,
)
from app.models.people import AdminInvite

# Who may call each route:
#   public  - anyone, no sign-in
#   token   - anyone with a secret token in the request (share, screen, calendar, unsubscribe, webhook tester)
#   api_key - an institution's API key (v1)
#   auth    - the sign-in steps themselves
#   user    - any signed-in user, for their own things
#   admin   - an institution's admin for their own institution, or the system admin
#   admin_any - any admin, nothing of one institution (geocoding an address)
#   system  - the system admin only
ACCESS = {
    ("GET", "/health"): "public",
    ("HEAD", "/health"): "public",
    ("GET", "/institutions"): "public",
    ("GET", "/institutions/{slug}"): "public",
    ("GET", "/institutions/{slug}/buildings"): "public",
    ("GET", "/institutions/{slug}/load/today"): "public",
    ("GET", "/institutions/{slug}/places"): "public",
    ("GET", "/places/{place_id}"): "public",
    ("GET", "/places/{place_id}/availability"): "public",
    ("GET", "/places/{place_id}/forecast"): "public",
    ("GET", "/push/key"): "public",
    ("GET", "/v1/openapi.json"): "public",
    ("GET", "/screen"): "token",
    ("GET", "/shares/{token}"): "token",
    ("GET", "/calendar.ics"): "token",
    ("POST", "/notices/unsubscribe"): "token",
    ("POST", "/v1/webhook-tester/{endpoint_id}"): "token",
    ("GET", "/v1/institution"): "api_key",
    ("GET", "/v1/buildings"): "api_key",
    ("GET", "/v1/places"): "api_key",
    ("GET", "/v1/places/{place_id}"): "api_key",
    ("GET", "/v1/places/{place_id}/forecast"): "api_key",
    ("POST", "/auth/demo/login"): "auth",
    ("POST", "/auth/email/start"): "auth",
    ("POST", "/auth/email/verify"): "auth",
    ("POST", "/auth/logout"): "auth",
    ("POST", "/auth/password/login"): "auth",
    ("POST", "/auth/password/set"): "auth",
    ("GET", "/auth/providers"): "auth",
    ("POST", "/auth/refresh"): "auth",
    ("GET", "/auth/{provider_name}/callback"): "auth",
    ("GET", "/auth/{provider_name}/login"): "auth",
    ("POST", "/auth/logout-all"): "user",
    ("POST", "/bookings"): "user",
    ("POST", "/bookings/{booking_id}/cancel"): "user",
    ("POST", "/bookings/{booking_id}/extend"): "user",
    ("GET", "/bookings/{booking_id}/extend-options"): "user",
    ("POST", "/check-ins"): "user",
    ("POST", "/check-ins/{check_in_id}/checkout"): "user",
    ("POST", "/check-ins/{check_in_id}/still-here"): "user",
    ("POST", "/invites/accept"): "user",
    ("POST", "/invites/inspect"): "user",
    ("GET", "/me"): "user",
    ("GET", "/me/between-classes"): "user",
    ("GET", "/me/bookings"): "user",
    ("GET", "/me/calendar"): "user",
    ("POST", "/me/calendar"): "user",
    ("DELETE", "/me/calendar"): "user",
    ("GET", "/me/check-in"): "user",
    ("GET", "/me/classes"): "user",
    ("POST", "/me/classes"): "user",
    ("DELETE", "/me/classes"): "user",
    ("POST", "/me/classes/bulk"): "user",
    ("POST", "/me/classes/import"): "user",
    ("GET", "/me/classes/import-options"): "user",
    ("POST", "/me/classes/import-photo"): "user",
    ("DELETE", "/me/classes/{class_id}"): "user",
    ("POST", "/me/delete"): "user",
    ("GET", "/me/email-notices"): "user",
    ("POST", "/me/email-notices"): "user",
    ("GET", "/me/push"): "user",
    ("POST", "/me/push"): "user",
    ("DELETE", "/me/push"): "user",
    ("POST", "/me/push/test"): "user",
    ("GET", "/me/waitlist"): "user",
    ("DELETE", "/me/waitlist/{entry_id}"): "user",
    ("POST", "/places/{place_id}/waitlist"): "user",
    ("POST", "/shares"): "user",
    ("GET", "/admin/geocode"): "admin_any",
    ("POST", "/admin/buildings/{building_id}/location"): "admin",
    ("POST", "/admin/buildings/{building_id}/places"): "admin",
    ("PATCH", "/admin/institutions/{slug}"): "admin",
    ("GET", "/admin/institutions/{slug}/api-keys"): "admin",
    ("POST", "/admin/institutions/{slug}/api-keys"): "admin",
    ("DELETE", "/admin/institutions/{slug}/api-keys/{key_id}"): "admin",
    ("POST", "/admin/institutions/{slug}/buildings"): "admin",
    ("GET", "/admin/institutions/{slug}/codes"): "admin",
    ("POST", "/admin/institutions/{slug}/import"): "admin",
    ("POST", "/admin/institutions/{slug}/import/preview"): "admin",
    ("POST", "/admin/institutions/{slug}/login-rules"): "admin",
    ("GET", "/admin/institutions/{slug}/mentioned-places"): "admin",
    ("GET", "/admin/institutions/{slug}/setup"): "admin",
    ("GET", "/admin/institutions/{slug}/webhook-tester"): "admin",
    ("PATCH", "/admin/institutions/{slug}/webhook-tester"): "admin",
    ("POST", "/admin/institutions/{slug}/webhook-tester/send"): "admin",
    ("GET", "/admin/institutions/{slug}/webhooks"): "admin",
    ("POST", "/admin/institutions/{slug}/webhooks"): "admin",
    ("DELETE", "/admin/login-rules/{rule_id}"): "admin",
    ("POST", "/admin/login-rules/{rule_id}/verify"): "admin",
    ("PATCH", "/admin/places/{place_id}/check-in-mode"): "admin",
    ("POST", "/admin/places/{place_id}/revoke-code"): "admin",
    ("POST", "/admin/places/{place_id}/screen"): "admin",
    ("DELETE", "/admin/places/{place_id}/screen"): "admin",
    ("POST", "/admin/webhook-deliveries/{delivery_id}/redeliver"): "admin",
    ("PATCH", "/admin/webhooks/{endpoint_id}"): "admin",
    ("DELETE", "/admin/webhooks/{endpoint_id}"): "admin",
    ("GET", "/admin/webhooks/{endpoint_id}/deliveries"): "admin",
    ("POST", "/admin/webhooks/{endpoint_id}/secret"): "admin",
    ("POST", "/admin/webhooks/{endpoint_id}/test"): "admin",
    ("GET", "/system/institutions"): "system",
    ("POST", "/system/institutions"): "system",
    ("DELETE", "/system/institutions/{slug}"): "system",
    ("POST", "/system/institutions/{slug}/close"): "system",
    ("POST", "/system/institutions/{slug}/invites"): "system",
    ("GET", "/system/institutions/{slug}/invites"): "system",
    ("POST", "/system/institutions/{slug}/reopen"): "system",
    ("POST", "/system/invites/{invite_id}/revoke"): "system",
    ("GET", "/system/login-rules"): "system",
    ("POST", "/system/login-rules/{rule_id}/approve"): "system",
}

# A valid body for each admin route that takes one: a refusal must come
# from the permission check, not from a body that fails validation (422).
BODIES = {
    ("POST", "/admin/buildings/{building_id}/location"): {"latitude": 32.9, "longitude": 35.3},
    ("POST", "/admin/buildings/{building_id}/places"): {"kind": "open_area", "name": "Hall", "floor": 0, "capacity": 10},
    ("PATCH", "/admin/institutions/{slug}"): {"name": "Taken over"},
    ("POST", "/admin/institutions/{slug}/api-keys"): {"name": "Stolen"},
    ("POST", "/admin/institutions/{slug}/buildings"): {"code": "Z", "floors_count": 1},
    ("POST", "/admin/institutions/{slug}/import"): {"buildings": [{"code": "Z", "floors_count": 1}]},
    ("POST", "/admin/institutions/{slug}/login-rules"): {"provider": "email", "value": "attacker.example"},
    ("PATCH", "/admin/institutions/{slug}/webhook-tester"): {"failing": True},
    ("POST", "/admin/institutions/{slug}/webhooks"): {"url": "https://attacker.example/hook", "events": ["booking.created"]},
    ("PATCH", "/admin/places/{place_id}/check-in-mode"): {"mode": "screen"},
    ("PATCH", "/admin/webhooks/{endpoint_id}"): {"active": False},
}

# Routes that may refuse a guest with another answer first, and why that is fine.
GUEST_ALSO = {
    # Photo reading off (no Anthropic key): "off" before "sign in". It says
    # nothing about anyone, and with a key the sign-in check comes first.
    ("POST", "/me/classes/import-photo"): {404},
}

NOW = datetime(2026, 10, 11, 7, 0, tzinfo=UTC)


def api_routes():
    """Every route of the app, also inside included routers."""

    def walk(routes):
        for route in routes:
            if isinstance(route, APIRoute):
                yield route
                continue
            for attribute in ("router", "routes", "original_router"):
                inner = getattr(route, attribute, None)
                if inner is not None:
                    yield from walk(inner if isinstance(inner, list) else getattr(inner, "routes", []))
                    break

    for route in walk(app.routes):
        for method in route.methods:
            yield method, route.path


def routes_for(*kinds: str) -> list[tuple[str, str]]:
    return sorted(key for key, kind in ACCESS.items() if kind in kinds)


def call(client, method: str, path: str, body: dict | None = None):
    return client.request(method, path, json=body if body is not None else ({} if method in ("POST", "PATCH", "DELETE") else None))


@pytest.fixture
def other(session):
    """Another institution, with a building, a place, a rule, a webhook with
    a delivery, an API key and an invite: the things its own admin manages."""
    institution = make_institution(session, "other-college")
    building = make_building(session, institution, code="Q")
    place = make_place(session, building, name="Q Hall")
    rule = InstitutionLoginRule(institution_id=institution.id, provider=AuthProvider.EMAIL, value="other.example", approved=False)
    endpoint = WebhookEndpoint(institution_id=institution.id, url="https://other.example/hook", events=["booking.created"], created_at=NOW)
    key = ApiKey(institution_id=institution.id, name="theirs", prefix="ss_live_Other", key_hash="0" * 64, created_at=NOW)
    invite = AdminInvite(institution_id=institution.id, token_hash="1" * 64, created_at=NOW, expires_at=NOW + timedelta(days=7))
    session.add_all([rule, endpoint, key, invite])
    session.flush()
    delivery = WebhookDelivery(endpoint_id=endpoint.id, event_id="evt_other", event_type="booking.created", payload={}, created_at=NOW)
    session.add(delivery)
    session.flush()
    return {
        "slug": institution.slug,
        "building_id": building.id,
        "place_id": place.id,
        "rule_id": rule.id,
        "endpoint_id": endpoint.id,
        "delivery_id": delivery.id,
        "key_id": key.id,
        "invite_id": invite.id,
        "code_version": place.code_version,
    }


def fill(path: str, ids: dict) -> str:
    for name, value in ids.items():
        path = path.replace("{" + name + "}", str(value))
    return path


def own_ids(braude) -> dict:
    """Ids of the student's own institution, for the role checks (refused before any id is read)."""
    place = place_named(braude, "EM", "EM107")
    return {
        "slug": braude.slug, "building_id": place.building_id, "place_id": place.id, "rule_id": 1, "endpoint_id": 1,
        "delivery_id": 1, "key_id": 1, "invite_id": 1, "booking_id": 1, "check_in_id": 1, "class_id": 1,
        "entry_id": 1, "token": "x", "provider_name": "google",
    }


def make_admin(session, institution_id: int, role=UserRole.INSTITUTION_ADMIN, email="admin@braude.example") -> User:
    user = User(institution_id=institution_id, email=email, display_name="Admin", role=role)
    session.add(user)
    session.flush()
    return user


def test_every_route_says_who_may_call_it():
    routes = set(api_routes())
    missing = sorted(routes - ACCESS.keys())
    gone = sorted(ACCESS.keys() - routes)
    assert missing == [], f"routes with no line in ACCESS: {missing}"
    assert gone == [], f"lines in ACCESS for routes that no longer exist: {gone}"


@pytest.mark.parametrize(("method", "path"), routes_for("user", "admin", "admin_any", "system"))
def test_a_guest_is_refused(client, braude, method, path):
    client.user = None
    response = call(client, method, fill(path, own_ids(braude)))
    allowed = {401} | GUEST_ALSO.get((method, path), set())
    assert response.status_code in allowed, (method, path, response.status_code, response.text[:200])


@pytest.mark.parametrize(("method", "path"), routes_for("admin", "admin_any", "system"))
def test_a_student_is_refused(client, braude, method, path):
    response = call(client, method, fill(path, own_ids(braude)))
    assert response.status_code == 403, (method, path, response.status_code, response.text[:200])


@pytest.mark.parametrize(("method", "path"), routes_for("system"))
def test_an_institution_admin_is_refused_the_system_routes(client, session, braude, method, path):
    client.user = make_admin(session, braude.id)
    response = call(client, method, fill(path, own_ids(braude)))
    assert response.status_code == 403, (method, path, response.status_code, response.text[:200])


@pytest.mark.parametrize(("method", "path"), routes_for("admin"))
def test_an_admin_cannot_reach_another_institution(client, session, braude, other, method, path):
    client.user = make_admin(session, braude.id)
    response = call(client, method, fill(path, other), BODIES.get((method, path)))
    assert response.status_code in (403, 404), (method, path, response.status_code, response.text[:200])
    assert_untouched(session, other)


def assert_untouched(session, other: dict) -> None:
    """Nothing of the other institution changed, whatever the answer said."""
    from app.models import Building, Institution, Place

    session.expire_all()
    building = session.get(Building, other["building_id"])
    place = session.get(Place, other["place_id"])
    institution = session.get(Institution, building.institution_id)
    endpoint = session.get(WebhookEndpoint, other["endpoint_id"])
    assert (building.latitude, building.longitude) == (None, None)
    assert place.check_in_mode.value == "sign" and place.code_version == other["code_version"]
    assert institution.name == "Test other-college" and institution.is_active is False
    assert session.get(InstitutionLoginRule, other["rule_id"]) is not None
    assert (endpoint.active, endpoint.secret_version) == (True, 1)
    assert session.get(ApiKey, other["key_id"]).revoked_at is None
    assert session.get(AdminInvite, other["invite_id"]).revoked_at is None
    assert session.scalar(select(WebhookEndpoint.id).where(WebhookEndpoint.url.like("%attacker%"))) is None


def test_an_admin_cannot_reach_another_institutions_thing_through_their_own_address(client, session, braude, other):
    # Their own institution in the address, someone else's id after it: the
    # id must be checked against the institution too, not only the address.
    client.user = make_admin(session, braude.id)
    response = client.delete(f"/admin/institutions/{braude.slug}/api-keys/{other['key_id']}")
    assert response.status_code == 404, response.text
    assert_untouched(session, other)


@pytest.mark.parametrize(("method", "path"), routes_for("api_key"))
def test_an_api_route_without_a_key_is_refused(client, braude, method, path):
    client.user = None
    response = call(client, method, fill(path, own_ids(braude)))
    assert response.status_code == 401, (method, path, response.status_code, response.text[:200])


@pytest.mark.parametrize(("method", "path"), routes_for("token"))
def test_a_token_route_with_a_wrong_token_gives_nothing(client, braude, method, path):
    client.user = None
    response = client.request(
        method,
        fill(path, own_ids(braude)) + ("?t=wrong" if "?" not in path else ""),
        headers={"X-Screen-Token": "wrong", "StudySpot-Signature": "t=1,v1=00"},
        json={} if method == "POST" else None,
    )
    assert response.status_code in (400, 401, 403, 404, 422), (method, path, response.status_code, response.text[:200])


def test_every_admin_route_with_a_body_has_one_here():
    # Routes that take a JSON body and are aimed at an institution: the
    # test above needs a valid body for each, or it would only see a 422.
    from app.main import app as the_app

    spec = the_app.openapi()
    with_body = {
        (method.upper(), path)
        for path, operations in spec["paths"].items()
        for method, operation in operations.items()
        if "requestBody" in operation and "application/json" in operation["requestBody"]["content"]
    }
    needed = sorted(k for k in routes_for("admin") if k in with_body)
    assert sorted(k for k in needed if k not in BODIES) == []


# --- Another student's things, in the same institution ---------------------------

MONDAY_14 = datetime(2026, 10, 12, 11, 0, tzinfo=UTC)  # 14:00 in Israel; the client's clock is Sunday 10:00


@pytest.fixture
def theirs(client, session, braude, student):
    """A booking, a check-in, a class and a waiting-list entry of another student."""
    other_student = User(institution_id=braude.id, email="other@braude.example", display_name="Other")
    session.add(other_student)
    session.flush()
    client.user = other_student
    room = place_named(braude, "EM", "EM107")
    booking = client.post(
        "/bookings",
        json={"place_id": room.id, "starts_at": MONDAY_14.isoformat(), "ends_at": (MONDAY_14 + timedelta(hours=2)).isoformat()},
    )
    assert booking.status_code == 201, booking.text
    area = place_named(braude, "L", next(p.name for p in next(b for b in braude.buildings if b.code == "L").places if p.kind.value == "open_area"))
    check_in = client.post("/check-ins", json={"code": code_for(area)})
    assert check_in.status_code == 201, check_in.text
    a_class = client.post("/me/classes", json={"weekday": 0, "starts": "08:30", "ends": "10:30", "building_code": "L"})
    assert a_class.status_code == 201, a_class.text
    entry = WaitlistEntry(user_id=other_student.id, place_id=room.id, starts_at=MONDAY_14, ends_at=MONDAY_14 + timedelta(hours=1))
    session.add(entry)
    session.flush()
    client.user = student  # back to "me"
    return {
        "booking_id": booking.json()["id"],
        "check_in_id": check_in.json()["id"],
        "class_id": a_class.json()["id"],
        "entry_id": entry.id,
    }


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("POST", "/bookings/{booking_id}/cancel"),
        ("POST", "/bookings/{booking_id}/extend"),
        ("GET", "/bookings/{booking_id}/extend-options"),
        ("POST", "/check-ins/{check_in_id}/checkout"),
        ("POST", "/check-ins/{check_in_id}/still-here"),
        ("DELETE", "/me/classes/{class_id}"),
        ("DELETE", "/me/waitlist/{entry_id}"),
    ],
)
def test_a_student_cannot_touch_another_students_things(client, theirs, method, path):
    response = call(client, method, fill(path, theirs))
    assert response.status_code in (403, 404), (method, path, response.status_code, response.text[:200])


def test_a_student_cannot_share_another_students_stay(client, theirs):
    for kind, key in (("booking", "booking_id"), ("check_in", "check_in_id")):
        response = client.post("/shares", json={"kind": kind, "id": theirs[key]})
        assert response.status_code in (403, 404), (kind, response.status_code, response.text[:200])
