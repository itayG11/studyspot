"""Adding buildings and places from the admin page.

The demo admin of the live site is shared by every visitor, so the demo
campus takes at most a few additions, and once a day it is put back to its
seed data (app/seed/demo.py). A real institution has neither limit.
"""

from datetime import date
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.errors import Refusal
from app.models import Building, BuildingStatus, Institution, Place, PlaceKind, floor_exists
from app.seed import _make_place
from app.seed.braude import WEEK_AND_FRIDAY
from app.seed.demo import DEMO

# Room on top of the seed data for visitors to try the forms.
DEMO_EXTRA_BUILDINGS = 5
DEMO_EXTRA_PLACES = 20

_DEMO_SLUG = DEMO["institution"]["slug"]
DEMO_TIMEZONE = ZoneInfo(DEMO["institution"]["timezone"])  # "once a day" by the campus's clock
_SEED_BUILDINGS = {b["code"] for b in DEMO["buildings"]}
_SEED_PLACES = {(b["code"], p["name"]) for b in DEMO["buildings"] for p in b["places"]}


def _is_demo(institution: Institution, demo_slug: str | None) -> bool:
    return demo_slug is not None and institution.slug == demo_slug == _DEMO_SLUG


def _count(db: Session, model, institution_id: int) -> int:
    return db.scalar(select(func.count()).select_from(model).where(model.institution_id == institution_id))


def create_building(
    db: Session,
    institution: Institution,
    *,
    code: str,
    name: str | None,
    floors_count: int,
    status: BuildingStatus,
    position: tuple[Decimal, Decimal] | None,
    demo_slug: str | None,
) -> Building:
    full = len(_SEED_BUILDINGS) + DEMO_EXTRA_BUILDINGS
    if _is_demo(institution, demo_slug) and _count(db, Building, institution.id) >= full:
        raise Refusal(409, "demo_campus_full")
    taken = db.scalars(
        select(Building.id).where(Building.institution_id == institution.id, Building.code == code)
    ).first()
    if taken is not None:
        raise Refusal(409, "building_code_taken")
    building = Building(code=code, name=name, floors_count=floors_count, status=status)
    if position is not None:
        building.latitude, building.longitude = position
    institution.buildings.append(building)
    db.flush()
    return building


def create_place(db: Session, building: Building, details: dict, *, demo_slug: str | None) -> Place:
    """details: kind, name, floor, capacity or lab_rows and lab_cols, location_note."""
    full = len(_SEED_PLACES) + DEMO_EXTRA_PLACES
    if _is_demo(building.institution, demo_slug) and _count(db, Place, building.institution_id) >= full:
        raise Refusal(409, "demo_campus_full")
    if not floor_exists(details["floor"], building.floors_count):
        raise Refusal(400, "floor_not_in_building")
    taken = db.scalars(select(Place.id).where(Place.building_id == building.id, Place.name == details["name"])).first()
    if taken is not None:
        raise Refusal(409, "place_name_taken")
    # The same builder as the seed data, with the campus's usual hours.
    place = _make_place(building, details, WEEK_AND_FRIDAY)
    if place.kind != PlaceKind.COMPUTER_LAB:
        place.lab_rows = place.lab_cols = None
    building.places.append(place)
    db.flush()
    return place


def reset_demo_extras(db: Session, slug: str) -> tuple[int, int]:
    """Delete what visitors added to the demo campus: buildings and places
    that are not in its seed data. Returns (buildings, places) removed.
    The database removes their seats, hours, bookings and check-ins with
    them (ON DELETE CASCADE)."""
    if slug != _DEMO_SLUG:
        return (0, 0)
    institution = db.scalars(select(Institution).where(Institution.slug == slug)).first()
    if institution is None:
        return (0, 0)
    rows = db.execute(
        select(Place.id, Building.code, Place.name).join(Place.building).where(Place.institution_id == institution.id)
    ).all()
    extra_places = [pid for pid, code, name in rows if (code, name) not in _SEED_PLACES]
    extra_buildings = [
        bid
        for bid, code in db.execute(
            select(Building.id, Building.code).where(Building.institution_id == institution.id)
        ).all()
        if code not in _SEED_BUILDINGS
    ]
    if extra_places:
        db.execute(delete(Place).where(Place.id.in_(extra_places)))
    if extra_buildings:
        db.execute(delete(Building).where(Building.id.in_(extra_buildings)))
    db.flush()
    db.expire_all()
    return (len(extra_buildings), len(extra_places))


class DailyDemoReset:
    """Runs reset_demo_extras at most once per calendar day, from the
    background sweep. Kept in memory: a restart only means one extra reset."""

    def __init__(self) -> None:
        self.last: date | None = None

    def maybe_run(self, db: Session, slug: str, today: date) -> tuple[int, int] | None:
        if self.last == today:
            return None
        self.last = today
        return reset_demo_extras(db, slug)
