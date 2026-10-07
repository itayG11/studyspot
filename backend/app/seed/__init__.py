"""Load campus data into the database.

seed_institution() takes campus data as plain Python structures (the shape
of app/seed/braude.py) and creates the institution with its buildings,
places, lab seats, opening hours and special periods. It is written to be
reusable by the campus-table upload planned for week two.
"""

from collections.abc import Mapping
from datetime import time
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Building,
    BuildingStatus,
    Institution,
    OpeningHours,
    Place,
    PlaceKind,
    Seat,
    SpecialPeriod,
    SpecialPeriodPlace,
    floor_exists,
)
from app.seed.braude import BRAUDE

Hours = Mapping[int, tuple[time, time]]


def seat_label(row: int, col: int) -> str:
    """Row letter plus column number, like a cinema: row 1 column 1 is "A1"."""
    if not 1 <= row <= 26:
        raise ValueError(f"lab row {row} is out of range 1-26")
    return f"{chr(ord('A') + row - 1)}{col}"


def seed_institution(session: Session, data: Mapping[str, Any]) -> Institution:
    """Create an institution from campus data. Does nothing if it already exists.

    Raises ValueError for data the database cannot check on its own, such
    as a place on a floor its building does not have.
    """
    info = data["institution"]
    existing = session.scalars(select(Institution).where(Institution.slug == info["slug"])).first()
    if existing is not None:
        return existing

    institution = Institution(**info)
    session.add(institution)

    periods = {
        p["key"]: SpecialPeriod(
            institution=institution, name=p["name"], starts_on=p["starts_on"], ends_on=p["ends_on"]
        )
        for p in data.get("special_periods", [])
    }
    session.add_all(periods.values())

    # Children are appended to their parent's collection: since SQLAlchemy
    # 2.0, setting only the child's many-to-one side (Building(institution=...))
    # does not add the child to the session.
    default_hours: Hours = data.get("default_hours", {})
    for b in data["buildings"]:
        building = Building(
            code=b["code"],
            floors_count=b["floors_count"],
            status=BuildingStatus(b.get("status", "active")),
        )
        institution.buildings.append(building)
        hours: Hours = b.get("hours", default_hours)
        for p in b["places"]:
            place = _make_place(building, p, hours)
            building.places.append(place)
            for key in p.get("special_periods", []):
                # The link copies institution_id from the period, and the
                # database checks that the place has the same one.
                periods[key].place_links.append(SpecialPeriodPlace(place=place))

    session.flush()
    return institution


def _make_place(building: Building, p: Mapping[str, Any], hours: Hours) -> Place:
    if not floor_exists(p["floor"], building.floors_count):
        raise ValueError(
            f"{building.code}/{p['name']}: floor {p['floor']} does not exist "
            f"in a building with {building.floors_count} floor(s)"
        )
    kind = PlaceKind(p["kind"])
    rows, cols = p.get("lab_rows"), p.get("lab_cols")
    capacity = rows * cols if kind == PlaceKind.COMPUTER_LAB else p["capacity"]

    place = Place(
        kind=kind,
        name=p["name"],
        floor=p["floor"],
        capacity=capacity,
        location_note=p.get("location_note"),
        lab_rows=rows,
        lab_cols=cols,
    )
    if kind == PlaceKind.COMPUTER_LAB:
        place.seats = [
            Seat(row=r, col=c, label=seat_label(r, c))
            for r in range(1, rows + 1)
            for c in range(1, cols + 1)
        ]
    place.opening_hours = [
        OpeningHours(weekday=day, opens=opens, closes=closes)
        for day, (opens, closes) in sorted(hours.items())
    ]
    return place


def seed_braude(session: Session) -> Institution:
    return seed_institution(session, BRAUDE)
