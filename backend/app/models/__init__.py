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
    WalkTime,
    floor_exists,
    is_bookable,
    is_counted,
)
from app.models.checkins import CheckIn, CheckInEndReason
from app.models.classes import ClassSlot
from app.models.history import OccupancyHistory
from app.models.hours import OpeningHours, SpecialPeriod, SpecialPeriodPlace
from app.models.people import (
    AdminInvite,
    AuthProvider,
    AuthSession,
    EmailSignInCode,
    InstitutionLoginRule,
    User,
    UserIdentity,
    UserRole,
)
from app.models.push import PushSubscription

__all__ = [
    "ACTIVE_STATUSES",
    "AdminInvite",
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
    "ClassSlot",
    "EmailSignInCode",
    "Institution",
    "InstitutionLoginRule",
    "OccupancyHistory",
    "OpeningHours",
    "Place",
    "PlaceAmenity",
    "PlaceAtmosphere",
    "PlaceKind",
    "PushSubscription",
    "Seat",
    "SpecialPeriod",
    "SpecialPeriodPlace",
    "SuitedFor",
    "User",
    "UserIdentity",
    "UserRole",
    "WalkTime",
    "floor_exists",
    "is_bookable",
    "is_counted",
]
