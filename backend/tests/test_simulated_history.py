"""The demo campus has no real past, so it gets eight weeks of made-up
counts, remade every day with the demo's daily reset. Labelled simulated,
and kept within each place's opening hours and capacity."""

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from conftest import SUNDAY_10AM, place_named
from sqlalchemy import select

from app import campus_admin
from app.forecast import WEEKS, forecast
from app.models import OccupancyHistory
from app.seed import seed_demo
from app.seed.history import simulate_history

TZ = ZoneInfo("Asia/Jerusalem")
TODAY = SUNDAY_10AM.astimezone(TZ).date()


def rows(session, institution):
    ids = [p.id for b in institution.buildings for p in b.places]
    return session.scalars(select(OccupancyHistory).where(OccupancyHistory.place_id.in_(ids))).all()


def test_counts_only_when_open_and_never_over_capacity(session):
    demo = seed_demo(session)
    simulate_history(session, demo, TODAY)
    places = {p.id: p for b in demo.buildings for p in b.places}
    made = rows(session, demo)
    assert made and all(r.simulated for r in made)
    for row in made:
        place, local = places[row.place_id], row.slot_start.astimezone(TZ)
        hours = next(h for h in place.opening_hours if h.weekday == local.weekday())
        assert hours.opens <= local.time() < hours.closes
        assert 0 < row.people <= place.capacity
        assert TODAY - timedelta(weeks=WEEKS) <= local.date() < TODAY


def test_midday_is_busier_than_early_morning(session):
    demo = seed_demo(session)
    simulate_history(session, demo, TODAY)
    result = forecast(session, place_named(demo, "L", "מתחם לימוד"), 6, SUNDAY_10AM)
    by_time = {s.start: s.people for s in result.slots}
    assert result.simulated and result.weeks == WEEKS
    assert by_time[time(12)] > by_time[time(7)]


def test_made_again_it_is_the_same_and_keeps_real_counts(session):
    demo = seed_demo(session)
    area = place_named(demo, "L", "מתחם לימוד")
    real_at = datetime.combine(TODAY - timedelta(days=7), time(12), tzinfo=TZ)
    session.add(OccupancyHistory(place_id=area.id, slot_start=real_at, people=1, simulated=False))
    session.flush()
    simulate_history(session, demo, TODAY)
    first = sorted((r.place_id, r.slot_start, r.people) for r in rows(session, demo))
    simulate_history(session, demo, TODAY)
    assert sorted((r.place_id, r.slot_start, r.people) for r in rows(session, demo)) == first
    real = session.get(OccupancyHistory, (area.id, real_at))
    assert (real.people, real.simulated) == (1, False)


def test_the_daily_reset_remakes_it(session):
    demo = seed_demo(session)
    campus_admin.reset_demo_if_due(session, "demo", date(2026, 10, 11))
    assert rows(session, demo)


def test_a_real_campus_never_gets_made_up_counts(session, braude):
    # Braude has real sign-in rules: whatever calls it, no simulated past.
    assert simulate_history(session, braude, TODAY) == 0
    assert rows(session, braude) == []


def test_a_demo_reset_earlier_today_still_gets_its_history(session):
    # The day's reset ran before this version went up: no waiting a day.
    demo = seed_demo(session)
    demo.demo_reset_on = date(2026, 10, 11)
    session.flush()
    assert campus_admin.reset_demo_if_due(session, "demo", date(2026, 10, 11)) is None
    assert rows(session, demo)
