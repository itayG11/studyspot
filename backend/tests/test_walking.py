"""Real walking times (wave 9): one OpenRouteService matrix per campus,
fetched by the background sweep when the buildings' places change, kept in
walk_times, and the map estimate whenever there is no routed time."""

import json
from datetime import timedelta
from decimal import Decimal

import httpx
from conftest import SUNDAY_10AM

from app.between_classes import walk_minutes, walk_table
from app.models import Building, WalkTime
from app.walking import MAX_BUILDINGS, RETRY_AFTER, OrsMatrix, fingerprint, placed_buildings, refresh_walks


def fake(seen: list[httpx.Request], status: int = 200, answer=None) -> OrsMatrix:
    def handle(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        n = len(json.loads(request.content)["locations"])
        body = answer if answer is not None else {"durations": [[0 if i == j else 60.0 * (i + j) + 1 for j in range(n)] for i in range(n)]}
        return httpx.Response(status, json=body)

    return OrsMatrix(httpx.Client(transport=httpx.MockTransport(handle)), "test-key", "https://ors.example/v2/matrix/foot-walking")


def rows(session):
    return {(w.from_building_id, w.to_building_id): w.minutes for w in session.query(WalkTime).all()}


def test_one_request_with_every_placed_building_and_the_key(session, braude):
    seen = []
    refresh_walks(session, fake(seen), SUNDAY_10AM)
    placed = placed_buildings(session, braude)
    [request] = seen
    sent = json.loads(request.content)
    assert request.headers["authorization"] == "test-key"
    assert sent["locations"] == [[float(b.longitude), float(b.latitude)] for b in placed]  # longitude first
    assert sent["metrics"] == ["duration"]
    stored = rows(session)
    assert len(stored) == len(placed) * (len(placed) - 1)  # no row from a building to itself
    a, b = placed[0], placed[1]
    assert stored[(a.id, b.id)] == 2  # 61 seconds, rounded up
    assert braude.walks_fingerprint == fingerprint(placed)


def test_nothing_is_asked_again_while_the_buildings_stay_put(session, braude):
    seen = []
    refresh_walks(session, fake(seen), SUNDAY_10AM)
    refresh_walks(session, fake(seen), SUNDAY_10AM + timedelta(days=3))
    assert len(seen) == 1


def test_a_moved_building_asks_again(session, braude):
    seen = []
    refresh_walks(session, fake(seen), SUNDAY_10AM)
    moved = placed_buildings(session, braude)[0]
    moved.latitude += Decimal("0.001")
    session.flush()
    refresh_walks(session, fake(seen), SUNDAY_10AM + timedelta(minutes=1))
    assert len(seen) == 1  # not yet: one request per campus every RETRY_AFTER
    assert rows(session) == {}  # meanwhile the estimate, not times for the old place
    refresh_walks(session, fake(seen), SUNDAY_10AM + RETRY_AFTER)
    assert len(seen) == 2 and rows(session)


def test_a_failure_keeps_the_estimate_and_waits_before_trying_again(session, braude):
    seen = []
    refresh_walks(session, fake(seen, status=500), SUNDAY_10AM)
    assert rows(session) == {}
    refresh_walks(session, fake(seen, status=500), SUNDAY_10AM + RETRY_AFTER - timedelta(minutes=1))
    assert len(seen) == 1  # not every minute: the free plan counts requests
    refresh_walks(session, fake(seen), SUNDAY_10AM + RETRY_AFTER)
    assert len(seen) == 2 and rows(session)


def test_a_malformed_answer_stores_nothing(session, braude):
    seen = []
    refresh_walks(session, fake(seen, answer={"durations": [[1, 2]]}), SUNDAY_10AM)  # wrong size
    assert rows(session) == {}
    assert braude.walks_fingerprint is None


def test_an_unroutable_pair_has_no_row_and_falls_back(session, braude):
    seen = []
    placed_count = len(placed_buildings(session, braude))
    durations = [[0 if i == j else 120.0 for j in range(placed_count)] for i in range(placed_count)]
    durations[0][1] = None
    refresh_walks(session, fake(seen, answer={"durations": durations}), SUNDAY_10AM)
    a, b = placed_buildings(session, braude)[:2]
    assert (a.id, b.id) not in rows(session)
    assert rows(session)[(b.id, a.id)] == 2


def test_without_a_key_nothing_is_sent(session, braude):
    refresh_walks(session, None, SUNDAY_10AM)
    assert rows(session) == {}


def test_a_building_without_a_place_on_the_map_is_left_out(session, braude):
    seen = []
    unplaced = Building(institution_id=braude.id, code="NEW", name="New", floors_count=1)
    session.add(unplaced)
    session.flush()
    refresh_walks(session, fake(seen), SUNDAY_10AM)
    assert unplaced not in placed_buildings(session, braude)
    assert all(unplaced.id not in pair for pair in rows(session))


def test_too_many_buildings_for_one_request_keep_the_estimate(session, braude, monkeypatch):
    monkeypatch.setattr("app.walking.MAX_BUILDINGS", 2)
    seen = []
    refresh_walks(session, fake(seen), SUNDAY_10AM)
    assert seen == [] and rows(session) == {}
    assert MAX_BUILDINGS * MAX_BUILDINGS <= 3500  # OpenRouteService's limit per request


def test_the_routed_time_wins_over_the_estimate(session, braude):
    refresh_walks(session, fake([]), SUNDAY_10AM)
    a, b = placed_buildings(session, braude)[:2]
    table = walk_table(session, braude)
    assert walk_minutes(a, b, table) == table[(a.id, b.id)]
    assert walk_minutes(a, a, table) == 1  # the same building: stairs, not a route
    assert walk_minutes(None, a, table) == walk_minutes(None, a)


def test_a_deleted_building_takes_its_times_with_it(session, braude):
    refresh_walks(session, fake([]), SUNDAY_10AM)
    gone = placed_buildings(session, braude)[0]
    session.delete(gone)
    session.flush()
    assert all(gone.id not in pair for pair in rows(session))


def test_suggestions_walk_by_the_routed_times(session, braude, student):
    from test_between_classes import week

    from app.between_classes import suggest

    placed = placed_buildings(session, braude)
    n = len(placed)
    six = [[0 if i == j else 6 * 60 for j in range(n)] for i in range(n)]  # six minutes everywhere
    refresh_walks(session, fake([], answer={"durations": six}), SUNDAY_10AM)
    week(session, student, braude)
    [gap] = suggest(session, student, SUNDAY_10AM).gaps
    assert {s.walk_there for s in gap.suggestions if s.building_code != "M"} == {6}
    assert suggest(session, student, SUNDAY_10AM).routed_walks


def test_hostile_numbers_are_not_stored(session, braude):
    n = len(placed_buildings(session, braude))
    bad = [True, float("nan"), -5, "60", {"a": 1}, float("inf"), 10 * 60 * 60]
    durations = [[0 if i == j else bad[(i + j) % len(bad)] for j in range(n)] for i in range(n)]
    refresh_walks(session, fake([], answer={"durations": durations}), SUNDAY_10AM)
    assert rows(session) == {}


def test_an_answer_that_is_not_an_object_stores_nothing(session, braude):
    refresh_walks(session, fake([], answer=["durations"]), SUNDAY_10AM)
    assert rows(session) == {}


def test_a_campus_with_one_building_asks_nothing(session, braude):
    for b in placed_buildings(session, braude)[1:]:
        b.latitude = b.longitude = None
    session.flush()
    seen = []
    refresh_walks(session, fake(seen), SUNDAY_10AM)
    assert seen == [] and braude.walks_fingerprint is not None


def test_one_round_asks_at_most_a_few_campuses(session, braude, monkeypatch):
    monkeypatch.setattr("app.walking.MAX_PER_ROUND", 0)
    seen = []
    refresh_walks(session, fake(seen), SUNDAY_10AM)
    assert seen == []
