"""Whether a place is open at a given local time, and when it closes."""

from datetime import datetime, time
from zoneinfo import ZoneInfo

from app.hours import opening_status
from app.models import OpeningHours

TZ = ZoneInfo("Asia/Jerusalem")
SUNDAY = datetime(2026, 10, 11, tzinfo=TZ)  # a Sunday
FRIDAY = datetime(2026, 10, 9, tzinfo=TZ)
SATURDAY = datetime(2026, 10, 10, tzinfo=TZ)

WEEK = [OpeningHours(weekday=d, opens=time(7), closes=time(20)) for d in (6, 0, 1, 2, 3)]
FRIDAY_HOURS = [OpeningHours(weekday=4, opens=time(7), closes=time(14))]


def at(day: datetime, hour: int, minute: int = 0) -> datetime:
    return day.replace(hour=hour, minute=minute)


def test_open_during_the_day():
    status = opening_status(WEEK, at(SUNDAY, 10))
    assert status.is_open
    assert status.closes_at == at(SUNDAY, 20)


def test_closed_before_opening_and_at_closing_time():
    assert not opening_status(WEEK, at(SUNDAY, 6, 59)).is_open
    assert opening_status(WEEK, at(SUNDAY, 7)).is_open
    assert not opening_status(WEEK, at(SUNDAY, 20)).is_open


def test_friday_short_day_and_saturday_closed():
    hours = WEEK + FRIDAY_HOURS
    assert opening_status(hours, at(FRIDAY, 13)).is_open
    assert not opening_status(hours, at(FRIDAY, 15)).is_open
    assert not opening_status(hours, at(SATURDAY, 10)).is_open


def test_place_without_friday_hours_is_closed_on_friday():
    assert not opening_status(WEEK, at(FRIDAY, 10)).is_open


def test_special_period_opens_around_the_clock():
    status = opening_status(WEEK, at(SATURDAY, 2), open_all_day=True)
    assert status.is_open
    assert status.closes_at is None


def test_closing_time_keeps_seconds():
    hours = [OpeningHours(weekday=6, opens=time(7), closes=time(22, 0, 30))]
    status = opening_status(hours, at(SUNDAY, 22).replace(second=10))
    assert status.is_open
    assert status.closes_at == at(SUNDAY, 22).replace(second=30)
