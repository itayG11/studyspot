"""The waiting list for a group room (wave 11): "tell me if this time frees".

One row per student, room and time range. The sweep tells the first in line
when the whole range is free (app/waitlist.py); the room is not held for
them: whoever books first gets it. Deleted with the user or the place, and
by the sweep once the time has passed.
"""

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.campus import Place


class WaitlistEntry(Base):
    __tablename__ = "waitlist_entries"
    __table_args__ = (
        UniqueConstraint("user_id", "place_id", "starts_at"),
        CheckConstraint("ends_at > starts_at", name="ends_after_start"),
        Index("ix_waitlist_entries_place_start", "place_id", "starts_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    place_id: Mapped[int] = mapped_column(ForeignKey("places.id", ondelete="CASCADE"))
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # When we told them it is free. Told once; the row stays until the time passes.
    notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    place: Mapped[Place] = relationship()
