"""Push notification subscriptions, and the notices sent by email (app/notify.py).

One row per browser that agreed to get notifications: where to send them
(the push service's endpoint) and the two keys the browser gave for
encrypting them. Deleted with the user, and when the push service says the
browser is gone.
"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    endpoint: Mapped[str] = mapped_column(Text, unique=True)
    p256dh: Mapped[str] = mapped_column(String(100))  # the browser's public key, base64url
    auth: Mapped[str] = mapped_column(String(40))  # its shared secret, base64url
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class NoticeEmail(Base):
    """One notice sent by email: counted against the daily budget
    (app/notify.py), as Brevo's free plan sends 300 a day in all. Kept two
    days, then removed by the sweep."""

    __tablename__ = "notice_emails"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class ClosingNotice(Base):
    """A student told that their institution is closing (app/closing.py):
    once each, and only when a notice actually went out."""

    __tablename__ = "closing_notices"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
