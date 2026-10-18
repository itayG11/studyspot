"""How many people were in a place, every quarter hour (app/history.py).

Only a count: no user, so it can be kept for as long as it is useful,
after the check-ins it came from are deleted."""

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, false
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class OccupancyHistory(Base):
    __tablename__ = "occupancy_history"
    __table_args__ = (CheckConstraint("people >= 0", name="people_not_negative"),)

    place_id: Mapped[int] = mapped_column(ForeignKey("places.id", ondelete="CASCADE"), primary_key=True)
    slot_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True)
    people: Mapped[int]
    # Made up for the demo campus (app/seed/history.py), and labelled so in
    # the site. A real count for the same quarter hour replaces it.
    simulated: Mapped[bool] = mapped_column(default=False, server_default=false())
