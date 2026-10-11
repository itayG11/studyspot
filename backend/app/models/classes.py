"""A student's weekly timetable: when and where their classes are, so the
site can suggest a place to study in the gaps (app/between_classes.py).
Only its owner sees it, and it goes with the account."""

from datetime import time

from sqlalchemy import CheckConstraint, ForeignKey, SmallInteger, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.campus import Building


class ClassSlot(Base):
    __tablename__ = "class_slots"
    __table_args__ = (
        CheckConstraint("weekday BETWEEN 0 AND 6", name="weekday_range"),
        CheckConstraint("ends > starts", name="ends_after_start"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    weekday: Mapped[int] = mapped_column(SmallInteger)  # Python's numbering: Monday is 0
    starts: Mapped[time]  # local, in the institution's time zone
    ends: Mapped[time]
    building_id: Mapped[int] = mapped_column(ForeignKey("buildings.id", ondelete="CASCADE"))
    title: Mapped[str | None] = mapped_column(String(60))

    building: Mapped[Building] = relationship()
