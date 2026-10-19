"""A place's screen link (wave 13): the secret address a tablet by the
door opens to show the code that changes every minute. Only an HMAC of its
token is kept, as for calendar feeds, so the database alone cannot be
turned back into a working link."""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class PlaceScreen(Base):
    __tablename__ = "place_screens"

    # One link per place; several screens may open it (two doors).
    place_id: Mapped[int] = mapped_column(ForeignKey("places.id", ondelete="CASCADE"), primary_key=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    # When a screen last asked for a code: the admin sees it is really on.
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
