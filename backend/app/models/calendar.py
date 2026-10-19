"""A student's calendar feed (app/calendar_feed.py): one secret address a
calendar app subscribes to. Only an HMAC of its token is kept, so the
database alone cannot be turned back into a working address."""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class CalendarFeed(Base):
    __tablename__ = "calendar_feeds"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    # When a calendar app last read it: shows the student it really works.
    last_read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
