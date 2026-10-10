"""Campus structure: institutions, buildings, study places and lab seats.

Every row belongs to one institution (multi-tenancy). Places repeat the
institution_id of their building, and a composite foreign key makes the
database itself refuse a place whose institution differs from its
building's, so one institution can never write into another's campus.
"""

import enum
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    ForeignKeyConstraint,
    Numeric,
    String,
    UniqueConstraint,
    false,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def _enum_column(enum_class: type[enum.Enum], name: str) -> Enum:
    """Store an enum as plain text plus a CHECK constraint.

    A native PostgreSQL ENUM is hard to extend in a migration; a CHECK
    constraint can simply be replaced when a new value is added.
    """
    return Enum(
        enum_class,
        name=name,
        native_enum=False,
        create_constraint=True,
        length=32,
        values_callable=lambda members: [m.value for m in members],
    )


class BuildingStatus(enum.StrEnum):
    ACTIVE = "active"
    NEW = "new"
    UNDER_CONSTRUCTION = "under_construction"


class PlaceKind(enum.StrEnum):
    GROUP_ROOM = "group_room"
    OPEN_AREA = "open_area"
    LIBRARY = "library"
    COMPUTER_LAB = "computer_lab"


class PlaceAtmosphere(enum.StrEnum):
    QUIET = "quiet"  # silence is expected
    CONVERSATION = "conversation"  # talking is fine
    MIXED = "mixed"  # depends on the hour and the crowd


class SuitedFor(enum.StrEnum):
    SOLO = "solo"
    GROUP = "group"
    BOTH = "both"


class Amenity(enum.StrEnum):
    OUTLETS = "outlets"
    WHITEBOARD = "whiteboard"
    PROJECTOR = "projector"
    SCREEN = "screen"
    COMPUTERS = "computers"
    AIR_CONDITIONING = "ac"
    DAYLIGHT = "daylight"
    PRINTER = "printer"


# The one place in the code that says how each kind of place behaves.
BOOKABLE_KINDS = frozenset({PlaceKind.GROUP_ROOM, PlaceKind.COMPUTER_LAB})
COUNTED_KINDS = frozenset({PlaceKind.OPEN_AREA, PlaceKind.LIBRARY})


def is_bookable(kind: PlaceKind) -> bool:
    """A whole room or a single lab seat can be booked in advance."""
    return kind in BOOKABLE_KINDS


def is_counted(kind: PlaceKind) -> bool:
    """No booking: students scan in and the system counts free seats."""
    return kind in COUNTED_KINDS


def floor_exists(floor: int, floors_count: int) -> bool:
    """Floors are numbered from 0 (the entrance floor).

    A CHECK constraint cannot look at another table, so this rule is
    enforced in code when campus data is loaded.
    """
    return 0 <= floor < floors_count


class Institution(Base):
    __tablename__ = "institutions"
    __table_args__ = (
        CheckConstraint("slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'", name="slug_format"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    slug: Mapped[str] = mapped_column(String(64), unique=True)
    timezone: Mapped[str] = mapped_column(String(64), default="Asia/Jerusalem")
    # The demo campus only: the day it was last put back to its seed data
    # (app/campus_admin.py). In the database, so a restart does not reset it.
    demo_reset_on: Mapped[date | None] = mapped_column(Date)
    # Shown in the public list of institutions. A new institution starts
    # hidden; its admin turns this on when the campus is ready.
    is_active: Mapped[bool] = mapped_column(default=False, server_default=false())
    # Quarter hours before this are counted in occupancy_history.
    history_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    buildings: Mapped[list["Building"]] = relationship(
        back_populates="institution", cascade="all, delete-orphan", order_by="Building.id"
    )
    special_periods: Mapped[list["SpecialPeriod"]] = relationship(  # noqa: F821
        back_populates="institution", cascade="all, delete-orphan", order_by="SpecialPeriod.id"
    )
    login_rules: Mapped[list["InstitutionLoginRule"]] = relationship(  # noqa: F821
        cascade="all, delete-orphan", order_by="InstitutionLoginRule.id"
    )


class Building(Base):
    __tablename__ = "buildings"
    __table_args__ = (
        UniqueConstraint("institution_id", "code"),
        # Target of the composite foreign key from places.
        UniqueConstraint("id", "institution_id"),
        CheckConstraint("btrim(code) <> ''", name="code_not_blank"),
        CheckConstraint("floors_count >= 1", name="floors_count_positive"),
        CheckConstraint("latitude BETWEEN -90 AND 90", name="latitude_range"),
        CheckConstraint("longitude BETWEEN -180 AND 180", name="longitude_range"),
        CheckConstraint("(latitude IS NULL) = (longitude IS NULL)", name="coordinates_pair"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    # No separate index: uq(institution_id, code) already starts with it.
    institution_id: Mapped[int] = mapped_column(ForeignKey("institutions.id", ondelete="CASCADE"))
    code: Mapped[str] = mapped_column(String(16))
    name: Mapped[str | None] = mapped_column(String(200))
    floors_count: Mapped[int]
    status: Mapped[BuildingStatus] = mapped_column(
        _enum_column(BuildingStatus, "building_status"), default=BuildingStatus.ACTIVE
    )
    # Empty until the building is placed on the map.
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))

    institution: Mapped[Institution] = relationship(back_populates="buildings")
    places: Mapped[list["Place"]] = relationship(
        back_populates="building",
        cascade="all, delete-orphan",
        order_by="Place.id",
    )


class Place(Base):
    __tablename__ = "places"
    __table_args__ = (
        ForeignKeyConstraint(
            ["building_id", "institution_id"],
            ["buildings.id", "buildings.institution_id"],
            ondelete="CASCADE",
        ),
        UniqueConstraint("building_id", "name"),
        # Target of the composite foreign key from special_period_places.
        UniqueConstraint("id", "institution_id"),
        CheckConstraint("btrim(name) <> ''", name="name_not_blank"),
        CheckConstraint("floor >= 0", name="floor_not_negative"),
        CheckConstraint("code_version >= 1", name="code_version_positive"),
        CheckConstraint("capacity > 0", name="capacity_positive"),
        CheckConstraint(
            # IS NOT NULL is required: "NULL > 0" is NULL, not false, and a
            # CHECK that evaluates to NULL lets the row through.
            "(kind = 'computer_lab' AND lab_rows IS NOT NULL AND lab_cols IS NOT NULL"
            " AND lab_rows > 0 AND lab_cols > 0 AND capacity = lab_rows * lab_cols)"
            " OR (kind <> 'computer_lab' AND lab_rows IS NULL AND lab_cols IS NULL)",
            name="lab_layout",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    institution_id: Mapped[int] = mapped_column(index=True)
    building_id: Mapped[int]  # indexed by uq(building_id, name)
    kind: Mapped[PlaceKind] = mapped_column(_enum_column(PlaceKind, "place_kind"))
    name: Mapped[str] = mapped_column(String(100))
    floor: Mapped[int]
    location_note: Mapped[str | None] = mapped_column(String(300))
    # Seats for open areas and the library, chairs for a group room,
    # stations for a computer lab.
    capacity: Mapped[int]
    lab_rows: Mapped[int | None]
    lab_cols: Mapped[int | None]
    # Part of the signed check-in code. Raising it invalidates printed codes.
    code_version: Mapped[int] = mapped_column(default=1, server_default="1")
    # What the place is like. For Braude these are demo values for now
    # (details_are_demo), and the site labels them as such.
    atmosphere: Mapped[PlaceAtmosphere] = mapped_column(
        _enum_column(PlaceAtmosphere, "place_atmosphere"),
        default=PlaceAtmosphere.MIXED,
        server_default=PlaceAtmosphere.MIXED.value,
    )
    suited_for: Mapped[SuitedFor] = mapped_column(
        _enum_column(SuitedFor, "suited_for"), default=SuitedFor.BOTH, server_default=SuitedFor.BOTH.value
    )
    details_are_demo: Mapped[bool] = mapped_column(default=False, server_default=false())

    # The composite foreign key means setting .building also copies the
    # building's institution_id into this place.
    building: Mapped[Building] = relationship(back_populates="places")
    seats: Mapped[list["Seat"]] = relationship(
        back_populates="place", cascade="all, delete-orphan", order_by="(Seat.row, Seat.col)"
    )
    opening_hours: Mapped[list["OpeningHours"]] = relationship(  # noqa: F821
        back_populates="place", cascade="all, delete-orphan", order_by="OpeningHours.weekday"
    )
    amenities: Mapped[list["PlaceAmenity"]] = relationship(
        cascade="all, delete-orphan", order_by="PlaceAmenity.amenity"
    )


class PlaceAmenity(Base):
    """One piece of equipment or comfort a place has (outlets, a whiteboard...)."""

    __tablename__ = "place_amenities"
    __table_args__ = (UniqueConstraint("place_id", "amenity"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    place_id: Mapped[int] = mapped_column(ForeignKey("places.id", ondelete="CASCADE"))
    amenity: Mapped[Amenity] = mapped_column(_enum_column(Amenity, "amenity"))


class Seat(Base):
    """One station in a computer lab, at a fixed row and column of the seat map."""

    __tablename__ = "seats"
    __table_args__ = (
        UniqueConstraint("place_id", "row", "col"),
        UniqueConstraint("place_id", "label"),
        # Target of the composite foreign key from check_ins.
        UniqueConstraint("id", "place_id"),
        CheckConstraint("row >= 1", name="row_positive"),
        CheckConstraint("col >= 1", name="col_positive"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    # Indexed by uq(place_id, row, col).
    place_id: Mapped[int] = mapped_column(ForeignKey("places.id", ondelete="CASCADE"))
    row: Mapped[int]
    col: Mapped[int]
    label: Mapped[str] = mapped_column(String(16))

    place: Mapped[Place] = relationship(back_populates="seats")
