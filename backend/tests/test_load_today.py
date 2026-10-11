"""Today's load, next to the usual one: how many people each quarter hour
of today actually had, from the check-ins themselves (the demo's made-up
ones too, which the history leaves out), and the campus as a whole."""

from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from conftest import place_named
from sqlalchemy import select

from app.load_today import today_counts
from app.models import CheckIn, User
from app.seed import seed_demo
from app.seed.history import simulate_history

TZ = ZoneInfo("Asia/Jerusalem")
SUNDAY_1PM = datetime(2026, 10, 11, 13, 5, tzinfo=TZ)
SUNDAY = datetime(2026, 10, 11, tzinfo=TZ)


def at(hour, minute=0):
    return SUNDAY.replace(hour=hour, minute=minute)


def person(session, institution, n=1):
    user = User(institution_id=institution.id, email=f"p{n}@demo.example", display_name=f"P {n}")
    session.add(user)
    session.flush()
    return user


def stay(session, institution, place, start, end, n=1, simulated=False):
    session.add(
        CheckIn(
            institution_id=institution.id, user_id=person(session, institution, n).id, place_id=place.id,
            started_at=start, expires_at=end, simulated=simulated,
        )
    )
    session.flush()


def test_each_quarter_hour_of_today_counts_the_stays_in_it(session):
    demo = seed_demo(session)
    area = place_named(demo, "L", "מתחם לימוד")
    stay(session, demo, area, at(10), at(11), n=1)
    stay(session, demo, area, at(10, 30), at(12), n=2, simulated=True)
    counts = today_counts(session, [area], TZ, SUNDAY_1PM)[area.id]
    assert counts[time(10, 0)] == 1
    assert counts[time(10, 30)] == 2  # the made-up student counts too
    assert counts[time(11, 30)] == 1  # the made-up one, to 12:00
    assert time(12, 0) not in counts  # nobody then
    # Not tomorrow's, not before midnight, nothing after the quarter hour under way.
    assert all(t <= time(13, 0) for t in counts)


def test_yesterdays_stays_are_not_today(session):
    demo = seed_demo(session)
    area = place_named(demo, "L", "מתחם לימוד")
    stay(session, demo, area, at(10) - timedelta(days=1), at(11) - timedelta(days=1))
    # A stay from before midnight counts only from midnight on.
    stay(session, demo, area, at(0) - timedelta(minutes=30), at(0, 20), n=2)
    counts = today_counts(session, [area], TZ, SUNDAY_1PM)[area.id]
    assert counts == {time(0, 0): 1, time(0, 15): 1}


def test_the_campus_endpoint_sums_places_and_says_the_usual(client, session):
    demo = seed_demo(session)
    simulate_history(session, demo, SUNDAY_1PM.date())
    client.clock.now = SUNDAY_1PM
    area = place_named(demo, "L", "מתחם לימוד")
    stay(session, demo, area, at(9), SUNDAY_1PM + timedelta(hours=1))
    body = client.get("/institutions/demo/load/today").json()
    assert body["weekday"] == 6 and body["simulated"] is True
    assert body["occupied"] == 1  # live, now
    rooms = sum(p.capacity for b in demo.buildings for p in b.places if p.kind == "group_room")
    everyone = sum(p.capacity for b in demo.buildings for p in b.places)
    assert body["capacity"] == everyone - rooms  # rooms are judged by bookings, not people
    by_start = {s["start"]: s for s in body["slots"]}
    assert by_start["09:00:00"]["today"] == 1
    assert by_start["12:00:00"]["usual"] > by_start["07:00:00"]["usual"]
    assert by_start["15:00:00"]["today"] is None  # still to come
    shares = {p["place_id"]: p["next_hour"] for p in body["places"]}
    assert 0 <= shares[area.id] <= 1


def test_a_campus_with_no_history_says_no_usual(client, session, braude):
    body = client.get("/institutions/braude/load/today").json()
    assert body["weeks"] == 0
    assert all(s["usual"] is None for s in body["slots"])


def test_unknown_institution_is_404(client):
    assert client.get("/institutions/nowhere/load/today").status_code == 404


def test_the_answer_is_kept_for_a_minute(client, session):
    demo = seed_demo(session)
    client.clock.now = SUNDAY_1PM
    first = client.get("/institutions/demo/load/today").json()["occupied"]
    area = place_named(demo, "L", "מתחם לימוד")
    stay(session, demo, area, SUNDAY_1PM - timedelta(minutes=5), SUNDAY_1PM + timedelta(hours=1))
    assert client.get("/institutions/demo/load/today").json()["occupied"] == first
    client.clock.now = SUNDAY_1PM + timedelta(minutes=1)
    assert client.get("/institutions/demo/load/today").json()["occupied"] == first + 1


def test_a_place_forecast_for_today_has_todays_counts(client, session):
    demo = seed_demo(session)
    client.clock.now = SUNDAY_1PM
    area = place_named(demo, "L", "מתחם לימוד")
    stay(session, demo, area, at(9), at(10))
    today = client.get(f"/places/{area.id}/forecast").json()["today"]
    assert {"start": "09:00:00", "people": 1} in today
    other_day = client.get(f"/places/{area.id}/forecast?weekday=0").json()["today"]
    assert other_day == []
    assert session.scalars(select(CheckIn)).all()  # untouched
