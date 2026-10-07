"""All database models. Importing this package registers every table on Base.metadata."""

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
from app.models.hours import OpeningHours, SpecialPeriod, SpecialPeriodPlace

__all__ = [
    "Building",
    "BuildingStatus",
    "Institution",
    "OpeningHours",
    "Place",
    "PlaceKind",
    "Seat",
    "SpecialPeriod",
    "SpecialPeriodPlace",
    "floor_exists",
    "is_bookable",
    "is_counted",
]
