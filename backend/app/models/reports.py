"""A student who came to a room or seat they had booked and found someone
there says so (wave 19.2, app/reports.py).

The row points at the booking of the one who reports, never at the one who
stayed, so it holds no name of the other person. The reporter is kept so that
one booking makes one report. The institution reads the rows as a count by
place and hour (wave 19.3) and closes them. Deleted after 90 days.
"""

import enum
from datetime import datetime

from sqlalchemy import DateTime, ForeignKeyConstraint, Index, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.campus import _enum_column


class ReportStatus(enum.StrEnum):
    OPEN = "open"
    RESOLVED = "resolved"


class ReportResolution(enum.StrEnum):
    HANDLED = "handled"  # someone went and dealt with it
    NOBODY_THERE = "nobody_there"  # the institution found no one: the report was a mistake


class OccupancyReport(Base):
    __tablename__ = "occupancy_reports"
    __table_args__ = (
        # The reporter and the place belong to the same institution as the report.
        ForeignKeyConstraint(
            ["reporter_id", "institution_id"],
            ["users.id", "users.institution_id"],
            ondelete="CASCADE",
            name="fk_occupancy_reports_reporter",
        ),
        ForeignKeyConstraint(
            ["place_id", "institution_id"],
            ["places.id", "places.institution_id"],
            ondelete="CASCADE",
            name="fk_occupancy_reports_place",
        ),
        ForeignKeyConstraint(["booking_id"], ["bookings.id"], ondelete="SET NULL", name="fk_occupancy_reports_booking"),
        UniqueConstraint("booking_id"),  # one booking, one report
        # What the institution reads: reports by place and by time.
        Index("ix_occupancy_reports_institution_created", "institution_id", "created_at"),
        Index("ix_occupancy_reports_place_created", "place_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    institution_id: Mapped[int]
    place_id: Mapped[int]
    seat_id: Mapped[int | None]  # a lab seat; empty for a room
    booking_id: Mapped[int | None]
    reporter_id: Mapped[int]
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[ReportStatus] = mapped_column(_enum_column(ReportStatus, "report_status"), default=ReportStatus.OPEN)
    resolution: Mapped[ReportResolution | None] = mapped_column(_enum_column(ReportResolution, "report_resolution"))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
