"""A student's own timetable (/me/classes): only theirs, in their own
institution's buildings, no two classes at once, and gone with the account."""

import pytest
from sqlalchemy import select

from app.models import ClassSlot, Institution, User, UserRole

SUNDAY, MONDAY = 6, 0  # Python's numbering


def lesson(weekday=SUNDAY, starts="10:00", ends="11:30", building="M", title="מבני נתונים"):
    return {"weekday": weekday, "starts": starts, "ends": ends, "building_code": building, "title": title}


def refused(response, status: int, code: str) -> bool:
    return (response.status_code, response.json().get("detail")) == (status, code)


def test_a_student_adds_lists_and_removes_classes(client):
    created = client.post("/me/classes", json=lesson())
    assert created.status_code == 201
    body = created.json()
    assert (body["weekday"], body["starts"], body["ends"], body["building_code"], body["title"]) == (
        SUNDAY, "10:00:00", "11:30:00", "M", "מבני נתונים",
    )
    client.post("/me/classes", json=lesson(MONDAY, "08:30", "10:00", "EF", None))
    listed = client.get("/me/classes").json()
    # The week as the site shows it: Sunday first.
    assert [(c["weekday"], c["starts"]) for c in listed] == [(SUNDAY, "10:00:00"), (MONDAY, "08:30:00")]
    assert client.delete(f"/me/classes/{body['id']}").status_code == 204
    assert len(client.get("/me/classes").json()) == 1


def test_signed_out_is_refused(client):
    client.user = None
    assert client.get("/me/classes").status_code == 401
    assert client.post("/me/classes", json=lesson()).status_code == 401


def test_two_classes_at_once_are_refused_back_to_back_is_fine(client):
    client.post("/me/classes", json=lesson(starts="10:00", ends="11:30"))
    assert refused(client.post("/me/classes", json=lesson(starts="11:00", ends="12:00")), 409, "class_overlaps")
    assert client.post("/me/classes", json=lesson(starts="11:30", ends="13:00")).status_code == 201
    assert client.post("/me/classes", json=lesson(MONDAY, "11:00", "12:00")).status_code == 201  # another day


@pytest.mark.parametrize(
    "bad",
    [
        {"starts": "12:00", "ends": "11:00"},
        {"starts": "10:00", "ends": "10:00"},
        {"weekday": 7},
        {"title": "x" * 61},
        {"building_code": ""},
    ],
)
def test_bad_details_are_refused(client, bad):
    assert client.post("/me/classes", json={**lesson(), **bad}).status_code == 422


def test_a_building_of_another_institution_is_refused(client, session):
    other = Institution(name="אחר", slug="other", timezone="Asia/Jerusalem")
    session.add(other)
    session.flush()
    assert refused(client.post("/me/classes", json=lesson(building="NOPE")), 404, "building_not_found")


def test_someone_elses_class_cannot_be_removed(client, session, braude, student):
    mine = client.post("/me/classes", json=lesson()).json()
    other = User(institution_id=braude.id, email="o@braude.example", display_name="O", role=UserRole.STUDENT)
    session.add(other)
    session.flush()
    client.user = other
    assert refused(client.delete(f"/me/classes/{mine['id']}"), 404, "class_not_found")
    assert client.get("/me/classes").json() == []


def test_a_timetable_has_a_limit(client, session, braude, student):
    # Filled in directly: through the API the write limit would stop first.
    from datetime import time

    from app.classes import MAX_CLASSES

    building = next(b for b in braude.buildings if b.code == "M")
    for n in range(MAX_CLASSES):
        day, hour = divmod(n, 10)
        session.add(ClassSlot(user_id=student.id, weekday=day, starts=time(8 + hour), ends=time(8 + hour, 50), building_id=building.id))
    session.flush()
    assert refused(client.post("/me/classes", json=lesson(6, "22:00", "22:30")), 409, "class_limit")


def test_the_title_is_plain_text(client):
    body = client.post("/me/classes", json=lesson(title="  אלגוריתמים\u202e ")).json()
    assert body["title"] == "אלגוריתמים"


def test_classes_go_with_the_account(client, session, student):
    client.post("/me/classes", json=lesson())
    session.delete(student)
    session.flush()
    assert session.scalars(select(ClassSlot)).all() == []


def test_the_shared_demo_student_cannot_show_its_own_words_to_every_visitor(client, session, braude, student):
    # Every visitor is the same demo student: a course name typed by one
    # would be shown to all. Only the sample's names are kept.
    from app.models import AuthProvider, UserIdentity

    session.add(UserIdentity(user_id=student.id, provider=AuthProvider.DEMO, subject="braude:student"))
    session.flush()
    assert client.post("/me/classes", json=lesson(title="כל מה שמבקר רוצה")).json()["title"] is None
    assert client.post("/me/classes", json=lesson(MONDAY, title="מבני נתונים")).json()["title"] == "מבני נתונים"


def test_a_building_under_construction_is_refused(client, braude):
    assert refused(client.post("/me/classes", json=lesson(building="NG")), 404, "building_not_found")


@pytest.mark.parametrize("bad", [{"starts": "10:00:30"}, {"starts": "10:00+02:00"}])
def test_times_are_whole_minutes_with_no_zone(client, bad):
    assert client.post("/me/classes", json={**lesson(), **bad}).status_code == 422


def test_the_whole_timetable_can_be_removed_at_once_and_only_mine(client, session, braude, student):
    client.post("/me/classes", json=lesson())
    client.post("/me/classes", json=lesson(MONDAY))
    other = User(institution_id=braude.id, email="o2@braude.example", display_name="O")
    session.add(other)
    session.flush()
    client.user = other
    client.post("/me/classes", json=lesson())
    client.user = student
    response = client.delete("/me/classes")
    assert (response.status_code, response.json()) == (200, {"removed": 2})
    assert client.get("/me/classes").json() == []
    client.user = other
    assert len(client.get("/me/classes").json()) == 1
    client.user = None
    assert client.delete("/me/classes").status_code == 401


def test_the_shared_demo_student_gets_the_sample_back_instead(client, session, braude, student):
    # Every visitor is that student: "remove all" puts the sample back.
    from app.models import AuthProvider, UserIdentity

    session.add(UserIdentity(user_id=student.id, provider=AuthProvider.DEMO, subject="braude:student"))
    session.flush()
    client.post("/me/classes", json=lesson(title=None))
    assert client.delete("/me/classes").status_code == 200
    assert len(client.get("/me/classes").json()) > 0
