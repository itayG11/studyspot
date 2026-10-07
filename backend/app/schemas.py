"""Request and response shapes of the API (Pydantic models).

Pydantic validates every request body against these classes before the
route runs, and response models make sure only the listed fields leave
the server.
"""

from datetime import datetime, time
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models import BuildingStatus, CheckInEndReason, PlaceKind


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
