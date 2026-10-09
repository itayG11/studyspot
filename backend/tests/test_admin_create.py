"""An institution admin adds buildings and places from the admin page.

On the live demo the demo admin is shared by every visitor, so the demo
campus has a cap on additions and is put back to its seed data once a day.
"""

from datetime import date

import pytest
from sqlalchemy import func, select

from app import campus_admin
from app.config import Settings, get_settings
from app.main import app
from app.models import Building, Institution, Place, PlaceKind, Seat, User, UserRole
from app.seed import seed_demo, seed_institution


@pytest.fixture
def admin(session, braude) -> User:
    user = User(
        institution_id=braude.id, email="dalitc@braude.ac.il", display_name="Admin",
        role=UserRole.INSTITUTION_ADMIN,
    )
    session.add(user)
    session.flush()
    return user


@pytest.fixture
def demo(session) -> Institution:
    return seed_demo(session)


@pytest.fixture
def demo_admin(session, demo) -> User:
    user = User(
        institution_id=demo.id, email="demo.admin@studyspot.invalid", display_name="Demo admin",
        role=UserRole.INSTITUTION_ADMIN,
    )
    session.add(user)
    session.flush()
    return user


@pytest.fixture
def demo_on():
    settings = Settings(
        database_url="postgresql+psycopg://unused@localhost/unused",
        demo_login_enabled=True,
        _env_file=None,
    )
    app.dependency_overrides[get_settings] = lambda: settings
    yield settings
    app.dependency_overrides.pop(get_settings, None)


def add_building(client, slug="braude", **body):
    return client.post(f"/admin/institutions/{slug}/buildings", json={"code": "Z", "floors_count": 2, **body})


def add_place(client, building_id, **body):
    values = {"kind": "group_room", "name": "Z101", "floor": 0, "capacity": 8, **body}
    return client.post(f"/admin/buildings/{building_id}/places", json=values)


# --- Buildings ---------------------------------------------------------------------------


def test_admin_adds_a_building(client, admin, session, braude):
    client.user = admin
    response = add_building(client, code="Z", name="בניין חדש", floors_count=3)
    assert response.status_code == 201, response.json()
    body = response.json()
    assert (body["code"], body["floors_count"], body["latitude"]) == ("Z", 3, None)
    building = session.get(Building, body["id"])
    assert building.institution_id == braude.id
    assert building.name == "בניין חדש"


def test_a_building_can_come_with_its_position(client, admin):
    client.user = admin
    body = add_building(client, latitude="32.913", longitude="35.281").json()
    assert (body["latitude"], body["longitude"]) == ("32.913000", "35.281000")


def test_a_building_code_is_unique_in_its_institution(client, admin):
    client.user = admin
    response = add_building(client, code="M")  # Braude already has M
    assert response.status_code == 409
    assert response.json()["detail"] == "building_code_taken"


def test_codes_are_trimmed_and_upper_case(client, admin):
    client.user = admin
    assert add_building(client, code=" zz ").json()["code"] == "ZZ"


@pytest.mark.parametrize(
    "body",
    [
        {"code": ""},
        {"code": "   "},
        {"code": "X" * 17},
        {"code": "A B"},
        {"code": "<b>"},
        {"floors_count": 0},
        {"floors_count": 51},
        {"status": "demolished"},
        {"latitude": "32.9"},  # a position needs both halves
        {"extra": 1},
    ],
)
def test_bad_buildings_are_refused(client, admin, body):
    client.user = admin
    assert add_building(client, **body).status_code == 422


def test_students_cannot_add_buildings(client, braude):
    assert add_building(client).status_code == 403


def test_admin_of_another_institution_cannot_add_buildings(client, session, braude):
    other = seed_institution(
        session, {"institution": {"name": "Other", "slug": "other", "timezone": "Asia/Jerusalem"}, "buildings": []}
    )
    client.user = User(institution_id=other.id, email="a@o.example", display_name="A", role=UserRole.INSTITUTION_ADMIN)
    session.add(client.user)
    session.flush()
    assert add_building(client).status_code == 404


# --- Places ---------------------------------------------------------------------------------


def test_admin_adds_a_group_room_with_the_usual_hours(client, admin, session):
    client.user = admin
    building_id = add_building(client).json()["id"]
    response = add_place(client, building_id, name="Z101", capacity=8)
    assert response.status_code == 201, response.json()
    place = session.get(Place, response.json()["id"])
    assert (place.kind, place.capacity, place.code_version) == (PlaceKind.GROUP_ROOM, 8, 1)
    # Sunday to Thursday 7-20, Friday 7-14, like the campus data.
    assert len(place.opening_hours) == 6
    # It has a sign straight away.
    codes = client.get("/admin/institutions/braude/codes").json()
    assert any(c["place_id"] == place.id for c in codes)
    # And visitors find it.
    names = [p["name"] for p in client.get("/institutions/braude/places").json()]
    assert "Z101" in names


def test_a_computer_lab_gets_its_stations(client, admin, session):
    client.user = admin
    building_id = add_building(client).json()["id"]
    response = add_place(client, building_id, kind="computer_lab", name="Z1", lab_rows=2, lab_cols=3, capacity=None)
    assert response.status_code == 201, response.json()
    place = session.get(Place, response.json()["id"])
    assert place.capacity == 6
    assert session.scalar(select(func.count()).select_from(Seat).where(Seat.place_id == place.id)) == 6


def test_a_computer_lab_needs_rows_and_columns(client, admin):
    client.user = admin
    building_id = add_building(client).json()["id"]
    assert add_place(client, building_id, kind="computer_lab", capacity=None).status_code == 422


def test_other_places_need_a_capacity(client, admin):
    client.user = admin
    building_id = add_building(client).json()["id"]
    assert add_place(client, building_id, capacity=None).status_code == 422


def test_the_floor_must_exist_in_the_building(client, admin):
    client.user = admin
    building_id = add_building(client, floors_count=2).json()["id"]
    response = add_place(client, building_id, floor=2)  # floors 0 and 1 only
    assert response.status_code == 400
    assert response.json()["detail"] == "floor_not_in_building"


def test_a_place_name_is_unique_in_its_building(client, admin):
    client.user = admin
    building_id = add_building(client).json()["id"]
    assert add_place(client, building_id, name="Z101").status_code == 201
    response = add_place(client, building_id, name="Z101")
    assert response.status_code == 409
    assert response.json()["detail"] == "place_name_taken"


def test_admin_of_another_institution_cannot_add_places(client, session, braude):
    other = seed_institution(
        session, {"institution": {"name": "Other", "slug": "other", "timezone": "Asia/Jerusalem"}, "buildings": []}
    )
    client.user = User(institution_id=other.id, email="a@o.example", display_name="A", role=UserRole.INSTITUTION_ADMIN)
    session.add(client.user)
    session.flush()
    building = next(b for b in braude.buildings if b.code == "M")
    response = add_place(client, building.id)
    assert response.status_code == 404
    assert response.json()["detail"] == "building_not_found"


@pytest.mark.parametrize(
    "body",
    [
        {"name": ""},
        {"name": "x" * 101},
        {"capacity": 0},
        {"capacity": 1001},
        {"floor": -1},
        {"kind": "lecture_hall"},
        {"kind": "computer_lab", "lab_rows": 21, "lab_cols": 2, "capacity": None},
        {"location_note": "x" * 301},
    ],
)
def test_bad_places_are_refused(client, admin, body):
    client.user = admin
    building_id = add_building(client).json()["id"]
    assert add_place(client, building_id, **body).status_code == 422


# --- The shared demo admin ------------------------------------------------------------------


def test_the_demo_campus_has_a_cap_on_new_buildings(client, demo_admin, demo_on, monkeypatch):
    monkeypatch.setattr(campus_admin, "DEMO_EXTRA_BUILDINGS", 2)
    client.user = demo_admin
    assert add_building(client, "demo", code="X1").status_code == 201
    assert add_building(client, "demo", code="X2").status_code == 201
    response = add_building(client, "demo", code="X3")
    assert response.status_code == 409
    assert response.json()["detail"] == "demo_campus_full"


def test_the_demo_campus_has_a_cap_on_new_places(client, demo_admin, demo_on, monkeypatch):
    monkeypatch.setattr(campus_admin, "DEMO_EXTRA_PLACES", 1)
    client.user = demo_admin
    building_id = add_building(client, "demo", code="X1").json()["id"]
    assert add_place(client, building_id, name="A").status_code == 201
    response = add_place(client, building_id, name="B")
    assert response.status_code == 409
    assert response.json()["detail"] == "demo_campus_full"


def test_braude_has_no_cap(client, admin, monkeypatch):
    monkeypatch.setattr(campus_admin, "DEMO_EXTRA_BUILDINGS", 0)
    client.user = admin
    assert add_building(client).status_code == 201


def test_the_demo_campus_goes_back_to_its_seed_data(client, session, demo, demo_admin, demo_on):
    client.user = demo_admin
    building_id = add_building(client, "demo", code="X1").json()["id"]
    add_place(client, building_id, name="A")
    seed_building = next(b for b in demo.buildings if b.code == "M")
    add_place(client, seed_building.id, name="M999")
    before = session.scalar(select(func.count()).select_from(Place).where(Place.institution_id == demo.id))

    removed = campus_admin.reset_demo_extras(session, "demo")
    assert removed == (1, 2)  # one building, two places (one inside it)
    assert session.get(Building, building_id) is None
    after = session.scalar(select(func.count()).select_from(Place).where(Place.institution_id == demo.id))
    assert after == before - 2 == 10
    assert {b.code for b in session.scalars(select(Building).where(Building.institution_id == demo.id))} == {
        b["code"] for b in campus_admin.DEMO["buildings"]
    }


def test_braude_is_never_reset(session, braude):
    assert campus_admin.reset_demo_extras(session, "braude") == (0, 0)


def test_the_reset_runs_once_a_day(session, demo, monkeypatch):
    calls: list[str] = []
    monkeypatch.setattr(campus_admin, "reset_demo_extras", lambda db, slug: calls.append(slug) or (0, 0))
    daily = campus_admin.DailyDemoReset()
    daily.maybe_run(session, "demo", date(2026, 10, 9))
    daily.maybe_run(session, "demo", date(2026, 10, 9))
    daily.maybe_run(session, "demo", date(2026, 10, 10))
    assert calls == ["demo", "demo"]


def test_hidden_direction_characters_are_removed_from_names(client, admin, session):
    client.user = admin
    building_id = add_building(client, name="\u202eבניין").json()["id"]
    assert session.get(Building, building_id).name == "בניין"
    place_id = add_place(client, building_id, name="Z\u202e101\u0000").json()["id"]
    assert session.get(Place, place_id).name == "Z101"


def test_a_name_of_only_hidden_characters_is_refused(client, admin):
    client.user = admin
    building_id = add_building(client).json()["id"]
    assert add_place(client, building_id, name="\u202e\u200f").status_code == 422


def test_two_tabs_adding_the_same_code_get_409_not_500(client, admin, monkeypatch):
    from sqlalchemy.exc import IntegrityError

    def lost_the_race(*_args, **_kwargs):
        raise IntegrityError("INSERT INTO buildings", {}, Exception("duplicate key"))

    monkeypatch.setattr("app.api.admin.create_building", lost_the_race)
    client.user = admin
    response = add_building(client)
    assert response.status_code == 409
    assert response.json()["detail"] == "building_code_taken"


def test_a_campus_with_real_sign_in_rules_is_never_reset_even_if_named_demo(session, braude):
    braude.slug = "demo"
    session.flush()
    assert campus_admin.reset_demo_extras(session, "demo") == (0, 0)
