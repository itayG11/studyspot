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

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from app.history import SLOT
from app.models import Institution, OccupancyHistory, Place, PlaceKind
from app.occupancy import open_all_day_place_ids

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
    # Today only: the first quarter hour after the one under way that is
    # usually not full.
    frees_at: time | None


def full_at(place: Place) -> int:
    """How many make the place full: every seat, or one group in a room."""
    return 1 if place.kind == PlaceKind.GROUP_ROOM else place.capacity


def forecast(session: Session, place: Place, weekday: int, now: datetime) -> Forecast:
    return forecast_many(session, [place], weekday, now)[place.id]


def forecast_many(session: Session, places: list[Place], weekday: int, now: datetime) -> dict[int, Forecast]:
    """The forecast of every place, one institution's, in a fixed number of
    queries: the first count of each place, every count of the wanted days,
    and the special periods. Asked one by one it was three per place, about
    300 with a hundred places (audit finding E2, wave 7.2)."""
    if not places:
        return {}
    institution = session.get(Institution, places[0].institution_id)
    assert all(p.institution_id == institution.id for p in places), "one institution at a time"
    zone = ZoneInfo(institution.timezone)
    local_now = now.astimezone(zone)
    today = local_now.date()
    ids = [p.id for p in places]

    # From when there are counts: the counting's start (a quiet place has
    # no rows, and is usually empty), or an older row (simulated ones).
    first_rows = dict(
        session.execute(
            select(OccupancyHistory.place_id, func.min(OccupancyHistory.slot_start))
            .where(OccupancyHistory.place_id.in_(ids))
            .group_by(OccupancyHistory.place_id)
        ).all()
    )
    days_of: dict[int, list[date]] = {}
    for place in places:
        first = min((t for t in (institution.counting_since, first_rows.get(place.id)) if t is not None), default=None)
        days_of[place.id] = _past_days(today, weekday, first.astimezone(zone).date() if first else None)

    hours_of = {p.id: next((h for h in p.opening_hours if h.weekday == weekday), None) for p in places}
    counted = [p.id for p in places if hours_of[p.id] is not None and len(days_of[p.id]) >= MIN_WEEKS]
    # Only the wanted days, not every day in between: one in seven rows.
    all_days = sorted({d for pid in counted for d in days_of[pid]})
    totals: dict[int, dict[time, int]] = {pid: {} for pid in counted}
    simulated: dict[int, bool] = dict.fromkeys(counted, False)
    if counted:
        ranges = [
            and_(
                OccupancyHistory.slot_start >= datetime.combine(d, time(0), tzinfo=zone),
                OccupancyHistory.slot_start < datetime.combine(d + timedelta(days=1), time(0), tzinfo=zone),
            )
            for d in all_days
        ]
        rows = session.execute(
            select(
                OccupancyHistory.place_id, OccupancyHistory.slot_start, OccupancyHistory.people, OccupancyHistory.simulated
            ).where(OccupancyHistory.place_id.in_(counted), or_(*ranges))
        ).all()
        wanted = {pid: set(days_of[pid]) for pid in counted}
        for pid, moment, people, made_up in rows:
            local = moment.astimezone(zone)
            if local.date() in wanted[pid]:
                totals[pid][local.time()] = totals[pid].get(local.time(), 0) + people
                simulated[pid] = simulated[pid] or made_up

    # Not in a special period (exams, open all day): the weekly hours, and so
    # the usual day, do not apply then.
    all_day = open_all_day_place_ids(session, institution.id, today) if counted and weekday == today.weekday() else set()
    current = time(local_now.hour, local_now.minute // 15 * 15)
    out: dict[int, Forecast] = {}
    for place in places:
        hours, days = hours_of[place.id], days_of[place.id]
        if place.id not in totals:
            out[place.id] = Forecast(weekday, place.capacity, len(days), False, hours is None, [], None)
            continue
        slots = [
            SlotForecast(moment, round(totals[place.id].get(moment, 0) / len(days), 1))
            for moment in _quarter_hours(hours.opens, hours.closes)
        ]
        frees_at = None
        if weekday == today.weekday() and place.id not in all_day:
            # After the quarter hour under way: the place is full in it right now.
            frees_at = next((s.start for s in slots if s.start > current and s.people < full_at(place) - 0.5), None)
        out[place.id] = Forecast(weekday, place.capacity, len(days), simulated[place.id], False, slots, frees_at)
    return out


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
