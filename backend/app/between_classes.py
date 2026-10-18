"""A place between classes: for each gap in the student's day, the places
worth going to, and why.

For every gap in today's timetable that is long enough and not over, every
place of the institution is tried: the walk there from the class before,
the walk on to the class after, and the time left to sit in between. A
place is kept if that time is long enough, it is open all of it, and it is
not full: now for the gap under way (live counts), or usually at that
hour for a gap later today (the load forecast). The best three, by time to
sit and then by how free, are suggested, each with its numbers.

Walking times are an estimate from the map, not a route: the straight line
times a detour factor, at a slow walking pace. Each suggestion shows them,
so a student can judge."""

import math
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from itertools import pairwise
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.bookings import HORIZON, MAX_UPCOMING, holding
from app.forecast import Forecast, forecast_many, full_at
from app.models import (
    Booking,
    BookingSource,
    Building,
    BuildingStatus,
    ClassSlot,
    Institution,
    Place,
    PlaceKind,
    User,
)
from app.occupancy import occupied_by_place, open_all_day_place_ids

MIN_GAP = timedelta(minutes=30)  # shorter, and there is no time to settle anywhere
MIN_SIT = 20  # minutes left to sit, after both walks
MAX_SUGGESTIONS = 3
# A real day has a handful; this keeps one request bounded, whatever is stored.
MAX_GAPS = 10
WALK_METRES_PER_MINUTE = 80  # a slow pace, with a bag
DETOUR = 1.3  # paths are not straight lines
SAME_BUILDING_MINUTES = 1  # stairs and corridors
UNKNOWN_WALK_MINUTES = 5  # a building not yet placed on the map, or not listed
EARTH_METRES = 6_371_000


def walk_minutes(a: Building | None, b: Building | None) -> int:
    """None: a place the campus does not list yet, so not on the map either."""
    if a is None or b is None:
        return UNKNOWN_WALK_MINUTES
    if a.id == b.id:
        return SAME_BUILDING_MINUTES
    if None in (a.latitude, a.longitude, b.latitude, b.longitude):
        return UNKNOWN_WALK_MINUTES
    lat1, lon1, lat2, lon2 = (math.radians(float(v)) for v in (a.latitude, a.longitude, b.latitude, b.longitude))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    metres = 2 * EARTH_METRES * math.asin(math.sqrt(h))
    return max(1, math.ceil(metres * DETOUR / WALK_METRES_PER_MINUTE))


@dataclass(frozen=True)
class Gap:
    starts: time  # local
    ends: time
    before: ClassSlot
    after: ClassSlot


def find_gaps(classes: list[ClassSlot], now: time) -> list[Gap]:
    """Gaps of one day's classes, at least MIN_GAP long and not over at `now`."""
    ordered = sorted(classes, key=lambda c: c.starts)
    gaps = []
    for before, after in pairwise(ordered):
        length = datetime.combine(date.min, after.starts) - datetime.combine(date.min, before.ends)
        if length >= MIN_GAP and after.starts > now:
            gaps.append(Gap(before.ends, after.starts, before, after))
    return gaps[:MAX_GAPS]


@dataclass(frozen=True)
class Suggestion:
    place_id: int
    name: str
    kind: PlaceKind
    building_code: str
    walk_there: int  # minutes, from the class before
    walk_after: int  # minutes, on to the class after
    sit_from: datetime
    sit_until: datetime
    sit_minutes: int
    bookable: bool
    capacity: int
    available: int | None  # now, for the gap under way (not for rooms)
    usual: float | None  # usually there then, for a gap later today


@dataclass(frozen=True)
class GapSuggestions:
    starts: time
    ends: time
    ends_dt: datetime
    from_building: str  # a building's code, or a place named in words
    to_building: str
    now: bool  # the gap is under way
    from_listed: bool  # from_building is a building's code
    to_listed: bool
    suggestions: list[Suggestion]


@dataclass(frozen=True)
class BetweenClasses:
    weekday: int
    date: date  # the day the gaps are on: today, or the next such weekday
    gaps: list[GapSuggestions]


def suggest(session: Session, user: User, now: datetime, weekday: int | None = None) -> BetweenClasses:
    """Today's gaps, or those of another weekday (its next date): there,
    by the forecast only, as nobody is in the places yet."""
    institution = session.get(Institution, user.institution_id)
    zone = ZoneInfo(institution.timezone)
    local = now.astimezone(zone)
    if weekday is None:
        weekday = local.weekday()
    live = weekday == local.weekday()
    today = local.date() + timedelta(days=(weekday - local.weekday()) % 7)
    classes = session.scalars(
        select(ClassSlot).where(ClassSlot.user_id == user.id, ClassSlot.weekday == weekday)
        .options(selectinload(ClassSlot.building))
    ).all()
    gaps = find_gaps(list(classes), local.time() if live else time(0))
    if not gaps:
        return BetweenClasses(weekday, today, [])

    places = session.scalars(
        select(Place).join(Place.building)
        .where(Place.institution_id == institution.id, Building.status != BuildingStatus.UNDER_CONSTRUCTION)
        .options(selectinload(Place.opening_hours), selectinload(Place.building))
        .order_by(Place.id)
    ).all()
    all_day = open_all_day_place_ids(session, institution.id, today)
    occupied = occupied_by_place(session, [p.id for p in places], now)
    forecasts: dict[int, Forecast] = {}
    # Every booking that holds a room or a seat later today, in one query.
    day_start = datetime.combine(today, time(0), tzinfo=zone)
    day_end = datetime.combine(today + timedelta(days=1), time(0), tzinfo=zone)
    held = session.execute(
        select(Booking.place_id, Booking.seat_id, Booking.starts_at, Booking.ends_at).where(
            Booking.place_id.in_([p.id for p in places]), holding(now),
            Booking.ends_at > max(now, day_start), Booking.starts_at < day_end,
        )
    ).all()
    # The student may book only so many ahead (app/bookings.py).
    can_book = session.scalar(
        select(func.count()).select_from(Booking).where(
            Booking.user_id == user.id, Booking.source == BookingSource.ADVANCE, holding(now), Booking.ends_at > now
        )
    ) < MAX_UPCOMING

    out = []
    for gap in gaps:
        start = datetime.combine(today, gap.starts, tzinfo=zone)
        end = datetime.combine(today, gap.ends, tzinfo=zone)
        under_way = live and start <= now
        begin = (max(start, now) if live else start).astimezone(zone)  # local: opening hours are local times
        found = []
        for place in places:
            there = walk_minutes(gap.before.building, place.building)
            after = walk_minutes(place.building, gap.after.building)
            sit_from = begin + timedelta(minutes=there)
            sit_until = end - timedelta(minutes=after)
            minutes = int((sit_until - sit_from).total_seconds() // 60)
            if minutes < MIN_SIT or not _open_throughout(place, weekday, sit_from, sit_until, place.id in all_day):
                continue
            available = usual = None
            overlapping = [h for h in held if h.place_id == place.id and h.starts_at < sit_until and h.ends_at > sit_from]
            if place.kind == PlaceKind.GROUP_ROOM:
                if overlapping:  # a room is judged by its bookings, not its past
                    continue
            elif place.kind == PlaceKind.COMPUTER_LAB:
                # Seats booked at any point of the stay are not free for it
                # (a walk-in check-in books its seat too).
                available = place.capacity - len({h.seat_id for h in overlapping})
                if available <= 0:
                    continue
                if not under_way:
                    available = None  # not a live count: the forecast speaks
            elif under_way:
                available = place.capacity - occupied.get(place.id, 0)
                if available <= 0:
                    continue
            if not under_way and place.kind != PlaceKind.GROUP_ROOM:
                if not forecasts:  # the first gap that needs one: all places at once
                    forecasts.update(forecast_many(
                        session, [p for p in places if p.kind != PlaceKind.GROUP_ROOM], weekday, now
                    ))
                usual = _busiest(forecasts[place.id], sit_from.time(), sit_until.time())
                if usual is not None and usual >= full_at(place) - 0.5:
                    continue  # usually full at some point of the stay
            found.append(Suggestion(
                place.id, place.name, place.kind, place.building.code, there, after,
                sit_from, sit_until, minutes,
                # Bookable ahead only so far (app/bookings.py HORIZON).
                can_book and place.kind in (PlaceKind.GROUP_ROOM, PlaceKind.COMPUTER_LAB)
                and sit_from <= now + HORIZON,
                place.capacity, available, usual,
            ))
        # The time to sit first: the walk costs it. The place id last, so
        # the order never changes between two looks.
        found.sort(key=lambda s: (-s.sit_minutes, _taken_share(s), s.name, s.place_id))
        out.append(GapSuggestions(
            gap.starts, gap.ends, end, _where(gap.before), _where(gap.after), under_way,
            gap.before.building is not None, gap.after.building is not None, found[:MAX_SUGGESTIONS],
        ))
    return BetweenClasses(weekday, today, out)


def _where(row: ClassSlot) -> str:
    return row.building.code if row.building else row.place_text


def _open_throughout(place: Place, weekday: int, start: datetime, end: datetime, all_day: bool) -> bool:
    """start and end are local times of the same day."""
    if all_day:
        return True
    hours = next((h for h in place.opening_hours if h.weekday == weekday), None)
    return hours is not None and hours.opens <= start.time() and end.time() <= hours.closes


def _busiest(result: Forecast, start: time, end: time) -> float | None:
    """The most usually there at any quarter hour of the stay. None with no
    forecast: too little history, or outside the weekly hours (a special
    period keeps it open)."""
    first = time(start.hour, start.minute // 15 * 15)
    during = [s.people for s in result.slots if first <= s.start < end]
    return max(during) if during else None


def _taken_share(s: Suggestion) -> float:
    if s.available is not None:
        return 1 - s.available / s.capacity
    if s.usual is not None:
        return s.usual / (1 if s.kind == PlaceKind.GROUP_ROOM else s.capacity)
    return 0.5  # nothing known: in the middle
