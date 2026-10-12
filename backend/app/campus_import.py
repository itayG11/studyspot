"""An institution's buildings and places from a table (Excel or CSV), for
its admin: a preview first, nothing saved, then the whole table in one
transaction.

The table has a row per place; the building's columns repeat on each row,
and a row with no place adds the building only. Columns are found by their
header, in Hebrew or English, in any order.

The file comes from a stranger's computer: the same checks as the timetable
import (app/timetable_import.py) before an .xlsx is opened, a cap on rows,
and text that starts like a spreadsheet formula ("=HYPERLINK(...)") is
refused, so that a table exported later cannot run it on someone's
computer."""

import csv
import io
import re
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal, InvalidOperation

from pydantic import ValidationError
from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app.campus_admin import create_building, create_place, is_demo_seed_building
from app.errors import Refusal
from app.models import ACTIVE_STATUSES, Booking, Building, ClassSlot, Institution, floor_exists
from app.schemas import BuildingCreateIn, PlaceCreateIn
from app.timetable_import import ImportRefused, _open

MAX_BYTES = 200 * 1024
MAX_ROWS = 300
READ_COLUMNS = 20

# Header -> field. Compared lower-cased, with spaces and underscores as one.
COLUMNS = {
    "code": ("שם קצר", "short name", "code", "building code"),
    "name": ("שם הבניין", "שם בניין", "building name", "building"),
    "floors_count": ("מספר קומות", "קומות", "floors", "floors count", "number of floors"),
    "kind": ("סוג המקום", "סוג מקום", "סוג", "kind", "type", "place type"),
    "place": ("שם המקום", "שם מקום", "place name", "place"),
    "floor": ("קומה", "floor"),
    "capacity": ("כמה אנשים", "קיבולת", "capacity", "seats"),
    "lab_rows": ("שורות", "שורות של עמדות", "rows", "lab rows"),
    "lab_cols": ("עמדות בשורה", "stations per row", "columns", "cols", "lab cols"),
    "latitude": ("קו רוחב", "latitude", "lat"),
    "longitude": ("קו אורך", "longitude", "lng", "lon"),
    "location_note": ("הערת מיקום", "איך מגיעים", "location note", "note"),
}
KINDS = {
    "group_room": ("חדר לימוד קבוצתי", "חדר קבוצתי", "group room"),
    "open_area": ("מתחם לימוד פתוח", "מתחם פתוח", "open area"),
    "library": ("ספרייה", "ספריה", "library"),
    "computer_lab": ("חוות מחשבים", "חוות מחשב", "computer lab", "lab"),
}
BUILDING_FIELDS = ("name", "floors_count", "latitude", "longitude")
PLACE_FIELDS = ("kind", "place", "floor", "capacity", "lab_rows", "lab_cols", "location_note")
TEXT_FIELDS = ("name", "kind", "place", "location_note")
# The first characters a spreadsheet reads as a formula.
FORMULA = ("=", "+", "-", "@", "\t", "\r")


def _key(text: str) -> str:
    return re.sub(r"[\s_]+", " ", text).strip().lower()


_HEADERS = {_key(alias): name for name, aliases in COLUMNS.items() for alias in aliases}
_KINDS = {_key(alias): kind for kind, aliases in KINDS.items() for alias in (*aliases, kind)}


@dataclass
class TableBuilding:
    code: str
    name: str | None
    floors_count: int
    latitude: Decimal | None
    longitude: Decimal | None
    places: list[tuple[int, PlaceCreateIn]] = field(default_factory=list)  # (line, place)


@dataclass
class Table:
    buildings: list[TableBuilding]
    problems: list[tuple[int, str]]  # (line, code)


# --- Reading the file ------------------------------------------------------------------


def read_table(data: bytes) -> Table:
    lines = _rows(data)
    header_at, columns = _header(lines)
    buildings: dict[str, TableBuilding] = {}
    problems: list[tuple[int, str]] = []
    seen: set[tuple[str, str]] = set()
    rows = 0
    for index, values in enumerate(lines[header_at + 1:], start=header_at + 2):
        cells = {name: _cell(values, column) for name, column in columns.items()}
        if all(value is None for value in cells.values()):
            continue
        rows += 1
        if rows > MAX_ROWS:
            raise ImportRefused("import_too_many_rows")
        problem = _read_row(cells, index, buildings, seen)
        if problem is not None:
            problems.append((index, problem))
    if rows == 0:
        raise ImportRefused("import_empty")
    return Table(list(buildings.values()), problems)


def _rows(data: bytes) -> list[tuple]:
    if len(data) > MAX_BYTES:
        raise ImportRefused("import_too_big")
    if data.startswith(b"PK\x03\x04"):
        sheet = _open(data)
        return list(sheet.iter_rows(max_row=MAX_ROWS + 20, max_col=READ_COLUMNS, values_only=True))
    if b"\x00" in data:
        raise ImportRefused("import_not_table")
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        # Plain "CSV" from Excel on a Hebrew Windows.
        text = data.decode("cp1255", errors="replace")
    first = text.split("\n", 1)[0]
    delimiter = max(",;\t", key=first.count)
    return [tuple(row[:READ_COLUMNS]) for row in csv.reader(io.StringIO(text), delimiter=delimiter)][: MAX_ROWS + 20]


def _header(lines: list[tuple]) -> tuple[int, dict[str, int]]:
    """The first row that names the short-name column: field -> column."""
    for index, values in enumerate(lines[:10]):
        columns: dict[str, int] = {}
        for column, value in enumerate(values):
            name = _HEADERS.get(_key(str(value))) if value is not None else None
            if name is not None and name not in columns:
                columns[name] = column
        if "code" in columns:
            if "floors_count" not in columns or ("place" in columns) != ("kind" in columns):
                raise ImportRefused("import_missing_column")
            return index, columns
    raise ImportRefused("import_missing_column")


def _cell(values: tuple, column: int):
    value = values[column] if column < len(values) else None
    if isinstance(value, str):
        value = value.strip() or None
    return value


def _read_row(cells: dict, line: int, buildings: dict[str, TableBuilding], seen: set) -> str | None:
    """Adds the row to its building, or says what is wrong with it."""
    for name in TEXT_FIELDS:
        value = cells.get(name)
        if isinstance(value, str) and value.startswith(FORMULA):
            return "row_formula"
    code = cells.get("code")
    if code is None:
        return "row_building_code"
    code = str(code).upper()
    known = buildings.get(code)
    try:
        floors = _number(cells.get("floors_count")) if cells.get("floors_count") is not None else None
    except ValueError:
        return "row_floors"
    if floors is None and known is None:
        return "row_floors"
    try:
        building = BuildingCreateIn(
            code=code,
            name=cells.get("name") if cells.get("name") is not None else (known.name if known else None),
            floors_count=floors if floors is not None else known.floors_count,
            latitude=_decimal(cells.get("latitude")) if cells.get("latitude") is not None else (known.latitude if known else None),
            longitude=_decimal(cells.get("longitude")) if cells.get("longitude") is not None else (known.longitude if known else None),
        )
    except (ValidationError, ValueError) as error:
        return _building_problem(error)
    if known is not None and (known.name, known.floors_count, known.latitude, known.longitude) != (
        building.name, building.floors_count, building.latitude, building.longitude
    ):
        return "row_building_differs"
    place = None
    if any(cells.get(name) is not None for name in PLACE_FIELDS):
        place_or_problem = _place(cells)
        if isinstance(place_or_problem, str):
            return place_or_problem
        place = place_or_problem
        if not floor_exists(place.floor, building.floors_count):
            return "floor_not_in_building"
        if (building.code, place.name) in seen:
            return "row_duplicate"
        seen.add((building.code, place.name))
    if known is None:
        known = buildings[building.code] = TableBuilding(
            building.code, building.name, building.floors_count, building.latitude, building.longitude
        )
    if place is not None:
        known.places.append((line, place))
    return None


def _place(cells: dict) -> PlaceCreateIn | str:
    kind = _KINDS.get(_key(str(cells.get("kind") or "")))
    if kind is None:
        return "row_kind"
    if cells.get("place") is None:
        return "row_place_name"
    numbers = {}
    for name, problem in (("floor", "row_floor"), ("capacity", "row_capacity"),
                          ("lab_rows", "row_lab_size"), ("lab_cols", "row_lab_size")):
        try:
            numbers[name] = _number(cells.get(name)) if cells.get(name) is not None else None
        except ValueError:
            return problem
    if numbers["floor"] is None:
        return "row_floor"
    if kind == "computer_lab":
        if numbers["lab_rows"] is None or numbers["lab_cols"] is None:
            return "row_lab_size"
        numbers["capacity"] = None
    else:
        if numbers["capacity"] is None:
            return "row_capacity"
        numbers["lab_rows"] = numbers["lab_cols"] = None
    try:
        return PlaceCreateIn(kind=kind, name=str(cells["place"]), location_note=_text(cells.get("location_note")), **numbers)
    except ValidationError as error:
        fields = {str(e["loc"][0]) for e in error.errors() if e["loc"]}
        if "floor" in fields:
            return "row_floor"
        if "capacity" in fields:
            return "row_capacity"
        if fields & {"lab_rows", "lab_cols"}:
            return "row_lab_size"
        return "row_place_name"


def _building_problem(error: Exception) -> str:
    if isinstance(error, ValidationError):
        fields = {str(e["loc"][0]) for e in error.errors() if e["loc"]}
        if "code" in fields:
            return "row_building_code"
        if "floors_count" in fields:
            return "row_floors"
        if "name" in fields:
            return "row_building_name"
    return "row_position"


def _number(value) -> int:
    """A whole number, as a cell holds it: 2, 2.0 or "2"."""
    if isinstance(value, int) and not isinstance(value, bool):  # TRUE in a cell is not 1
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, str) and re.fullmatch(r"-?\d+(\.0+)?", value):
        return int(float(value))
    raise ValueError(value)


def _decimal(value) -> Decimal:
    try:
        return Decimal(str(value)).quantize(Decimal("0.000001"))
    except InvalidOperation:
        raise ValueError(value) from None


def _text(value) -> str | None:
    return None if value is None else str(value)


# --- The preview -----------------------------------------------------------------------


@dataclass
class Existing:
    name: str | None
    floors_count: int
    places: int
    upcoming_bookings: int
    classes: int


def existing(db: Session, institution: Institution, codes: list[str], now: datetime) -> dict[str, tuple[Building, Existing]]:
    """The institution's buildings of these codes, with what deleting one
    would take with it."""
    out = {}
    for building in db.scalars(
        select(Building).where(Building.institution_id == institution.id, Building.code.in_(codes))
    ):
        place_ids = [p.id for p in building.places]
        bookings = db.scalar(
            select(func.count()).select_from(Booking).where(
                Booking.place_id.in_(place_ids), Booking.ends_at > now, Booking.status.in_(ACTIVE_STATUSES)
            )
        ) if place_ids else 0
        classes = db.scalar(select(func.count()).select_from(ClassSlot).where(ClassSlot.building_id == building.id))
        out[building.code] = (building, Existing(building.name, building.floors_count, len(place_ids), bookings, classes))
    return out


def when_added(building: Building, place: PlaceCreateIn) -> str | None:
    """Why the place would not go into the building that is there now."""
    if any(p.name == place.name for p in building.places):
        return "place_name_taken"
    if not floor_exists(place.floor, building.floors_count):
        return "floor_not_in_building"
    return None


# --- Saving ------------------------------------------------------------------------------


@dataclass
class Saved:
    buildings_added: int = 0
    buildings_replaced: int = 0
    places_added: int = 0
    places_skipped: int = 0


def save(db: Session, institution: Institution, items: list, *, demo_slug: str | None) -> Saved:
    """items: CampusImportBuildingIn. All of them, or a Refusal and the
    caller rolls everything back."""
    saved = Saved()
    for item in items:
        building = db.scalars(
            select(Building).where(Building.institution_id == institution.id, Building.code == item.code)
        ).first()
        if building is not None and item.action == "replace":
            if is_demo_seed_building(institution, building.code, demo_slug):
                raise Refusal(403, "demo_campus_locked")
            if len(building.places) != item.expected_places:
                raise Refusal(409, "import_stale")
            delete_building(db, building)
            saved.buildings_replaced += 1
            building = None
        elif building is None:
            saved.buildings_added += 1
        # Adding to a building that is there: the places it has stay as
        # they are, and the file's places of the same name are skipped.
        had = {p.name for p in building.places} if building is not None else set()
        if building is None:
            building = create_building(
                db, institution, code=item.code, name=item.name or None, floors_count=item.floors_count,
                status=item.status,
                position=(item.latitude, item.longitude) if item.latitude is not None else None,
                demo_slug=demo_slug,
            )
        for place in item.places:
            if place.name in had:
                saved.places_skipped += 1
                continue
            create_place(db, building, place.model_dump(), demo_slug=demo_slug)
            saved.places_added += 1
    return saved


def delete_building(db: Session, building: Building) -> None:
    """The building and all in it: places, stations, hours, bookings and
    check-ins go with it (ON DELETE CASCADE). The students' classes there
    stay, back to the building's short name in words: a building added
    again under that name takes them back (campus_admin._take_mentioned_classes)."""
    db.execute(
        update(ClassSlot)
        .where(ClassSlot.building_id == building.id)
        .values(building_id=None, place_text=func.coalesce(ClassSlot.place_text, building.code))
        .execution_options(synchronize_session=False)
    )
    db.execute(delete(Building).where(Building.id == building.id))
    db.flush()
    db.expire_all()
