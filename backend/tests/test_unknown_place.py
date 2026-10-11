"""A class in a place the campus has not added yet ("אולם ספורט"): kept with
the name the student gave, counted for the institution's admin without
saying who, and joined to the building once the admin adds it."""

from datetime import time

import pytest
from conftest import SUNDAY_10AM
from sqlalchemy import select

from app.between_classes import UNKNOWN_WALK_MINUTES, suggest, walk_minutes
from app.campus_admin import MIN_SHARED_MENTIONS
from app.config import Settings, get_settings
from app.main import app
from app.models import AuthProvider, ClassSlot, User, UserIdentity, UserRole
from app.seed import seed_demo

SUNDAY, MONDAY = 6, 0


def lesson(weekday=SUNDAY, starts="10:00", ends="11:30", **where):
    return {"weekday": weekday, "starts": starts, "ends": ends, "title": "כדורסל", **where}


@pytest.fixture
def admin(session, braude) -> User:
    user = User(institution_id=braude.id, email="a@braude.ac.il", display_name="A", role=UserRole.INSTITUTION_ADMIN)
    session.add(user)
    session.flush()
    return user


def another(session, institution, name="o") -> User:
    user = User(institution_id=institution.id, email=f"{name}@x.example", display_name=name)
    session.add(user)
    session.flush()
    return user


def test_a_class_can_be_in_a_place_not_on_the_list(client):
    response = client.post("/me/classes", json=lesson(place_text="  אולם ספורט "))
    assert response.status_code == 201, response.json()
    body = response.json()
    assert (body["building_code"], body["place_text"]) == (None, "אולם ספורט")
    assert client.get("/me/classes").json()[0]["place_text"] == "אולם ספורט"


@pytest.mark.parametrize(
    "where",
    [
        {},  # neither
        {"building_code": "M", "place_text": "אולם ספורט"},  # both
        {"place_text": "   "},
        {"place_text": "x" * 41},
    ],
)
def test_a_class_is_in_one_place(client, where):
    assert client.post("/me/classes", json=lesson(**where)).status_code == 422


def test_the_place_text_is_plain_text(client):
    body = client.post("/me/classes", json=lesson(place_text="אולם\u202e ספורט")).json()
    assert body["place_text"] == "אולם ספורט"


def test_the_bulk_add_takes_a_place_not_on_the_list(client):
    answers = client.post(
        "/me/classes/bulk", json=[lesson(building_code="M"), lesson(MONDAY, place_text="אולם ספורט")]
    ).json()
    assert answers == [{"refused": None}, {"refused": None}]


def test_the_shared_demo_student_keeps_no_words_of_its_own(client, session, student):
    # Every visitor is that one student: a typed place would be shown to all.
    session.add(UserIdentity(user_id=student.id, provider=AuthProvider.DEMO, subject="braude:student"))
    session.flush()
    assert client.post("/me/classes", json=lesson(place_text="כל מה שמבקר רוצה")).json()["place_text"] == "מקום אחר"


def test_a_gap_next_to_such_a_place_still_gets_suggestions(session, braude, student):
    m = next(b for b in braude.buildings if b.code == "M")
    session.add_all([
        ClassSlot(user_id=student.id, weekday=SUNDAY, starts=time(8, 30), ends=time(10), place_text="אולם ספורט"),
        ClassSlot(user_id=student.id, weekday=SUNDAY, starts=time(11, 30), ends=time(13), building_id=m.id),
    ])
    session.flush()
    [gap] = suggest(session, student, SUNDAY_10AM).gaps
    assert (gap.from_building, gap.to_building) == ("אולם ספורט", "M")
    assert (gap.from_listed, gap.to_listed) == (False, True)
    assert gap.suggestions
    assert all(s.walk_there == UNKNOWN_WALK_MINUTES for s in gap.suggestions)
    assert walk_minutes(None, m) == walk_minutes(m, None) == UNKNOWN_WALK_MINUTES


def test_the_admin_sees_how_many_students_mention_a_place_never_who(client, session, braude, student, admin):
    client.post("/me/classes", json=lesson(place_text="אולם ספורט"))
    client.post("/me/classes", json=lesson(MONDAY, place_text="אולם  ספורט"))  # the same student again
    client.user = another(session, braude)
    client.post("/me/classes", json=lesson(place_text="אולם ספורט"))
    client.post("/me/classes", json=lesson(MONDAY, building_code="M"))
    client.user = admin
    response = client.get("/admin/institutions/braude/mentioned-places")
    assert response.status_code == 200
    assert response.json() == [{"text": "אולם ספורט", "students": 2}]


def test_a_student_and_an_admin_of_another_institution_cannot_read_it(client, session, student):
    assert client.get("/admin/institutions/braude/mentioned-places").status_code == 403
    other = seed_demo(session)
    client.user = User(institution_id=other.id, email="x@y.example", display_name="X", role=UserRole.INSTITUTION_ADMIN)
    session.add(client.user)
    session.flush()
    assert client.get("/admin/institutions/braude/mentioned-places").status_code == 404


def test_on_the_shared_demo_campus_one_visitor_cannot_put_words_in_front_of_others(client, session):
    # The demo admin is shared by every visitor: a place shows only once
    # several students mention it.
    demo = seed_demo(session)
    settings = Settings(database_url="postgresql+psycopg://unused@localhost/unused", demo_login_enabled=True, _env_file=None)
    app.dependency_overrides[get_settings] = lambda: settings
    try:
        visitors = [another(session, demo, f"v{n}") for n in range(MIN_SHARED_MENTIONS)]
        for visitor in visitors[:-1]:
            client.user = visitor
            client.post("/me/classes", json=lesson(place_text="משהו"))
        client.user = User(institution_id=demo.id, email="d@x.example", display_name="D", role=UserRole.INSTITUTION_ADMIN)
        session.add(client.user)
        session.flush()
        assert client.get("/admin/institutions/demo/mentioned-places").json() == []
        admin = client.user
        client.user = visitors[-1]
        client.post("/me/classes", json=lesson(place_text="משהו"))
        client.user = admin
        assert client.get("/admin/institutions/demo/mentioned-places").json() == [
            {"text": "משהו", "students": MIN_SHARED_MENTIONS}
        ]
    finally:
        app.dependency_overrides.pop(get_settings, None)


def test_a_new_building_by_that_name_takes_the_classes(client, session, braude, student, admin):
    client.post("/me/classes", json=lesson(place_text="אולם ספורט"))
    client.post("/me/classes", json=lesson(MONDAY, place_text="ספריה"))
    client.user = admin
    created = client.post(
        "/admin/institutions/braude/buildings", json={"code": "SP", "name": "אולם ספורט", "floors_count": 1}
    )
    assert created.status_code == 201, created.json()
    rows = {r.place_text: r.building_id for r in session.scalars(select(ClassSlot)).all()}
    assert rows["אולם ספורט"] == created.json()["id"]
    assert rows["ספריה"] is None
    assert client.get("/admin/institutions/braude/mentioned-places").json() == [{"text": "ספריה", "students": 1}]
    client.user = student
    assert client.get("/me/classes").json()[0]["building_code"] == "SP"


def test_the_short_name_matches_too_and_only_in_that_institution(client, session, braude, admin):
    demo = seed_demo(session)
    elsewhere = another(session, demo)
    session.add(ClassSlot(user_id=elsewhere.id, weekday=SUNDAY, starts=time(9), ends=time(10), place_text="gym"))
    client.post("/me/classes", json=lesson(place_text="GYM"))
    client.user = admin
    created = client.post("/admin/institutions/braude/buildings", json={"code": "GYM", "floors_count": 1}).json()
    linked = session.scalars(select(ClassSlot).where(ClassSlot.building_id == created["id"])).all()
    assert [c.place_text for c in linked] == ["GYM"]


def test_a_typed_place_that_is_a_listed_building_goes_into_it(client, braude):
    m = next(b for b in braude.buildings if b.code == "M")
    body = client.post("/me/classes", json=lesson(place_text="m")).json()
    assert body["building_code"] == "M"
    if m.name:
        body = client.post("/me/classes", json=lesson(MONDAY, place_text=f" {m.name.upper()} ")).json()
        assert body["building_code"] == "M"


def test_case_does_not_split_a_place_in_two(client, session, braude, admin):
    client.post("/me/classes", json=lesson(place_text="Gym Hall"))
    client.user = another(session, braude)
    client.post("/me/classes", json=lesson(place_text="gym hall"))
    client.user = admin
    [row] = client.get("/admin/institutions/braude/mentioned-places").json()
    assert row["students"] == 2


def test_a_building_under_construction_takes_no_classes(client, session, admin):
    client.post("/me/classes", json=lesson(place_text="אולם ספורט"))
    client.user = admin
    client.post(
        "/admin/institutions/braude/buildings",
        json={"code": "SP", "name": "אולם  ספורט", "floors_count": 1, "status": "under_construction"},
    )
    assert session.scalars(select(ClassSlot)).one().building_id is None


def test_spaces_in_the_building_name_do_not_stop_the_link(client, session, admin):
    client.post("/me/classes", json=lesson(place_text="אולם ספורט"))
    client.user = admin
    client.post("/admin/institutions/braude/buildings", json={"code": "SP", "name": "אולם  ספורט", "floors_count": 1})
    assert session.scalars(select(ClassSlot)).one().building_id is not None


def test_the_daily_demo_reset_puts_linked_classes_back_into_words(session):
    from app.campus_admin import create_building, reset_demo_extras
    from app.models import BuildingStatus

    demo = seed_demo(session)
    visitor = another(session, demo)
    session.add(ClassSlot(user_id=visitor.id, weekday=SUNDAY, starts=time(9), ends=time(10), place_text="אולם ספורט"))
    session.flush()
    create_building(
        session, demo, code="SP", name="אולם ספורט", floors_count=1, status=BuildingStatus.ACTIVE,
        position=None, demo_slug="demo",
    )
    assert session.scalars(select(ClassSlot)).one().building_id is not None
    reset_demo_extras(session, "demo")
    session.expire_all()
    row = session.scalars(select(ClassSlot)).one()
    assert (row.building_id, row.place_text) == (None, "אולם ספורט")
