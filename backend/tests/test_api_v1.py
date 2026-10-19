"""Wave 14.2: API keys for institutions, and the read-only /v1 endpoints."""

from datetime import timedelta

import pytest
from conftest import SUNDAY_10AM, place_named
from factories import make_building, make_institution, make_place
from sqlalchemy import select

from app import api_keys
from app.config import get_settings
from app.models import ApiKey, User, UserRole

KEY = api_keys.api_key_key(get_settings().jwt_secret_bytes())


@pytest.fixture
def admin(session, braude) -> User:
    user = User(
        institution_id=braude.id, email="admin@braude.example", display_name="Admin", role=UserRole.INSTITUTION_ADMIN
    )
    session.add(user)
    session.flush()
    return user


def _make_key(client, admin, slug="braude", name="the library screen"):
    client.user = admin
    answer = client.post(f"/admin/institutions/{slug}/api-keys", json={"name": name})
    assert answer.status_code == 201, answer.text
    return answer.json()


def _as_key(client, raw):
    client.user = None  # a script, not a person: only the key
    return {"Authorization": f"Bearer {raw}"}


# --- the admin makes and revokes keys ---------------------------------------------------


def test_a_key_is_shown_once_and_only_its_hash_is_kept(client, session, admin):
    made = _make_key(client, admin)
    raw = made["key"]
    assert raw.startswith("ss_live_") and len(raw) == len("ss_live_") + 43
    assert made["api_key"]["prefix"] == raw[:12]
    row = session.get(ApiKey, made["api_key"]["id"])
    assert raw not in (row.key_hash, row.prefix, row.name)
    listed = client.get("/admin/institutions/braude/api-keys").json()
    assert [k["name"] for k in listed] == ["the library screen"]
    assert "key" not in listed[0] and "key_hash" not in listed[0]


def test_at_most_five_active_keys(client, admin):
    for number in range(api_keys.MAX_ACTIVE):
        _make_key(client, admin, name=f"key {number}")
    answer = client.post("/admin/institutions/braude/api-keys", json={"name": "one too many"})
    assert (answer.status_code, answer.json()["detail"]) == (409, "api_key_limit")


def test_a_student_or_another_campus_admin_cannot_make_keys(client, session, student, braude):
    client.user = student
    assert client.post("/admin/institutions/braude/api-keys", json={"name": "x"}).status_code == 403
    other = make_institution(session, slug="other-college")
    stranger = User(
        institution_id=other.id, email="a@other.example", display_name="A", role=UserRole.INSTITUTION_ADMIN
    )
    session.add(stranger)
    session.flush()
    client.user = stranger
    assert client.post("/admin/institutions/braude/api-keys", json={"name": "x"}).status_code == 404
    assert client.get("/admin/institutions/braude/api-keys").status_code == 404


def test_a_blank_name_is_refused(client, admin):
    client.user = admin
    assert client.post("/admin/institutions/braude/api-keys", json={"name": "   "}).status_code == 422


def test_a_revoked_key_stops_working_and_stays_in_the_list(client, admin):
    made = _make_key(client, admin)
    headers = _as_key(client, made["key"])
    assert client.get("/v1/institution", headers=headers).status_code == 200
    client.user = admin
    assert client.delete(f"/admin/institutions/braude/api-keys/{made['api_key']['id']}").status_code == 204
    assert client.delete(f"/admin/institutions/braude/api-keys/{made['api_key']['id']}").status_code == 404
    assert client.get("/admin/institutions/braude/api-keys").json()[0]["revoked_at"] is not None
    client.user = None
    answer = client.get("/v1/institution", headers=headers)
    assert (answer.status_code, answer.json()["detail"]) == (401, "api_key_invalid")


def test_the_demo_campus_retires_its_oldest_key_instead_of_refusing(session, admin, braude):
    now = SUNDAY_10AM
    made = [
        api_keys.new_key(session, braude, f"k{i}", admin, now + timedelta(seconds=i), KEY, rotate=True)[0]
        for i in range(api_keys.MAX_ACTIVE + 1)
    ]
    assert made[0].revoked_at is not None
    assert len(api_keys.active_keys(session, braude)) == api_keys.MAX_ACTIVE


# --- the key opens /v1 of its own institution only --------------------------------------


def test_no_key_or_a_made_up_key_is_401(client):
    client.user = None
    missing = client.get("/v1/places")
    assert (missing.status_code, missing.json()["detail"]) == (401, "api_key_missing")
    assert missing.headers["www-authenticate"] == "Bearer"
    made_up = client.get("/v1/places", headers={"Authorization": "Bearer ss_live_" + "x" * 43})
    assert (made_up.status_code, made_up.json()["detail"]) == (401, "api_key_invalid")
    assert client.get("/v1/places", headers={"Authorization": "Basic abc"}).status_code == 401


def test_the_institution_and_its_places_with_live_occupancy(client, admin, braude):
    headers = _as_key(client, _make_key(client, admin)["key"])
    me = client.get("/v1/institution", headers=headers).json()
    assert (me["slug"], me["timezone"]) == ("braude", "Asia/Jerusalem")
    assert me["places_count"] > 0
    places = client.get("/v1/places", headers=headers).json()
    library = place_named(braude, "EF", "ספרייה")
    found = next(p for p in places if p["id"] == library.id)
    assert set(found) == {
        "id", "building_code", "kind", "name", "floor", "capacity", "occupied", "available", "is_open",
        "bookable", "free_now", "free_from", "usually_frees_at",
    }
    assert found["is_open"] is True and found["occupied"] == 0
    only_ef = client.get("/v1/places", headers=headers, params={"building": "EF"}).json()
    assert only_ef and {p["building_code"] for p in only_ef} == {"EF"}
    buildings = client.get("/v1/buildings", headers=headers).json()
    assert "EF" in {b["code"] for b in buildings}
    one = client.get(f"/v1/places/{library.id}", headers=headers).json()
    assert one["name"] == "ספרייה"
    forecast = client.get(f"/v1/places/{library.id}/forecast", headers=headers).json()
    assert forecast["place_id"] == library.id and set(forecast) >= {"weekday", "capacity", "slots", "today"}


def test_another_institutions_place_is_not_found(client, session, admin):
    other = make_institution(session, slug="other-college")
    theirs = make_place(session, make_building(session, other, code="Z"))
    headers = _as_key(client, _make_key(client, admin)["key"])
    assert client.get(f"/v1/places/{theirs.id}", headers=headers).status_code == 404
    assert client.get(f"/v1/places/{theirs.id}/forecast", headers=headers).status_code == 404
    assert theirs.id not in {p["id"] for p in client.get("/v1/places", headers=headers).json()}


def test_no_personal_data_in_any_answer(client, session, admin, braude, student):
    headers = _as_key(client, _make_key(client, admin)["key"])
    for path in ("/v1/institution", "/v1/buildings", "/v1/places"):
        text = client.get(path, headers=headers).text
        assert student.email not in text and admin.email not in text


def test_a_key_is_limited_per_minute(client, admin, monkeypatch):
    from app.api import v1

    headers = _as_key(client, _make_key(client, admin)["key"])
    monkeypatch.setattr(v1._per_key, "limit", 2)
    assert [client.get("/v1/institution", headers=headers).status_code for _ in range(3)] == [200, 200, 429]


def test_last_used_is_marked_now_and_then_not_on_every_request(client, session, admin):
    made = _make_key(client, admin)
    headers = _as_key(client, made["key"])
    client.get("/v1/institution", headers=headers)
    row = session.scalars(select(ApiKey).where(ApiKey.id == made["api_key"]["id"])).one()
    first = row.last_used_at
    assert first == SUNDAY_10AM
    client.clock.now = SUNDAY_10AM + timedelta(minutes=1)
    client.get("/v1/institution", headers=headers)
    session.refresh(row)
    assert row.last_used_at == first


def test_the_demo_reset_removes_its_keys(session):
    from app import campus_admin
    from app.seed import seed_demo

    demo = seed_demo(session)
    visitor = User(institution_id=demo.id, email="v@studyspot.invalid", display_name="V", role=UserRole.INSTITUTION_ADMIN)
    session.add(visitor)
    session.flush()
    api_keys.new_key(session, demo, "visitor", visitor, SUNDAY_10AM, KEY)
    campus_admin.reset_demo_extras(session, "demo")
    assert api_keys.active_keys(session, demo) == []


# --- the documentation -------------------------------------------------------------------


def test_the_openapi_of_v1_is_public_and_lists_only_v1(client):
    client.user = None
    schema = client.get("/v1/openapi.json").json()
    assert schema["info"]["title"] == "StudySpot API"
    assert all(path.startswith("/v1/") for path in schema["paths"])
    assert "/v1/places" in schema["paths"] and "/v1/openapi.json" not in schema["paths"]
    assert "HTTPBearer" in schema["components"]["securitySchemes"]
