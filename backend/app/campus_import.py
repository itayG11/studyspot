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
from sqlalchemy.orm import Session, selectinload

from app.campus_admin import create_building, create_place, is_demo_seed_building
from app.errors import Refusal
from app.models import ACTIVE_STATUSES, Booking, Building, BuildingStatus, ClassSlot, Institution, Place, floor_exists
from app.schemas import CLOSED, BuildingCreateIn, ImportPlaceIn, PlaceCreateIn, looks_like_formula, opening_hours
from app.seed.braude import FRIDAY, SUNDAY_TO_THURSDAY, WEEK_AND_FRIDAY
from app.timetable_import import ImportRefused, _open

MAX_BYTES = 200 * 1024
MAX_ROWS = 300
MAX_BUILDINGS = 100  # app/schemas.py IMPORT_BUILDINGS: what one save takes
# Lines read at most, blank ones too: past them the file is refused, not cut.
MAX_LINES = 2000
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
    "location_note": ("הערת מיקום", "איך מגיעים", "location note"),
    "status": ("מצב הבניין", "מצב", "status", "building status"),
    "weekday_hours": ("ימים א'-ה'", "שעות פתיחה א'-ה'", "שעות א'-ה'", "sunday-thursday", "weekday hours"),
    "friday_hours": ("יום ו'", "שעות פתיחה ו'", "שעות ו'", "friday", "friday hours"),
}
KINDS = {
    "group_room": ("חדר לימוד קבוצתי", "חדר קבוצתי", "group room"),
    "open_area": ("מתחם לימוד פתוח", "מתחם פתוח", "open area"),
    "library": ("ספרייה", "ספריה", "library"),
    "computer_lab": ("חוות מחשבים", "חוות מחשב", "computer lab", "lab"),
}
# A building's row with no study place in it, as the template's list says.
NO_PLACES = ("אין מקומות לימוד", "אין מקומות", "אין", "none", "no places")
STATUSES = {
    BuildingStatus.ACTIVE: ("פעיל", "active"),
    BuildingStatus.NEW: ("חדש", "new"),
    BuildingStatus.UNDER_CONSTRUCTION: ("בבנייה", "בבניה", "under construction"),
}
CLOSED_WORDS = ("סגור", "closed")
# The Excel template (scripts/make_campus_template.py): a row of groups, the
# headers, then the rows to fill in.
TEMPLATE_FIRST_ROW = 3
PLACE_FIELDS = (
    "kind", "place", "floor", "capacity", "lab_rows", "lab_cols", "location_note", "weekday_hours", "friday_hours",
)
TEXT_FIELDS = ("name", "kind", "place", "location_note")


def _key(text: str) -> str:
    return re.sub(r"[\s_]+", " ", text).strip().lower()


_HEADERS = {_key(alias): name for name, aliases in COLUMNS.items() for alias in aliases}
_KINDS = {_key(alias): kind for kind, aliases in KINDS.items() for alias in (*aliases, kind)}
_NO_PLACES = {_key(alias) for alias in NO_PLACES}
_STATUSES = {_key(alias): status for status, aliases in STATUSES.items() for alias in (*aliases, status.value)}
_TIMES = re.compile(r"(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})")


@dataclass
class TableBuilding:
    code: str
    name: str | None
    floors_count: int
    status: BuildingStatus
    latitude: Decimal | None
    longitude: Decimal | None
    places: list[tuple[int, ImportPlaceIn]] = field(default_factory=list)  # (line, place)
    read: bool = False  # a row of it was read whole: only then is it in the table


@dataclass
class Table:
    buildings: list[TableBuilding]
    problems: list[tuple[int, str]]  # (line, code)


# --- Reading the file ------------------------------------------------------------------


def read_table(data: bytes) -> Table:
    lines, (header_at, columns) = _rows(data)
    buildings: dict[str, TableBuilding] = {}
    problems: list[tuple[int, str]] = []
    seen: set[tuple[str, str]] = set()
    rows = 0
    above = None  # the short name of the row above, for rows that leave it empty
    for index, values in enumerate(lines[header_at + 1:], start=header_at + 2):
        cells = {name: _cell(values, column) for name, column in columns.items()}
        if all(value is None for value in cells.values()):
            continue
        if cells.get("code") is None:
            cells["code"] = above  # "the same building as above"
        else:
            above = cells["code"]
        rows += 1
        if rows > MAX_ROWS:
            raise ImportRefused("import_too_many_rows")
        problem = _read_row(cells, index, buildings, seen)
        if problem is not None:
            problems.append((index, problem))
    if rows == 0:
        raise ImportRefused("import_empty")
    if sum(b.read for b in buildings.values()) > MAX_BUILDINGS:
        raise ImportRefused("import_too_many_buildings")
    return Table([b for b in buildings.values() if b.read], problems)


def _rows(data: bytes) -> tuple[list[tuple], tuple[int, dict[str, int]]]:
    """The file's lines, and where its header is."""
    if len(data) > MAX_BYTES:
        raise ImportRefused("import_too_big")
    if data.startswith(b"PK\x03\x04"):
        sheet = _open(data)
        lines = list(sheet.iter_rows(max_row=MAX_LINES + 1, max_col=READ_COLUMNS, values_only=True))
        header = _header(lines)
        if header is None:
            raise ImportRefused("import_missing_column")
        return _bounded(lines), header
    if b"\x00" in data:
        raise ImportRefused("import_not_table")
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        # Plain "CSV" from Excel on a Hebrew Windows.
        text = data.decode("cp1255", errors="replace")
    # Commas, or semicolons and tabs as Excel saves in some languages: the
    # one that splits out a header, which may sit under a title row.
    for delimiter in ",;\t":
        lines = [tuple(row[:READ_COLUMNS]) for row in csv.reader(io.StringIO(text), delimiter=delimiter)]
        header = _header(lines)
        if header is not None:
            return _bounded(lines), header
    raise ImportRefused("import_missing_column")


def _bounded(lines: list[tuple]) -> list[tuple]:
    if len(lines) > MAX_LINES:
        raise ImportRefused("import_too_many_rows")
    return lines


def _header(lines: list[tuple]) -> tuple[int, dict[str, int]] | None:
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
    return None


def _cell(values: tuple, column: int):
    value = values[column] if column < len(values) else None
    if isinstance(value, str):
        value = value.strip() or None
    return value


def _read_row(cells: dict, line: int, buildings: dict[str, TableBuilding], seen: set) -> str | None:
    """Adds the row to its building, or says what is wrong with it."""
    for name in TEXT_FIELDS:
        if looks_like_formula(_text(cells.get(name))):
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

    def given(name: str, convert, before):
        """The row's value, or the one an earlier row of the building gave."""
        return convert(cells[name]) if cells.get(name) is not None else before

    try:
        building = BuildingCreateIn(
            code=code,
            name=given("name", _text, known.name if known else None),
            floors_count=floors if floors is not None else known.floors_count,
            status=given("status", _status, known.status if known else BuildingStatus.ACTIVE),
            latitude=given("latitude", _decimal, known.latitude if known else None),
            longitude=given("longitude", _decimal, known.longitude if known else None),
        )
    except LookupError:
        return "row_status"
    except (ValidationError, ValueError) as error:
        return _building_problem(error)
    if known is None:
        # Kept even if this row's place is wrong: the building's next rows
        # are read against it, not blamed for its missing floors.
        known = buildings[building.code] = TableBuilding(
            building.code, building.name, building.floors_count, building.status, building.latitude, building.longitude
        )
    elif (known.name, known.floors_count, known.status, known.latitude, known.longitude) != (
        building.name, building.floors_count, building.status, building.latitude, building.longitude
    ):
        return "row_building_differs"
    no_places = cells.get("kind") is not None and _key(str(cells["kind"])) in _NO_PLACES
    if not no_places and any(cells.get(name) is not None for name in PLACE_FIELDS):
        place = _place(cells)
        if isinstance(place, str):
            return place
        if not floor_exists(place.floor, building.floors_count):
            return "floor_not_in_building"
        if (building.code, place.name) in seen:
            return "row_duplicate"
        seen.add((building.code, place.name))
        known.places.append((line, place))
    known.read = True
    return None


def _place(cells: dict) -> ImportPlaceIn | str:
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
        hours = {name: _hours(cells.get(name)) for name in ("weekday_hours", "friday_hours")}
    except ValueError:
        return "row_hours"
    try:
        return ImportPlaceIn(
            kind=kind, name=str(cells["place"]), location_note=_text(cells.get("location_note")), **numbers, **hours
        )
    except ValidationError as error:
        fields = {str(e["loc"][0]) for e in error.errors() if e["loc"]}
        if "floor" in fields:
            return "row_floor"
        if "capacity" in fields:
            return "row_capacity"
        if fields & {"lab_rows", "lab_cols"}:
            return "row_lab_size"
        if fields & {"weekday_hours", "friday_hours"}:
            return "row_hours"
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


def _status(value) -> BuildingStatus:
    status = _STATUSES.get(_key(str(value)))
    if status is None:
        raise LookupError(value)
    return status


def _hours(value) -> str | None:
    """A cell of opening hours, as the schema keeps it: "07:00-20:00",
    "closed", or None for the campus's usual hours."""
    if value is None:
        return None
    text = str(value).strip()
    if _key(text) in CLOSED_WORDS:
        return CLOSED
    match = _TIMES.fullmatch(text)
    if match is None:
        raise ValueError(value)
    h1, m1, h2, m2 = match.groups()
    normal = f"{int(h1):02}:{m1}-{int(h2):02}:{m2}"
    opening_hours(normal)  # a real time, closing after opening
    return normal


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
    locked: bool  # a seed building of the shared demo campus: never deleted


def _upcoming(db: Session, building_ids: list[int], now: datetime) -> dict[int, int]:
    rows = db.execute(
        select(Place.building_id, func.count(Booking.id))
        .join(Booking, Booking.place_id == Place.id)
        .where(Place.building_id.in_(building_ids), Booking.ends_at > now, Booking.status.in_(ACTIVE_STATUSES))
        .group_by(Place.building_id)
    )
    return dict(rows.all())


def existing(
    db: Session, institution: Institution, codes: list[str], now: datetime, *, demo_slug: str | None
) -> dict[str, tuple[Building, Existing]]:
    """The institution's buildings of these codes, with what deleting one
    would take with it. A few queries, however many buildings."""
    buildings = db.scalars(
        select(Building)
        .where(Building.institution_id == institution.id, Building.code.in_(codes))
        .options(selectinload(Building.places))
    ).all()
    ids = [b.id for b in buildings]
    bookings = _upcoming(db, ids, now) if ids else {}
    classes = dict(db.execute(
        select(ClassSlot.building_id, func.count()).where(ClassSlot.building_id.in_(ids)).group_by(ClassSlot.building_id)
    ).all()) if ids else {}
    return {
        b.code: (b, Existing(
            b.name, b.floors_count, len(b.places), bookings.get(b.id, 0), classes.get(b.id, 0),
            is_demo_seed_building(institution, b.code, demo_slug),
        ))
        for b in buildings
    }


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


def save(db: Session, institution: Institution, items: list, now: datetime, *, demo_slug: str | None) -> Saved:
    """items: CampusImportBuildingIn. All of them, or a Refusal and the
    caller rolls everything back."""
    saved = Saved()
    for item in items:
        # Locked: a place or a booking added in it from now waits for this
        # transaction, so what is deleted is what was counted.
        building = db.scalars(
            select(Building)
            .where(Building.institution_id == institution.id, Building.code == item.code)
            .with_for_update()
        ).first()
        if building is not None and item.action == "create":
            raise Refusal(409, "import_stale")  # added elsewhere since the preview
        moved: list[int] = []
        if building is not None and item.action == "replace":
            if is_demo_seed_building(institution, building.code, demo_slug):
                raise Refusal(403, "demo_campus_locked")
            db.refresh(building)
            bookings = _upcoming(db, [building.id], now).get(building.id, 0)
            if len(building.places) != item.expected_places or bookings > item.expected_upcoming_bookings:
                raise Refusal(409, "import_stale")
            moved = list(db.scalars(select(ClassSlot.id).where(ClassSlot.building_id == building.id)))
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
        if moved:
            # The classes that were in it: in the new one, whatever their words.
            db.execute(
                update(ClassSlot).where(ClassSlot.id.in_(moved)).values(building_id=building.id)
                .execution_options(synchronize_session=False)
            )
        for place in item.places:
            if place.name in had:
                saved.places_skipped += 1
                continue
            create_place(db, building, place.model_dump(), demo_slug=demo_slug, hours=_week(place))
            saved.places_added += 1
    return saved


def _week(place: ImportPlaceIn) -> dict:
    """The place's days: the campus's usual ones, with the table's hours for
    Sunday to Thursday and for Friday where it gives them."""
    week = dict(WEEK_AND_FRIDAY)
    for days, text in ((SUNDAY_TO_THURSDAY, place.weekday_hours), ((FRIDAY,), place.friday_hours)):
        if text is None:
            continue
        for day in days:
            if text == CLOSED:
                week.pop(day, None)
            else:
                week[day] = opening_hours(text)
    return week


def delete_building(db: Session, building: Building) -> None:
    """The building and all in it: places, stations, hours, bookings and
    check-ins go with it (ON DELETE CASCADE). The students' classes there
    stay, back to the building's short name in words: a building added
    later under that name takes them back (campus_admin._take_mentioned_classes),
    and save() puts them straight into the one that replaces it."""
    db.execute(
        update(ClassSlot)
        .where(ClassSlot.building_id == building.id)
        .values(building_id=None, place_text=func.coalesce(ClassSlot.place_text, building.code))
        .execution_options(synchronize_session=False)
    )
    db.execute(delete(Building).where(Building.id == building.id))
    db.flush()
    db.expire_all()
