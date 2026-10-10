"""GET /places/{id}/forecast, and "usually frees up at" on a full place."""

from datetime import timedelta

from conftest import SUNDAY_10AM, place_named

from app.models import CheckIn, OccupancyHistory, User

H = timedelta(hours=1)
Q = timedelta(minutes=15)


def history(session, place, people_by_offset: dict[timedelta, int], weeks=(1, 2)):
    for w in weeks:
        for offset, people in people_by_offset.items():
            moment = SUNDAY_10AM - timedelta(weeks=w) + offset
            session.add(OccupancyHistory(place_id=place.id, slot_start=moment, people=people))
    session.flush()


def test_the_forecast_of_a_day(client, session, braude):
    area = place_named(braude, "L", "מתחם לימוד")
    history(session, area, {timedelta(0): 30})
    body = client.get(f"/places/{area.id}/forecast", params={"weekday": 6}).json()
    assert (body["weekday"], body["weeks"], body["capacity"], body["simulated"], body["closed"]) == (6, 2, 50, False, False)
    ten = next(s for s in body["slots"] if s["start"].startswith("10:00"))
    assert ten["people"] == 30


def test_without_a_day_it_is_today(client, session, braude):
    area = place_named(braude, "L", "מתחם לימוד")
    assert client.get(f"/places/{area.id}/forecast").json()["weekday"] == 6  # SUNDAY_10AM


def test_a_place_with_no_history_has_no_slots(client, braude):
    area = place_named(braude, "L", "מתחם לימוד")
    body = client.get(f"/places/{area.id}/forecast").json()
    assert (body["weeks"], body["slots"]) == (0, [])


def test_a_bad_day_or_place_is_refused(client, braude):
    area = place_named(braude, "L", "מתחם לימוד")
    assert client.get(f"/places/{area.id}/forecast", params={"weekday": 7}).status_code == 422
    assert client.get("/places/999999/forecast").status_code == 404


def fill(session, braude, place):
    for n in range(place.capacity):
        user = User(institution_id=braude.id, email=f"f{n}@braude.example", display_name=f"F{n}")
        session.add(user)
        session.flush()
        session.add(CheckIn(institution_id=braude.id, user_id=user.id, place_id=place.id,
                            started_at=SUNDAY_10AM - Q, expires_at=SUNDAY_10AM + H))
    session.flush()


def test_a_full_place_says_when_it_usually_frees_up(client, session, braude):
    area = place_named(braude, "L", "מתחם לימוד")
    history(session, area, {timedelta(0): 50, Q: 50, 2 * Q: 10})
    fill(session, braude, area)
    places = client.get("/institutions/braude/places").json()
    view = next(p for p in places if p["id"] == area.id)
    assert view["available"] == 0
    assert view["usually_frees_at"].startswith("10:30")


def test_a_place_with_room_has_no_frees_at(client, session, braude):
    area = place_named(braude, "L", "מתחם לימוד")
    history(session, area, {timedelta(0): 50, Q: 10})
    view = next(p for p in client.get("/institutions/braude/places").json() if p["id"] == area.id)
    assert view["usually_frees_at"] is None
