"""Check-ins: a student scanned a place's code and is there right now.

A check-in is active while ended_at is empty and expires_at is in the
future. Expired rows are closed lazily (on the next check-in); a
background sweep arrives in stage 4 together with booking release.
"""

import enum
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKeyConstraint,
    Index,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.campus import Place, Seat, _enum_column


class CheckInEndReason(enum.StrEnum):
    CHECKOUT = "checkout"  # the student checked out
    EXPIRED = "expired"  # the time ran out
    MOVED = "moved"  # the student checked in somewhere else


class CheckIn(Base):
    __tablename__ = "check_ins"
    __table_args__ = (
        # User and place must belong to the same institution as the check-in.
        ForeignKeyConstraint(
            ["user_id", "institution_id"],
            ["users.id", "users.institution_id"],
            ondelete="CASCADE",
            name="fk_check_ins_user",
        ),
        ForeignKeyConstraint(
            ["place_id", "institution_id"],
            ["places.id", "places.institution_id"],
            ondelete="CASCADE",
            name="fk_check_ins_place",
        ),
        # A seat must belong to the checked-in place. With seat_id empty
        # (open areas, library) PostgreSQL skips this check.
        ForeignKeyConstraint(
            ["seat_id", "place_id"],
            ["seats.id", "seats.place_id"],
            ondelete="CASCADE",
            name="fk_check_ins_seat",
        ),
        # A check-in can confirm a booking (group rooms, lab seats).
        ForeignKeyConstraint(
            ["booking_id"], ["bookings.id"], ondelete="SET NULL", name="fk_check_ins_booking"
        ),
        UniqueConstraint("booking_id"),
        CheckConstraint("expires_at > started_at", name="expires_after_start"),
        CheckConstraint("ended_at IS NULL OR ended_at >= started_at", name="ends_after_start"),
        CheckConstraint("(ended_at IS NULL) = (end_reason IS NULL)", name="ended_with_reason"),
        # Partial unique indexes: they only cover rows that are still open.
        Index(
            "uq_check_ins_one_active_per_user",
            "user_id",
            unique=True,
            postgresql_where=text("ended_at IS NULL"),
        ),
        Index(
            "uq_check_ins_one_active_per_seat",
            "seat_id",
            unique=True,
            postgresql_where=text("ended_at IS NULL AND seat_id IS NOT NULL"),
        ),
        Index("ix_check_ins_open_by_place", "place_id", postgresql_where=text("ended_at IS NULL")),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    institution_id: Mapped[int]
    user_id: Mapped[int]
    place_id: Mapped[int]
    seat_id: Mapped[int | None]
    booking_id: Mapped[int | None]
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    end_reason: Mapped[CheckInEndReason | None] = mapped_column(
        _enum_column(CheckInEndReason, "check_in_end_reason")
    )

    # Read-only links: ids are set explicitly, because the composite
    # foreign keys share columns and would fight over copying them.
    place: Mapped[Place] = relationship(
        primaryjoin="CheckIn.place_id == Place.id", foreign_keys="CheckIn.place_id", viewonly=True
    )
    seat: Mapped[Seat | None] = relationship(
        primaryjoin="CheckIn.seat_id == Seat.id", foreign_keys="CheckIn.seat_id", viewonly=True
    )
