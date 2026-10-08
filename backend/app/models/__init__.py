"""All database models. Importing this package registers every table on Base.metadata."""

from app.models.bookings import ACTIVE_STATUSES, Booking, BookingSource, BookingStatus
from app.models.campus import (
    Amenity,
    Building,
    BuildingStatus,
    Institution,
    Place,
    PlaceAmenity,
    PlaceAtmosphere,
    PlaceKind,
    Seat,
    SuitedFor,
    floor_exists,
    is_bookable,
    is_counted,
)
from app.models.checkins import CheckIn, CheckInEndReason
from app.models.hours import OpeningHours, SpecialPeriod, SpecialPeriodPlace
from app.models.people import (
    AuthProvider,
    AuthSession,
    EmailSignInCode,
    InstitutionLoginRule,
    User,
    UserIdentity,
    UserRole,
)

__all__ = [
    "ACTIVE_STATUSES",
    "Amenity",
    "AuthProvider",
    "AuthSession",
    "Booking",
    "BookingSource",
    "BookingStatus",
    "Building",
    "BuildingStatus",
    "CheckIn",
    "CheckInEndReason",
    "EmailSignInCode",
    "Institution",
    "InstitutionLoginRule",
    "OpeningHours",
    "Place",
    "PlaceAmenity",
    "PlaceAtmosphere",
    "PlaceKind",
    "Seat",
    "SpecialPeriod",
    "SpecialPeriodPlace",
    "SuitedFor",
    "User",
    "UserIdentity",
    "UserRole",
    "floor_exists",
    "is_bookable",
    "is_counted",
]
