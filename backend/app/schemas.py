"""Request and response shapes of the API (Pydantic models).

Pydantic validates every request body against these classes before the
route runs, and response models make sure only the listed fields leave
the server.
"""

import unicodedata
from datetime import date, datetime, time
from decimal import Decimal
from typing import Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator, model_validator

from app.demo import Persona
from app.models import (
    Amenity,
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
