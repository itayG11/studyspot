"""Request and response shapes of the API (Pydantic models).

Pydantic validates every request body against these classes before the
route runs, and response models make sure only the listed fields leave
the server.
"""

import re
import unicodedata
from datetime import date, datetime, time
from decimal import Decimal
from typing import Literal
from zoneinfo import available_timezones

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator, model_validator

from app.demo import Persona
from app.models import (
    Amenity,
    AuthProvider,
    BookingSource,
    BookingStatus,
    BuildingStatus,
    CheckInEndReason,
    PlaceAtmosphere,
    PlaceKind,
    SuitedFor,
    UserRole,
)


class BookingRules(BaseModel):
    """The booking rules, so the site shows them without keeping a copy."""

    slot_minutes: int  # bookings start and end on this grid
    max_minutes: int  # longest booking
    days_ahead: int  # how many calendar days ahead to offer
    horizon_minutes: int  # exact limit: a booking may start at most this far from now
    max_upcoming: int  # active advance bookings per student
    arrive_early_minutes: int  # arrival can be confirmed this early
    no_show_after_minutes: int  # no confirmation by then: released


class InstitutionListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    slug: str
    name: str


class InstitutionOut(BaseModel):
    slug: str
    name: str
    timezone: str  # all opening hours and bookings are in this zone
    booking_rules: BookingRules
    # The live numbers include made-up students (the demo campus, app/seed/live.py).
    live_simulated: bool = False


class BuildingLocationIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    latitude: Decimal = Field(ge=-90, le=90, max_digits=9, decimal_places=6)
    longitude: Decimal = Field(ge=-180, le=180, max_digits=9, decimal_places=6)


def _plain_text(value: str | None) -> str | None:
    """Names shown to every visitor and printed on signs: no control or
    direction-override characters, which could hide or reorder the text."""
    if value is None:
        return None
    cleaned = "".join(ch for ch in value if unicodedata.category(ch) not in ("Cc", "Cf"))
    return cleaned.strip()


class BuildingCreateIn(BaseModel):
    """A new building, from the admin page."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    # Letters, digits and dashes, like the codes painted on the buildings.
    code: str = Field(min_length=1, max_length=16, pattern=r"^[A-Za-z0-9-]+$")
    name: str | None = Field(default=None, max_length=200)

    @field_validator("name")
    @classmethod
    def _clean_name(cls, value: str | None) -> str | None:
        return _plain_text(value) or None
    floors_count: int = Field(ge=1, le=50)
    status: BuildingStatus = BuildingStatus.ACTIVE
    latitude: Decimal | None = Field(default=None, ge=-90, le=90, max_digits=9, decimal_places=6)
    longitude: Decimal | None = Field(default=None, ge=-180, le=180, max_digits=9, decimal_places=6)

    @model_validator(mode="after")
    def _both_or_neither(self) -> "BuildingCreateIn":
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("a position needs both latitude and longitude")
        self.code = self.code.upper()
        return self


class BuildingCreatedOut(BaseModel):
    id: int
    code: str
    name: str | None
    floors_count: int
    latitude: Decimal | None
    longitude: Decimal | None


class PlaceCreateIn(BaseModel):
    """A new place in a building. A computer lab gives rows and columns of
    stations; every other kind gives its capacity."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    kind: PlaceKind
    name: str = Field(min_length=1, max_length=100)
    floor: int = Field(ge=0, le=49)
    capacity: int | None = Field(default=None, ge=1, le=1000)
    lab_rows: int | None = Field(default=None, ge=1, le=20)
    lab_cols: int | None = Field(default=None, ge=1, le=20)
    location_note: str | None = Field(default=None, max_length=300)

    @field_validator("name", "location_note")
    @classmethod
    def _clean(cls, value: str | None) -> str | None:
        return _plain_text(value)

    @model_validator(mode="after")
    def _size(self) -> "PlaceCreateIn":
        if not self.name:
            raise ValueError("name is empty")
        if self.kind == PlaceKind.COMPUTER_LAB:
            if self.lab_rows is None or self.lab_cols is None:
                raise ValueError("a computer lab needs lab_rows and lab_cols")
        elif self.capacity is None:
            raise ValueError("capacity is required")
        return self


class PlaceCreatedOut(BaseModel):
    id: int
    building_id: int
    name: str
    kind: PlaceKind
    capacity: int


# --- A table of buildings and places (app/campus_import.py) ------------------------------

IMPORT_BUILDINGS = 100
IMPORT_PLACES = 300  # app/campus_import.py MAX_ROWS


class CampusImportBuildingIn(BuildingCreateIn):
    """One building of the table, as the admin confirmed it. A building
    that is already there: "add" puts the new places into it; "replace"
    deletes it first, and only with the number of places the admin was
    shown, so a building that changed since is not deleted unseen."""

    action: Literal["add", "replace"] = "add"
    expected_places: int | None = Field(default=None, ge=0)
    places: list[PlaceCreateIn] = Field(default_factory=list, max_length=IMPORT_PLACES)

    @model_validator(mode="after")
    def _replace_needs_the_count(self) -> "CampusImportBuildingIn":
        if self.action == "replace" and self.expected_places is None:
            raise ValueError("replace needs expected_places")
        return self


class CampusImportIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    buildings: list[CampusImportBuildingIn] = Field(min_length=1, max_length=IMPORT_BUILDINGS)

    @model_validator(mode="after")
    def _once_each(self) -> "CampusImportIn":
        codes = [b.code for b in self.buildings]
        if len(set(codes)) != len(codes):
            raise ValueError("a building appears twice")
        if sum(len(b.places) for b in self.buildings) > IMPORT_PLACES:
            raise ValueError("too many places")
        return self


class ImportedPlaceOut(BaseModel):
    line: int
    kind: PlaceKind
    name: str
    floor: int
    capacity: int | None
    lab_rows: int | None
    lab_cols: int | None
    location_note: str | None
    # Why it would not go into the building that is there now, if it is.
    when_added: Literal["place_name_taken", "floor_not_in_building"] | None


class ExistingBuildingOut(BaseModel):
    name: str | None
    floors_count: int
    places: int
    upcoming_bookings: int
    classes: int


class ImportedBuildingOut(BaseModel):
    code: str
    name: str | None
    floors_count: int
    latitude: Decimal | None
    longitude: Decimal | None
    existing: ExistingBuildingOut | None
    places: list[ImportedPlaceOut]


class ImportProblemOut(BaseModel):
    line: int
    code: str


class CampusPreviewOut(BaseModel):
    buildings: list[ImportedBuildingOut]
    problems: list[ImportProblemOut]


class CampusSavedOut(BaseModel):
    buildings_added: int
    buildings_replaced: int
    places_added: int
    places_skipped: int


class BuildingLocationOut(BaseModel):
    id: int
    code: str
    latitude: Decimal
    longitude: Decimal


class Occupancy(BaseModel):
    capacity: int
    occupied: int
    available: int


class BuildingOut(Occupancy):
    """capacity/occupied/available count only places a student can walk into
    right now: open, and not group rooms (those are booked)."""

    id: int
    code: str
    name: str | None
    status: BuildingStatus
    floors_count: int
    latitude: Decimal | None
    longitude: Decimal | None
    places_count: int


class PlaceOut(Occupancy):
    id: int
    building_code: str
    kind: PlaceKind
    name: str
    floor: int
    location_note: str | None
    is_open: bool
    bookable: bool
    counted: bool
    atmosphere: PlaceAtmosphere
    suited_for: SuitedFor
    amenities: list[Amenity]
    details_are_demo: bool  # the three fields above are sample data, not checked
    # Group rooms only (None elsewhere): is anyone holding the room now, and
    # if so, when it frees up, after any back-to-back bookings.
    free_now: bool | None
    free_from: datetime | None
    # Full now, and not a room (rooms have free_from): the first quarter
    # hour today that is usually not full, local time (app/forecast.py).
    usually_frees_at: time | None = None


class OpeningHoursOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    weekday: int = Field(description="0 = Monday ... 6 = Sunday")
    opens: time
    closes: time


class SeatOut(BaseModel):
    id: int
    row: int
    col: int
    label: str
    occupied: bool
    # Can a student sit here right now, and until when (the next booking or
    # closing time; None means no limit today). Helps pick a seat with time.
    free_now: bool
    free_until: datetime | None


class SlotForecastOut(BaseModel):
    start: time  # local
    people: float


class TodaySlotOut(BaseModel):
    start: time
    people: int


class ForecastOut(BaseModel):
    weekday: int  # Python's numbering: Monday is 0
    capacity: int
    weeks: int
    simulated: bool
    closed: bool
    slots: list[SlotForecastOut]
    frees_at: time | None
    # The weekday asked is today: today's quarter hours so far (app/load_today.py).
    today: list[TodaySlotOut] = []


class CampusSlotOut(BaseModel):
    start: time
    usual: float | None
    today: int | None


class PlaceNextHourOut(BaseModel):
    place_id: int
    next_hour: float | None  # usual share of full in the coming hour


class CampusTodayOut(BaseModel):
    weekday: int
    capacity: int
    occupied: int
    weeks: int
    simulated: bool
    slots: list[CampusSlotOut]
    places: list[PlaceNextHourOut]


class PlaceDetail(PlaceOut):
    institution_slug: str  # old links carry no institution; the site reads it here
    opening_hours: list[OpeningHoursOut]
    open_all_day_today: bool
    lab_rows: int | None
    lab_cols: int | None
    seats: list[SeatOut] | None


class CheckInCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # The exact format is checked by app.codes.read_code; this only keeps
    # oversized input away from the parser.
    code: str = Field(min_length=1, max_length=80)
    seat_id: int | None = Field(default=None, gt=0)


class CheckInOut(BaseModel):
    id: int
    place_id: int
    place_name: str
    building_code: str
    seat_id: int | None
    seat_label: str | None
    started_at: datetime
    expires_at: datetime
    ended_at: datetime | None
    end_reason: CheckInEndReason | None
    booking_id: int | None
    # Set when a walk-in got less than the full time, so the app can warn:
    # "booking" = the seat is booked soon, "closing" = the place closes soon.
    cut_short_by: Literal["booking", "closing"] | None = None


class MeOut(BaseModel):
    id: int
    email: str
    display_name: str
    role: UserRole
    institution_slug: str
    is_demo: bool = False  # a shared demo user: no e-mail of its own, cannot be deleted


class TokenOut(BaseModel):
    access_token: str
    token_type: Literal["bearer"]
    expires_in: int  # seconds
    user: MeOut


class BookingCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    place_id: int = Field(gt=0)
    seat_id: int | None = Field(default=None, gt=0)
    # AwareDatetime rejects times without a timezone: "14:00" alone is ambiguous.
    starts_at: AwareDatetime
    ends_at: AwareDatetime


class BookingOut(BaseModel):
    id: int
    place_id: int
    place_name: str
    building_code: str
    seat_id: int | None
    seat_label: str | None
    starts_at: datetime
    ends_at: datetime
    status: BookingStatus
    source: BookingSource


class BusyRange(BaseModel):
    """Time held on a room (seat_id None) or a lab seat. Never says by whom."""

    seat_id: int | None
    starts_at: datetime
    ends_at: datetime


class Availability(BaseModel):
    place_id: int
    date: date
    busy: list[BusyRange]


class ProvidersOut(BaseModel):
    """Which sign-in buttons the site should show."""

    providers: list[str]
    demo: bool
    email: bool = False  # sign-in with a one-time code by email


class DemoLoginIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    persona: Persona


class EmailStartIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str = Field(max_length=320)


class EmailStartOut(BaseModel):
    expires_in: int  # seconds the code is valid


class EmailVerifyIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str = Field(max_length=320)
    # [0-9], not \d: \d would also take digits of other scripts.
    code: str = Field(pattern=r"^[0-9]{6}$")


# --- The system admin: institutions and their admins' invites ---------------


class InstitutionCreateIn(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=200)
    # The address: /tel-hai. As the table's slug_format check.
    slug: str = Field(min_length=2, max_length=64, pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$")
    timezone: str = Field(default="Asia/Jerusalem", max_length=64)

    @field_validator("name")
    @classmethod
    def _clean_name(cls, value: str) -> str:
        cleaned = _plain_text(value)
        if not cleaned:
            raise ValueError("a name is needed")
        return cleaned

    @field_validator("timezone")
    @classmethod
    def _known_zone(cls, value: str) -> str:
        if value not in available_timezones():
            raise ValueError("unknown time zone")
        return value


class SystemInstitutionOut(BaseModel):
    slug: str
    name: str
    timezone: str
    is_active: bool
    buildings: int
    admins: int


class InviteCreatedOut(BaseModel):
    id: int
    token: str  # shown this once; the server keeps only its HMAC
    expires_at: datetime


class InviteOut(BaseModel):
    id: int
    status: Literal["open", "used", "revoked", "expired"]
    created_at: datetime
    expires_at: datetime
    used_at: datetime | None


class InviteTokenIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    token: str = Field(min_length=1, max_length=100)


class InviteInstitutionOut(BaseModel):
    slug: str
    name: str


# --- An institution's own setup (its admin) ----------------------------------


class InstitutionUpdateIn(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: str | None = Field(default=None, min_length=1, max_length=200)
    timezone: str | None = Field(default=None, max_length=64)
    is_active: bool | None = None

    @field_validator("name")
    @classmethod
    def _clean_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = _plain_text(value)
        if not cleaned:
            raise ValueError("a name is needed")
        return cleaned

    @field_validator("timezone")
    @classmethod
    def _known_zone(cls, value: str | None) -> str | None:
        if value is not None and value not in available_timezones():
            raise ValueError("unknown time zone")
        return value


_DOMAIN = re.compile(r"^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$")
_TENANT = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


class LoginRuleIn(BaseModel):
    """Who signs in to the institution: an e-mail domain of its students (a
    code is sent there), or its Microsoft tenant id."""

    model_config = ConfigDict(extra="forbid")

    provider: Literal["email", "microsoft"]
    value: str = Field(min_length=1, max_length=255)

    @model_validator(mode="after")
    def _well_formed(self) -> "LoginRuleIn":
        self.value = self.value.strip().lower()
        pattern = _DOMAIN if self.provider == "email" else _TENANT
        if not pattern.fullmatch(self.value):
            raise ValueError("an e-mail domain like college.ac.il, or a Microsoft tenant id")
        return self


class LoginRuleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    provider: AuthProvider
    value: str
    approved: bool  # an institution admin's rule waits for the system admin


class SetupOut(BaseModel):
    slug: str
    name: str
    timezone: str
    is_active: bool
    locked: bool  # the shared demo campus: shown, but not changed
    rules: list[LoginRuleOut]
    buildings: int
    located_buildings: int
    places: int
    microsoft_client_id: str | None  # public: it goes in the admin consent link


class GeocodeResultOut(BaseModel):
    name: str
    latitude: float
    longitude: float


class PendingRuleOut(LoginRuleOut):
    institution_slug: str
    institution_name: str


class ClassSlotIn(BaseModel):
    """A class in the student's week, from the "my area" page."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    weekday: int = Field(ge=0, le=6)  # Python's numbering: Monday is 0
    starts: time
    ends: time
    # One of the two: a building of the campus, or a place it does not list.
    building_code: str | None = Field(default=None, min_length=1, max_length=16, pattern=r"^[A-Za-z0-9-]+$")
    place_text: str | None = Field(default=None, max_length=40)
    title: str | None = Field(default=None, max_length=60)

    @field_validator("title")
    @classmethod
    def _clean_title(cls, value: str | None) -> str | None:
        return _plain_text(value) or None

    @field_validator("place_text")
    @classmethod
    def _clean_place(cls, value: str | None) -> str | None:
        # One space between words: "אולם  ספורט" is the same place.
        return " ".join((_plain_text(value) or "").split()) or None

    @model_validator(mode="after")
    def _ends_after_start(self) -> "ClassSlotIn":
        if (self.building_code is None) == (self.place_text is None):
            raise ValueError("a class is in a building or in a place named in words, one of the two")
        for value in (self.starts, self.ends):
            # Local times, in whole minutes, as the form sends them.
            if value.tzinfo is not None or value.second or value.microsecond:
                raise ValueError("a class time is a local hour and minute")
        if self.ends <= self.starts:
            raise ValueError("a class ends after it starts")
        if self.building_code is not None:
            self.building_code = self.building_code.upper()
        return self


class ClassSlotOut(BaseModel):
    id: int
    weekday: int
    starts: time
    ends: time
    building_code: str | None  # None: a place the campus does not list yet
    place_text: str | None
    title: str | None


class MentionedPlaceOut(BaseModel):
    """A place students' classes name that the campus has not added: how
    many students, never who."""

    text: str
    students: int


class SuggestionOut(BaseModel):
    place_id: int
    name: str
    kind: PlaceKind
    building_code: str
    walk_there: int  # minutes, an estimate (app/between_classes.py)
    walk_after: int
    sit_from: datetime
    sit_until: datetime
    sit_minutes: int
    bookable: bool
    capacity: int
    available: int | None  # now, for the gap under way (not for rooms)
    usual: float | None  # usually there then, for a gap later today


class GapOut(BaseModel):
    starts: time  # local
    ends: time
    from_building: str  # a building's code, or a place named in words
    to_building: str
    now: bool  # the gap is under way
    from_listed: bool  # from_building is a building's code
    to_listed: bool
    suggestions: list[SuggestionOut]


class BetweenClassesOut(BaseModel):
    weekday: int  # Python's numbering: Monday is 0
    date: date  # today, or the next date of that weekday
    gaps: list[GapOut]


class ImportRowOut(BaseModel):
    """One class read from a timetable file (app/timetable_import.py)."""

    weekday: int
    starts: str  # "HH:MM"
    ends: str
    building_code: str | None  # None: the student picks one
    building_text: str
    title: str | None


class BulkResultOut(BaseModel):
    refused: str | None  # the reason code, or None when the class was added
