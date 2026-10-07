"""Request and response shapes of the API (Pydantic models).

Pydantic validates every request body against these classes before the
route runs, and response models make sure only the listed fields leave
the server.
"""

from datetime import date, datetime, time
from decimal import Decimal
from typing import Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field

from app.models import BookingSource, BookingStatus, BuildingStatus, CheckInEndReason, PlaceKind


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
