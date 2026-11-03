"""Wrong passwords, per (mail address, client address) together (app/passwords.py).

One row per wrong try. Kept in the database, not in one server's memory, so a
restart or a second server does not give the guesser a fresh count. A row is
only useful for LOCK_FOR; the sweep deletes the old ones.
"""

from datetime import datetime

from sqlalchemy import DateTime, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class PasswordTry(Base):
    __tablename__ = "password_tries"
    __table_args__ = (
        # The question asked on every sign-in: how many recent wrong tries has this pair made?
        Index("ix_password_tries_pair", "pair", "tried_at"),
        Index("ix_password_tries_tried_at", "tried_at"),  # the sweep deletes by age
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    pair: Mapped[str] = mapped_column(String(400))  # "<mail address>|<client address>"
    tried_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
