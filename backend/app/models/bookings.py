"""Bookings: a group room or a lab seat reserved for a time range.

Double-booking is prevented by the database itself, with two EXCLUDE
constraints: no two active bookings of the same room (or the same seat)
may have overlapping time ranges. This holds even when many requests
arrive in the same instant, without any locking in the application.
"""

import enum
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKeyConstraint, Index, text
from sqlalchemy.dialects.postgresql import ExcludeConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.campus import Place, Seat, _enum_column


class BookingStatus(enum.StrEnum):
    BOOKED = "booked"  # waiting for the student to arrive
    CHECKED_IN = "checked_in"  # the student scanned the code
    COMPLETED = "completed"  # time is over, or the student checked out
    CANCELLED = "cancelled"  # the student cancelled before arriving
    NO_SHOW = "no_show"  # not confirmed within 15 minutes of the start


class BookingSource(enum.StrEnum):
    ADVANCE = "advance"  # booked ahead of time
    WALK_IN = "walk_in"  # created when a student sat at a free lab seat


ACTIVE_STATUSES = (BookingStatus.BOOKED, BookingStatus.CHECKED_IN)

# Half-open range [start, end): a booking ending at 16:00 and one starting
# at 16:00 do not overlap.
_PERIOD = "tstzrange(starts_at, ends_at, '[)')"
_ACTIVE = "status IN ('booked', 'checked_in')"


class Booking(Base):
    __tablename__ = "bookings"
    __table_args__ = (
        ForeignKeyConstraint(
            ["user_id", "institution_id"],
            ["users.id", "users.institution_id"],
            ondelete="CASCADE",
            name="fk_bookings_user",
        ),
        ForeignKeyConstraint(
            ["place_id", "institution_id"],
            ["places.id", "places.institution_id"],
            ondelete="CASCADE",
            name="fk_bookings_place",
        ),
        ForeignKeyConstraint(
            ["seat_id", "place_id"],
            ["seats.id", "seats.place_id"],
            ondelete="CASCADE",
            name="fk_bookings_seat",
        ),
        CheckConstraint("ends_at > starts_at", name="ends_after_start"),
        # Needs the btree_gist extension: it lets one GiST index combine
        # "same room" (=) with "overlapping time" (&&).
        ExcludeConstraint(
            (text("place_id"), "="),
            (text(_PERIOD), "&&"),
            where=text(f"seat_id IS NULL AND {_ACTIVE}"),
            name="ex_bookings_room_overlap",
        ),
        ExcludeConstraint(
            (text("seat_id"), "="),
            (text(_PERIOD), "&&"),
            where=text(f"seat_id IS NOT NULL AND {_ACTIVE}"),
            name="ex_bookings_seat_overlap",
        ),
        Index("ix_bookings_user_status", "user_id", "status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    institution_id: Mapped[int]
    user_id: Mapped[int]
    place_id: Mapped[int]
    seat_id: Mapped[int | None]
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[BookingStatus] = mapped_column(_enum_column(BookingStatus, "booking_status"))
    source: Mapped[BookingSource] = mapped_column(_enum_column(BookingSource, "booking_source"))

    place: Mapped[Place] = relationship(
        primaryjoin="Booking.place_id == Place.id", foreign_keys="Booking.place_id", viewonly=True
    )
    seat: Mapped[Seat | None] = relationship(
        primaryjoin="Booking.seat_id == Seat.id", foreign_keys="Booking.seat_id", viewonly=True
    )
