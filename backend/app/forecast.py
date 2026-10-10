"""The load forecast: how many people a place usually has, quarter hour by
quarter hour, on a given day of the week (the "usually here at this time"
on a place's page).

Each quarter hour is the average of its counts (occupancy_history) on the
same day of the week in the last WEEKS weeks, in the institution's own
time. A plain average: anyone can check it by hand, and with a few
months of data it is as good as anything fancier would be."""

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.history import SLOT
from app.models import Institution, OccupancyHistory, Place, PlaceKind

WEEKS = 8
# Fewer weeks than this and an "average" is one or two random days.
MIN_WEEKS = 2


@dataclass(frozen=True)
class SlotForecast:
    start: time  # local
    people: float


@dataclass(frozen=True)
class Forecast:
    weekday: int  # Python's numbering: Monday is 0
    capacity: int
    weeks: int  # how many past days the averages come from
    simulated: bool  # some of the counts are the demo campus's made-up ones
    closed: bool  # no opening hours that day
    slots: list[SlotForecast]  # empty when closed, or with fewer than MIN_WEEKS
    # Today only: the first quarter hour from now that is usually not full.
    frees_at: time | None


def full_at(place: Place) -> int:
    """How many make the place full: every seat, or one group in a room."""
    return 1 if place.kind == PlaceKind.GROUP_ROOM else place.capacity


def forecast(session: Session, place: Place, weekday: int, now: datetime) -> Forecast:
    zone = ZoneInfo(session.scalar(select(Institution.timezone).where(Institution.id == place.institution_id)))
    local_now = now.astimezone(zone)
    today = local_now.date()
    hours = next((h for h in place.opening_hours if h.weekday == weekday), None)

    first = session.scalar(select(func.min(OccupancyHistory.slot_start)).where(OccupancyHistory.place_id == place.id))
    days = _past_days(today, weekday, first.astimezone(zone).date() if first else None)
    empty = Forecast(weekday, place.capacity, len(days), False, hours is None, [], None)
    if hours is None or len(days) < MIN_WEEKS:
        return empty

    start = datetime.combine(days[-1], time(0), tzinfo=zone)
    end = datetime.combine(days[0] + timedelta(days=1), time(0), tzinfo=zone)
    rows = session.execute(
        select(OccupancyHistory.slot_start, OccupancyHistory.people, OccupancyHistory.simulated).where(
            OccupancyHistory.place_id == place.id,
            OccupancyHistory.slot_start >= start,
            OccupancyHistory.slot_start < end,
        )
    ).all()
    wanted = set(days)
    totals: dict[time, int] = {}
    simulated = False
    for moment, people, made_up in rows:
        local = moment.astimezone(zone)
        if local.date() in wanted:
            totals[local.time()] = totals.get(local.time(), 0) + people
            simulated = simulated or made_up

    slots = [
        SlotForecast(moment, round(totals.get(moment, 0) / len(days), 1))
        for moment in _quarter_hours(hours.opens, hours.closes)
    ]
    frees_at = None
    if weekday == today.weekday():
        current = time(local_now.hour, local_now.minute // 15 * 15)
        frees_at = next(
            (s.start for s in slots if s.start >= current and s.people < full_at(place) - 0.5), None
        )
    return Forecast(weekday, place.capacity, len(days), simulated, False, slots, frees_at)


def _past_days(today: date, weekday: int, first: date | None) -> list[date]:
    """The last WEEKS days with this weekday before today, newest first,
    from the place's first count on (before it, no one was counting)."""
    if first is None:
        return []
    back = (today.weekday() - weekday) % 7 or 7
    days = [today - timedelta(days=back + 7 * n) for n in range(WEEKS)]
    return [d for d in days if d >= first]


def _quarter_hours(opens: time, closes: time) -> list[time]:
    moment = datetime.combine(date.min, opens)
    end = datetime.combine(date.min, closes)
    out = []
    while moment < end:
        out.append(moment.time())
        moment += SLOT
    return out
