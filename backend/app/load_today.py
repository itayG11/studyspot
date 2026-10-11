"""Today's load next to the usual one: the bars of "today" in the load chart.

The history (app/history.py) keeps finished quarter hours and leaves the
demo campus's made-up students out, so today is counted here straight from
the check-ins, the made-up ones too: they are what the live numbers show,
and they are kept for a day (KEEP_SIMULATED), long enough for today.

The campus view sums every place but the group rooms (judged by bookings,
not by how many people are in them). It reads every place's forecast, so
it is kept for a minute per institution: one visitor or a hundred, the
database does the work once a minute."""

import threading
import time as clock
from dataclasses import dataclass
from datetime import datetime, time
from zoneinfo import ZoneInfo

from sqlalchemy import select, text
from sqlalchemy.orm import Session, selectinload

from app.forecast import Forecast, _quarter_hours, forecast
from app.history import SLOT
from app.models import Institution, Place, PlaceKind
from app.occupancy import occupied_by_place, open_all_day_place_ids
from app.seed.live import is_simulated_campus

KEEP_FOR = 60.0  # seconds
ALL_DAY = [time(h, m) for h in range(24) for m in (0, 15, 30, 45)]

_COUNT_TODAY = text("""
    SELECT c.place_id, slot.start, count(*)
    FROM generate_series(CAST(:first AS timestamptz), CAST(:last AS timestamptz), interval '15 minutes')
        AS slot(start)
    JOIN check_ins c
        -- The institution first: ix_check_ins_institution_started serves it.
        ON c.institution_id = :institution_id
        AND c.place_id = ANY(:place_ids)
        AND c.started_at < slot.start + interval '15 minutes'
        AND c.started_at > CAST(:first AS timestamptz) - interval '1 day'
        AND coalesce(c.ended_at, c.expires_at) > slot.start
    GROUP BY c.place_id, slot.start
""")


def today_counts(session: Session, places: list[Place], zone: ZoneInfo, now: datetime) -> dict[int, dict[time, int]]:
    """For each place: local quarter hour -> people, from local midnight to
    the quarter hour under way (it counts the stays so far)."""
    local = now.astimezone(zone)
    midnight = datetime.combine(local.date(), time(0), tzinfo=zone)
    current = local.replace(minute=local.minute // 15 * 15, second=0, microsecond=0)
    out: dict[int, dict[time, int]] = {p.id: {} for p in places}
    if not places:
        return out
    rows = session.execute(
        _COUNT_TODAY,
        {
            "first": midnight, "last": current, "place_ids": [p.id for p in places],
            "institution_id": places[0].institution_id,
        },
    )
    for place_id, start, people in rows:
        local_start = start.astimezone(zone).time()
        # Added up: the night the clocks go back has 01:00–01:45 twice.
        out[place_id][local_start] = out[place_id].get(local_start, 0) + people
    return out


# One place, today: hour by hour, and a few people show as none. Quarter
# hours of a quiet place would tell when one person came and went.
FEWEST_SHOWN = 3


def place_today(session: Session, place: Place, zone: ZoneInfo, now: datetime) -> list[tuple[time, int]]:
    by_hour: dict[int, list[int]] = {}
    local = now.astimezone(zone)
    for start, people in today_counts(session, [place], zone, now)[place.id].items():
        by_hour.setdefault(start.hour, []).append(people)
    out = []
    for hour in range(local.hour + 1):
        quarters = by_hour.get(hour)
        if not quarters:
            continue
        # The quarters so far of that hour: four, or fewer in the hour under way.
        so_far = 4 if hour < local.hour else local.minute // 15 + 1
        people = round(sum(quarters) / so_far)
        out.append((time(hour), people if people >= FEWEST_SHOWN else 0))
    return out


@dataclass(frozen=True)
class CampusSlot:
    start: time
    usual: float | None  # None: no place has a forecast yet
    today: int | None  # None: still to come


@dataclass(frozen=True)
class CampusToday:
    weekday: int
    capacity: int
    occupied: int
    weeks: int
    simulated: bool
    slots: list[CampusSlot]
    next_hour: dict[int, float | None]  # place -> usual share of full in the coming hour


_cache: dict[int, tuple[float, datetime, CampusToday]] = {}
# One worker per institution works it out; the others wait for its answer
# instead of all reading every forecast at the turn of the minute.
_locks: dict[int, threading.Lock] = {}
_locks_guard = threading.Lock()


def clear_cache() -> None:
    _cache.clear()


def campus_today(session: Session, institution: Institution, now: datetime) -> CampusToday:
    minute = now.replace(second=0, microsecond=0)
    with _locks_guard:
        lock = _locks.setdefault(institution.id, threading.Lock())
    with lock:
        kept = _cache.get(institution.id)
        if kept is not None and kept[1] == minute and clock.monotonic() - kept[0] < KEEP_FOR:
            return kept[2]
        result = _work_out(session, institution, now)
        _cache[institution.id] = (clock.monotonic(), minute, result)
        return result


def _work_out(session: Session, institution: Institution, now: datetime) -> CampusToday:
    zone = ZoneInfo(institution.timezone)
    local = now.astimezone(zone)
    weekday = local.weekday()
    places = session.scalars(
        select(Place)
        .where(Place.institution_id == institution.id, Place.kind != PlaceKind.GROUP_ROOM)
        .options(selectinload(Place.opening_hours))
        .order_by(Place.id)
    ).all()
    # Exams and the like: open around the clock today, whatever the weekly hours.
    all_day = open_all_day_place_ids(session, institution.id, local.date())
    forecasts: dict[int, Forecast] = {p.id: forecast(session, p, weekday, now) for p in places}
    counts = today_counts(session, places, zone, now)
    live = occupied_by_place(session, [p.id for p in places], now)

    # Every quarter hour any of them is open today.
    starts = sorted({s for p in places for s in (ALL_DAY if p.id in all_day else _open_quarters(p, weekday))})
    current = time(local.hour, local.minute // 15 * 15)
    with_forecast = [f for f in forecasts.values() if f.slots]
    slots = []
    for start in starts:
        usual = None
        if with_forecast:
            usual = round(sum(next((s.people for s in f.slots if s.start == start), 0) for f in with_forecast), 1)
        today = sum(c.get(start, 0) for c in counts.values()) if start <= current else None
        slots.append(CampusSlot(start, usual, today))

    next_hour: dict[int, float | None] = {}
    coming = {(datetime.combine(local.date(), current) + SLOT * n).time() for n in range(1, 5)}
    for place in places:
        quarters = [s.people for s in forecasts[place.id].slots if s.start in coming]
        # Only when the place is open the whole coming hour: a place about
        # to close is not "usually quiet in an hour".
        whole = len(quarters) == len(coming) and place.id not in all_day
        next_hour[place.id] = round(min(sum(quarters) / len(quarters) / place.capacity, 1), 2) if whole and place.capacity else None
    return CampusToday(
        weekday=weekday,
        capacity=sum(p.capacity for p in places),
        occupied=sum(live.values()),
        weeks=max((f.weeks for f in with_forecast), default=0),
        simulated=is_simulated_campus(institution) or any(f.simulated for f in with_forecast),
        slots=slots,
        next_hour=next_hour,
    )


def _open_quarters(place: Place, weekday: int) -> list[time]:
    hours = next((h for h in place.opening_hours if h.weekday == weekday), None)
    if hours is None:
        return []
    return _quarter_hours(hours.opens, hours.closes)
