"""Opening hours of study places, and special periods such as exams."""

from datetime import date, time

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    ForeignKeyConstraint,
    SmallInteger,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.campus import Institution, Place


class OpeningHours(Base):
    """When a place is open on one day of the week.

    Times are local to the institution's timezone. A day with no row
    means the place is closed that day.
    """

    __tablename__ = "opening_hours"
    __table_args__ = (
        UniqueConstraint("place_id", "weekday"),
        # Same numbering as Python's date.weekday(): Monday is 0, Sunday is 6.
        CheckConstraint("weekday BETWEEN 0 AND 6", name="weekday_range"),
        # Hours that cross midnight are not supported; round-the-clock
        # opening is modelled with a special period instead.
        CheckConstraint("opens < closes", name="opens_before_closes"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    # Indexed by uq(place_id, weekday).
    place_id: Mapped[int] = mapped_column(ForeignKey("places.id", ondelete="CASCADE"))
    weekday: Mapped[int] = mapped_column(SmallInteger)
    opens: Mapped[time]
    closes: Mapped[time]

    place: Mapped[Place] = relationship(back_populates="opening_hours")


class SpecialPeriod(Base):
    """A date range with special hours, for example the exam period."""

    __tablename__ = "special_periods"
    __table_args__ = (
        UniqueConstraint("institution_id", "name"),
        # Target of the composite foreign key from special_period_places.
        UniqueConstraint("id", "institution_id"),
        CheckConstraint("btrim(name) <> ''", name="name_not_blank"),
        CheckConstraint("starts_on <= ends_on", name="starts_before_ends"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    # Indexed by uq(institution_id, name).
    institution_id: Mapped[int] = mapped_column(ForeignKey("institutions.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(100))
    starts_on: Mapped[date]
    ends_on: Mapped[date]

    institution: Mapped[Institution] = relationship(back_populates="special_periods")
    place_links: Mapped[list["SpecialPeriodPlace"]] = relationship(
        back_populates="period", cascade="all, delete-orphan"
    )
    # Read-only shortcut to the places open around the clock in this period.
    places: Mapped[list[Place]] = relationship(
        secondary="special_period_places", viewonly=True, order_by=Place.id
    )


class SpecialPeriodPlace(Base):
    """A place that is open 24/7 during a special period.

    Both composite foreign keys share institution_id, so the database
    refuses to link a period of one institution to a place of another.
    """

    __tablename__ = "special_period_places"
    __table_args__ = (
        ForeignKeyConstraint(
            ["period_id", "institution_id"],
            ["special_periods.id", "special_periods.institution_id"],
            ondelete="CASCADE",
            name="fk_special_period_places_period",
        ),
        ForeignKeyConstraint(
            ["place_id", "institution_id"],
            ["places.id", "places.institution_id"],
            ondelete="CASCADE",
            name="fk_special_period_places_place",
        ),
    )

    period_id: Mapped[int] = mapped_column(primary_key=True)
    place_id: Mapped[int] = mapped_column(primary_key=True, index=True)
    institution_id: Mapped[int]

    # institution_id is copied from the period only; the place is joined
    # by its id, and the database checks that its institution matches.
    period: Mapped[SpecialPeriod] = relationship(back_populates="place_links")
    place: Mapped[Place] = relationship(
        primaryjoin="SpecialPeriodPlace.place_id == Place.id",
        foreign_keys=[place_id],
    )
