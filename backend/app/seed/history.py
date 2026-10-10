"""Made-up occupancy history for the demo campus, so a visitor sees the
load forecast work. Remade with the daily reset (app/campus_admin.py), for
the eight weeks up to yesterday, and labelled simulated: the site says so
next to every forecast built from it.

The shape is a guess at a college day, not data: busy late in the morning
and early afternoon, a smaller bump after lunch classes, quiet evenings
and a short Friday. Never outside opening hours, never over capacity, and
the same every time (a fixed seed), so the tests can rely on it."""

import math
import random
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.forecast import WEEKS, full_at
from app.history import SLOT
from app.models import Institution, OccupancyHistory, Place, PlaceKind
from app.seed.demo import DEMO

FRIDAY = 4
BATCH = 5000
# How full each kind gets at its busiest hour.
PEAK = {PlaceKind.LIBRARY: 0.85, PlaceKind.OPEN_AREA: 0.7, PlaceKind.COMPUTER_LAB: 0.75, PlaceKind.GROUP_ROOM: 0.8}


def _shape(hour: float) -> float:
    """0 to 1: how busy a college day is at this hour."""
    late_morning = math.exp(-(((hour - 12) / 2.2) ** 2))
    afternoon = 0.55 * math.exp(-(((hour - 16.5) / 1.5) ** 2))
    return max(late_morning, afternoon)


def simulate_history(session: Session, institution: Institution, today: date) -> int:
    """Replaces this institution's simulated counts. Real counts stay.
    Only the demo campus: a campus with real sign-in rules gets nothing,
    whatever calls this (its empty quarter hours would fill with made-up
    numbers)."""
    if institution.slug != DEMO["institution"]["slug"] or institution.login_rules:
        return 0
    places = session.scalars(select(Place).where(Place.institution_id == institution.id)).all()
    ids = [p.id for p in places]
    session.execute(
        delete(OccupancyHistory).where(OccupancyHistory.place_id.in_(ids), OccupancyHistory.simulated)
    )
    zone = ZoneInfo(institution.timezone)
    rows = []
    for place in places:
        hours = {h.weekday: h for h in place.opening_hours}
        for back in range(1, WEEKS * 7 + 1):
            day = today - timedelta(days=back)
            if day.weekday() not in hours:
                continue
            rng = random.Random(f"{place.name}/{place.kind}/{day.isoformat()}")
            day_scale = 0.4 if day.weekday() == FRIDAY else 1.0
            moment = datetime.combine(day, hours[day.weekday()].opens, tzinfo=zone)
            closes = datetime.combine(day, hours[day.weekday()].closes, tzinfo=zone)
            while moment < closes:
                busy = PEAK[place.kind] * _shape(moment.hour + moment.minute / 60) * day_scale
                if place.kind == PlaceKind.GROUP_ROOM:
                    people = 1 if rng.random() < busy else 0
                else:
                    people = min(place.capacity, round(full_at(place) * busy * rng.uniform(0.8, 1.15)))
                if people > 0:
                    rows.append({"place_id": place.id, "slot_start": moment, "people": people, "simulated": True})
                moment += SLOT
    # In batches: one statement takes at most 65535 values (4 per row).
    for first in range(0, len(rows), BATCH):
        # A real count for the same quarter hour wins.
        session.execute(insert(OccupancyHistory).values(rows[first : first + BATCH]).on_conflict_do_nothing())
    session.flush()
    return len(rows)
