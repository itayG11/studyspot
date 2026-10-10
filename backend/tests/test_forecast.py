"""The load forecast: for a place and a day of the week, the average count
of each quarter hour over the last eight weeks. A plain average, easy to
check by hand; no learning."""

from datetime import time, timedelta
from zoneinfo import ZoneInfo

from conftest import SUNDAY_10AM, place_named

from app.forecast import MIN_WEEKS, WEEKS, forecast
from app.models import OccupancyHistory

TZ = ZoneInfo("Asia/Jerusalem")
SUNDAY, SATURDAY = 6, 5  # Python's numbering: Monday is 0


def at(weeks_ago: int, hour: int, minute: int = 0):
    """Sunday `weeks_ago` weeks before SUNDAY_10AM, at a local time."""
    day = SUNDAY_10AM.astimezone(TZ).date() - timedelta(weeks=weeks_ago)
    from datetime import datetime

    return datetime.combine(day, time(hour, minute), tzinfo=TZ)


def count(session, place, moment, people, simulated=False):
    session.add(OccupancyHistory(place_id=place.id, slot_start=moment, people=people, simulated=simulated))
    session.flush()


def slot(result, hour, minute=0):
    return next(s for s in result.slots if s.start == time(hour, minute))


def test_each_quarter_hour_is_the_average_of_the_past_weeks(session, braude):
    area = place_named(braude, "L", "מתחם לימוד")
    for weeks_ago, people in ((1, 20), (2, 30), (3, 40)):
        count(session, area, at(weeks_ago, 10), people)
    result = forecast(session, area, SUNDAY, SUNDAY_10AM)
    assert result.weeks == 3
    assert slot(result, 10).people == 30
    assert result.simulated is False


def test_a_week_with_no_one_at_that_time_counts_as_zero(session, braude):
    area = place_named(braude, "L", "מתחם לימוד")
    count(session, area, at(3, 9), 5)  # the history starts three weeks ago
    count(session, area, at(1, 11), 9)
    assert slot(forecast(session, area, SUNDAY, SUNDAY_10AM), 11).people == 3


def test_the_slots_follow_the_opening_hours(session, braude):
    area = place_named(braude, "L", "מתחם לימוד")
    for weeks_ago in (1, 2):
        count(session, area, at(weeks_ago, 10), 1)
    result = forecast(session, area, SUNDAY, SUNDAY_10AM)
    assert (result.slots[0].start, result.slots[-1].start) == (time(7), time(19, 45))


def test_a_day_the_place_is_closed_has_no_slots(session, braude):
    area = place_named(braude, "L", "מתחם לימוד")
    for weeks_ago in (1, 2):
        count(session, area, at(weeks_ago, 10), 1)
    result = forecast(session, area, SATURDAY, SUNDAY_10AM)
    assert result.closed and result.slots == []


def test_too_little_history_says_so_instead_of_guessing(session, braude):
    area = place_named(braude, "L", "מתחם לימוד")
    count(session, area, at(1, 10), 12)
    result = forecast(session, area, SUNDAY, SUNDAY_10AM)
    assert result.weeks == 1 < MIN_WEEKS
    assert result.slots == []


def test_only_the_last_eight_weeks_count(session, braude):
    area = place_named(braude, "L", "מתחם לימוד")
    count(session, area, at(WEEKS + 1, 10), 50)
    for weeks_ago in range(1, WEEKS + 1):
        count(session, area, at(weeks_ago, 10), 8)
    result = forecast(session, area, SUNDAY, SUNDAY_10AM)
    assert (result.weeks, slot(result, 10).people) == (WEEKS, 8)


def test_today_itself_is_not_part_of_the_average(session, braude):
    area = place_named(braude, "L", "מתחם לימוד")
    for weeks_ago in (1, 2):
        count(session, area, at(weeks_ago, 9), 10)
    count(session, area, at(0, 9), 50)
    assert slot(forecast(session, area, SUNDAY, SUNDAY_10AM), 9).people == 10


def test_when_it_usually_frees_up_today(session, braude):
    area = place_named(braude, "L", "מתחם לימוד")  # 50 seats
    for weeks_ago in (1, 2):
        count(session, area, at(weeks_ago, 10), 50)
        count(session, area, at(weeks_ago, 10, 15), 50)
        count(session, area, at(weeks_ago, 10, 30), 20)
    assert forecast(session, area, SUNDAY, SUNDAY_10AM).frees_at == time(10, 30)
    # Only for today: another day's forecast has no "now".
    assert forecast(session, area, 0, SUNDAY_10AM).frees_at is None


def test_simulated_counts_are_marked(session, braude):
    area = place_named(braude, "L", "מתחם לימוד")
    count(session, area, at(1, 10), 3, simulated=True)
    count(session, area, at(2, 10), 3)
    assert forecast(session, area, SUNDAY, SUNDAY_10AM).simulated is True
