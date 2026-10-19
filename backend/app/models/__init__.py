"""All database models. Importing this package registers every table on Base.metadata."""

from app.models.api_keys import ApiKey
from app.models.bookings import ACTIVE_STATUSES, Booking, BookingSource, BookingStatus
from app.models.calendar import CalendarFeed
from app.models.campus import (
    Amenity,
    Building,
    BuildingStatus,
    CheckInMode,
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
from app.models.push import ClosingNotice, NoticeEmail, PushSubscription
from app.models.screens import PlaceScreen
from app.models.waitlist import WaitlistEntry

__all__ = [
    "ACTIVE_STATUSES",
    "AdminInvite",
    "Amenity",
    "ApiKey",
    "AuthProvider",
    "AuthSession",
    "Booking",
    "BookingSource",
    "BookingStatus",
    "Building",
    "BuildingStatus",
    "CalendarFeed",
    "CheckIn",
    "CheckInEndReason",
    "CheckInMode",
    "ClassSlot",
    "ClosingNotice",
    "EmailSignInCode",
    "Institution",
    "InstitutionLoginRule",
    "NoticeEmail",
    "OccupancyHistory",
    "OpeningHours",
    "Place",
    "PlaceAmenity",
    "PlaceAtmosphere",
    "PlaceKind",
    "PlaceScreen",
    "PushSubscription",
    "Seat",
    "SpecialPeriod",
    "SpecialPeriodPlace",
    "SuitedFor",
    "User",
    "UserIdentity",
    "UserRole",
    "WaitlistEntry",
    "WalkTime",
    "floor_exists",
    "is_bookable",
    "is_counted",
]
