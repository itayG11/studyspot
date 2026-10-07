"""Read-only campus endpoints: open to everyone, numbers match the Braude data."""

from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from conftest import place_named

TZ = ZoneInfo("Asia/Jerusalem")


def local(*args) -> datetime:
    return datetime(*args, tzinfo=TZ).astimezone(UTC)


def test_buildings_with_occupancy(client):
    response = client.get("/institutions/braude/buildings")
    assert response.status_code == 200
    buildings = {b["code"]: b for b in response.json()}
    assert set(buildings) == {"M", "L", "EM", "EF", "P", "NX", "NG"}
    assert (buildings["M"]["places_count"], buildings["M"]["capacity"]) == (2, 65)
    assert (buildings["M"]["occupied"], buildings["M"]["available"]) == (0, 65)
    assert buildings["NG"]["status"] == "under_construction"
    assert buildings["NX"]["places_count"] == 0


def test_unknown_institution_is_404(client):
    assert client.get("/institutions/nowhere/buildings").status_code == 404
    assert client.get("/institutions/nowhere/places").status_code == 404


def test_places_list_and_filters(client):
    everything = client.get("/institutions/braude/places").json()
    assert len(everything) == 10
    assert all(p["is_open"] for p in everything)  # Sunday 10:00

    library = client.get("/institutions/braude/places", params={"kind": "library"}).json()
    assert [(p["building_code"], p["capacity"], p["counted"]) for p in library] == [("EF", 80, True)]

    in_p = client.get("/institutions/braude/places", params={"building": "P"}).json()
    assert sorted(p["name"] for p in in_p) == ["מתחם 1", "מתחם 2"]


def test_invalid_kind_filter_is_rejected(client):
    response = client.get("/institutions/braude/places", params={"kind": "lecture_hall"})
    assert response.status_code == 422


def test_lab_detail_has_a_seat_map(client, braude):
    m206 = place_named(braude, "M", "M206")
    detail = client.get(f"/places/{m206.id}").json()
    assert (detail["lab_rows"], detail["lab_cols"]) == (5, 8)
    assert len(detail["seats"]) == 40
    assert not any(seat["occupied"] for seat in detail["seats"])
    assert detail["bookable"] and not detail["counted"]
    assert len(detail["opening_hours"]) == 6


def test_open_area_detail_has_no_seats(client, braude):
    area = place_named(braude, "L", "מתחם לימוד")
    assert client.get(f"/places/{area.id}").json()["seats"] is None


def test_unknown_place_is_404(client):
    assert client.get("/places/999999").status_code == 404


def test_closed_on_saturday(client):
    client.clock.now = local(2026, 10, 10, 11, 0)
    places = client.get("/institutions/braude/places").json()
    assert not any(p["is_open"] for p in places)


def test_exam_period_opens_l_and_ef_areas_at_night(client):
    client.clock.now = local(2027, 1, 30, 2, 0)  # Saturday, 02:00, inside the demo exam period
    places = client.get("/institutions/braude/places").json()
    open_now = {(p["building_code"], p["name"]) for p in places if p["is_open"]}
    assert open_now == {("L", "מתחם לימוד"), ("EF", "מתחם לימוד")}


def test_anonymous_visitors_can_read(client):
    client.user = None
    assert client.get("/institutions/braude/buildings").status_code == 200
