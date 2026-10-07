"""All database models. Importing this package registers every table on Base.metadata."""

from app.models.bookings import ACTIVE_STATUSES, Booking, BookingSource, BookingStatus
from app.models.campus import (
    Building,
    BuildingStatus,
    Institution,
    Place,
    PlaceKind,
    Seat,
    floor_exists,
    is_bookable,
    is_counted,
)
from app.models.checkins import CheckIn, CheckInEndReason
from app.models.hours import OpeningHours, SpecialPeriod, SpecialPeriodPlace
from app.models.people import User

__all__ = [
    "ACTIVE_STATUSES",
    "Booking",
    "BookingSource",
    "BookingStatus",
    "Building",
    "BuildingStatus",
    "CheckIn",
    "CheckInEndReason",
    "Institution",
    "OpeningHours",
    "Place",
    "PlaceKind",
    "Seat",
    "SpecialPeriod",
    "SpecialPeriodPlace",
    "User",
    "floor_exists",
    "is_bookable",
    "is_counted",
]
