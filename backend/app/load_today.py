"""Today's load next to the usual one: the bars of "today" in the load chart.

The history (app/history.py) keeps finished quarter hours and leaves the
demo campus's made-up students out, so today is counted here straight from
the check-ins, the made-up ones too: they are what the live numbers show,
and they are kept for a day (KEEP_SIMULATED), long enough for today.

The campus view sums every place but the group rooms (judged by bookings,
not by how many people are in them). It reads every place's forecast, so
it is kept for a minute per institution: one visitor or a hundred, the
database does the work once a minute."""

import time as clock
from dataclasses import dataclass
from datetime import datetime, time
from zoneinfo import ZoneInfo

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.forecast import Forecast, _quarter_hours, forecast
from app.history import SLOT
from app.models import Institution, Place, PlaceKind
from app.occupancy import occupied_by_place
from app.seed.live import is_simulated_campus

KEEP_FOR = 60.0  # seconds

_COUNT_TODAY = text("""
    SELECT c.place_id, slot.start, count(*)
    FROM generate_series(CAST(:first AS timestamptz), CAST(:last AS timestamptz), interval '15 minutes')
        AS slot(start)
    JOIN check_ins c
        ON c.place_id = ANY(:place_ids)
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
        _COUNT_TODAY, {"first": midnight, "last": current, "place_ids": [p.id for p in places]}
    )
    for place_id, start, people in rows:
        out[place_id][start.astimezone(zone).time()] = people
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


def clear_cache() -> None:
    _cache.clear()


def campus_today(session: Session, institution: Institution, now: datetime) -> CampusToday:
    minute = now.replace(second=0, microsecond=0)
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
    places = [
        p for b in institution.buildings for p in b.places if p.kind != PlaceKind.GROUP_ROOM
    ]
    forecasts: dict[int, Forecast] = {p.id: forecast(session, p, weekday, now) for p in places}
    counts = today_counts(session, places, zone, now)
    live = occupied_by_place(session, [p.id for p in places], now)

    # Every quarter hour any of them is open today.
    starts = sorted({s for p in places for s in _open_quarters(p, weekday)})
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
        next_hour[place.id] = round(min(sum(quarters) / len(quarters) / place.capacity, 1), 2) if quarters and place.capacity else None
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
