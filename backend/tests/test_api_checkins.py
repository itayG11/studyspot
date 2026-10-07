"""Check-in and check-out through the API: rules, errors and authorization."""

from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from app.models import User
from conftest import SUNDAY_10AM, code_for, place_named

TZ = ZoneInfo("Asia/Jerusalem")


def local(*args) -> datetime:
    return datetime(*args, tzinfo=TZ).astimezone(UTC)


def parse(text: str) -> datetime:
    return datetime.fromisoformat(text)


@pytest.fixture
def other_student(session, braude) -> User:
    user = User(institution_id=braude.id, email="other@braude.example", display_name="Other")
    session.add(user)
    session.flush()
    return user


def check_in(client, place, seat_id=None):
    body = {"code": code_for(place)}
    if seat_id is not None:
        body["seat_id"] = seat_id
    return client.post("/check-ins", json=body)


def occupied(client, place) -> int:
    return client.get(f"/places/{place.id}").json()["occupied"]


# --- Signed in or not ------------------------------------------------------------


def test_check_in_requires_sign_in(client, braude):
    client.user = None
    response = check_in(client, place_named(braude, "L", "מתחם לימוד"))
    assert response.status_code == 401
    assert client.get("/me/check-in").status_code == 401


# --- Open areas ------------------------------------------------------------------


def test_check_in_to_an_open_area(client, braude):
    area = place_named(braude, "L", "מתחם לימוד")
    response = check_in(client, area)
    assert response.status_code == 201
    body = response.json()
    assert body["place_name"] == "מתחם לימוד" and body["building_code"] == "L"
    assert parse(body["expires_at"]) == SUNDAY_10AM + timedelta(hours=2)
    assert occupied(client, area) == 1
    assert client.get("/me/check-in").json()["id"] == body["id"]


def test_check_in_ends_at_closing_time(client, braude):
    client.clock.now = local(2026, 10, 11, 19, 0)
    response = check_in(client, place_named(braude, "L", "מתחם לימוד"))
    assert parse(response.json()["expires_at"]) == local(2026, 10, 11, 20, 0)


def test_scanning_the_same_place_again_extends_the_check_in(client, braude):
    """Re-scanning means "I'm still here": same check-in, two more hours."""
    area = place_named(braude, "L", "מתחם לימוד")
    first = check_in(client, area).json()
    client.clock.now = SUNDAY_10AM + timedelta(hours=1, minutes=50)
    again = check_in(client, area)
    assert again.status_code == 200
    assert again.json()["id"] == first["id"]
    assert parse(again.json()["expires_at"]) == client.clock.now + timedelta(hours=2)
    assert occupied(client, area) == 1


def test_checking_in_elsewhere_moves_the_student(client, braude):
    l_area = place_named(braude, "L", "מתחם לימוד")
    ef_area = place_named(braude, "EF", "מתחם לימוד")
    check_in(client, l_area)
    moved = check_in(client, ef_area)
    assert moved.status_code == 201
    assert (occupied(client, l_area), occupied(client, ef_area)) == (0, 1)
    assert client.get("/me/check-in").json()["place_id"] == ef_area.id


def test_expired_check_in_is_not_counted(client, braude):
    area = place_named(braude, "L", "מתחם לימוד")
    check_in(client, area)
    client.clock.now = SUNDAY_10AM + timedelta(hours=2, minutes=1)
    assert occupied(client, area) == 0
    assert client.get("/me/check-in").status_code == 404
    # A new check-in closes the expired one instead of tripping over it.
    assert check_in(client, area).status_code == 201


def test_full_place_rejects_check_in(client, session, braude, other_student):
    small = place_named(braude, "P", "מתחם 2")
    small.capacity = 1
    session.flush()
    assert check_in(client, small).status_code == 201
    client.user = other_student
    response = check_in(client, small)
    assert (response.status_code, response.json()["detail"]) == (409, "place_full")


# --- Computer labs ---------------------------------------------------------------


def test_lab_check_in_needs_a_seat(client, braude):
    response = check_in(client, place_named(braude, "M", "M206"))
    assert (response.status_code, response.json()["detail"]) == (400, "seat_required")


def test_lab_check_in_takes_the_seat(client, braude, other_student):
    lab = place_named(braude, "M", "M206")
    seat = lab.seats[0]
    response = check_in(client, lab, seat.id)
    assert response.status_code == 201
    assert response.json()["seat_label"] == "A1"
    seats = client.get(f"/places/{lab.id}").json()["seats"]
    assert [s["label"] for s in seats if s["occupied"]] == ["A1"]

    client.user = other_student
    taken = check_in(client, lab, seat.id)
    assert (taken.status_code, taken.json()["detail"]) == (409, "seat_taken")
    assert check_in(client, lab, lab.seats[1].id).status_code == 201


def test_seat_from_another_lab_is_rejected(client, braude):
    m206 = place_named(braude, "M", "M206")
    m305 = place_named(braude, "M", "M305")
    response = check_in(client, m206, m305.seats[0].id)
    assert (response.status_code, response.json()["detail"]) == (400, "seat_not_in_place")


def test_seat_is_not_allowed_for_an_open_area(client, braude):
    m206 = place_named(braude, "M", "M206")
    response = check_in(client, place_named(braude, "L", "מתחם לימוד"), m206.seats[0].id)
    assert (response.status_code, response.json()["detail"]) == (400, "seat_not_in_place")


# --- Rules that block a check-in --------------------------------------------------


def test_group_room_needs_a_booking(client, braude):
    response = check_in(client, place_named(braude, "EM", "EM107"))
    assert (response.status_code, response.json()["detail"]) == (409, "booking_required")


def test_closed_place_rejects_check_in(client, braude):
    client.clock.now = local(2026, 10, 10, 11, 0)  # Saturday
    response = check_in(client, place_named(braude, "L", "מתחם לימוד"))
    assert (response.status_code, response.json()["detail"]) == (409, "place_closed")


# --- Codes -----------------------------------------------------------------------


@pytest.mark.parametrize("code", ["nonsense", "p3.v1." + "A" * 43])
def test_invalid_code_is_rejected(client, code):
    response = client.post("/check-ins", json={"code": code})
    assert (response.status_code, response.json()["detail"]) == (400, "invalid_code")


def test_revoked_code_is_rejected(client, session, braude):
    area = place_named(braude, "L", "מתחם לימוד")
    old_code = code_for(area)
    area.code_version += 1
    session.flush()
    response = client.post("/check-ins", json={"code": old_code})
    assert (response.status_code, response.json()["detail"]) == (400, "invalid_code")
    assert check_in(client, area).status_code == 201  # the new code works


def test_code_for_a_place_that_does_not_exist(client):
    from app.codes import make_code
    from conftest import TEST_CODE_SECRET

    response = client.post("/check-ins", json={"code": make_code(999999, 1, TEST_CODE_SECRET)})
    assert (response.status_code, response.json()["detail"]) == (400, "invalid_code")


def test_student_of_another_institution_is_rejected(client, session, braude):
    from app.seed import seed_institution

    other = seed_institution(
        session,
        {"institution": {"name": "Other", "slug": "other", "timezone": "Asia/Jerusalem"},
         "buildings": []},
    )
    outsider = User(institution_id=other.id, email="out@other.example", display_name="Out")
    session.add(outsider)
    session.flush()
    client.user = outsider
    response = check_in(client, place_named(braude, "L", "מתחם לימוד"))
    assert (response.status_code, response.json()["detail"]) == (403, "other_institution")


@pytest.mark.parametrize(
    "body",
    [{}, {"code": ""}, {"code": "x" * 81}, {"code": "x", "user_id": 1}, {"code": "x", "seat_id": 0}],
)
def test_malformed_body_is_rejected(client, body):
    assert client.post("/check-ins", json=body).status_code == 422


# --- Check-out -------------------------------------------------------------------


def test_check_out(client, braude):
    area = place_named(braude, "L", "מתחם לימוד")
    created = check_in(client, area).json()
    response = client.post(f"/check-ins/{created['id']}/checkout")
    assert response.status_code == 200
    assert response.json()["end_reason"] == "checkout"
    assert occupied(client, area) == 0
    assert client.post(f"/check-ins/{created['id']}/checkout").status_code == 404


def test_cannot_check_out_someone_else(client, braude, other_student):
    area = place_named(braude, "L", "מתחם לימוד")
    created = check_in(client, area).json()
    client.user = other_student
    assert client.post(f"/check-ins/{created['id']}/checkout").status_code == 404
    assert occupied(client, area) == 1
