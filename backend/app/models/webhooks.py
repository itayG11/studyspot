"""Webhooks (wave 14.3): an institution's address that StudySpot calls when
something happens there, and the log of every delivery to it.

The signing secret is not stored: it is derived from the server's secret,
the endpoint's id and its secret_version (app/webhooks.py). "A new secret"
raises the version, and the old one stops matching at once.

A delivery row is written in the same transaction as the event (a check-in,
a booking), the "outbox" pattern: if the event is rolled back, so is its
delivery, and a delivery is never lost after the event was saved.
"""

import enum
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Index, Integer, String, Text, false
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class DeliveryStatus(enum.StrEnum):
    PENDING = "pending"  # waiting for its first try, or for the next one
    SENT = "sent"  # the endpoint answered 2xx
    FAILED = "failed"  # every try failed: no more tries


class WebhookEndpoint(Base):
    __tablename__ = "webhook_endpoints"
    __table_args__ = (Index("ix_webhook_endpoints_institution_id", "institution_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    institution_id: Mapped[int] = mapped_column(ForeignKey("institutions.id", ondelete="CASCADE"))
    url: Mapped[str] = mapped_column(String(500))
    events: Mapped[list[str]] = mapped_column(ARRAY(String(32)))
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    secret_version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    # The demo campus's built-in tester (wave 14.5): made by the server, not a visitor.
    built_in: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    # The tester answers 503 while this is on, to show a try again (wave 14.5).
    tester_failing: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class WebhookDelivery(Base):
    __tablename__ = "webhook_deliveries"
    __table_args__ = (
        # The sweep's question: what is due now.
        Index("ix_webhook_deliveries_due", "status", "next_attempt_at"),
        Index("ix_webhook_deliveries_endpoint_id", "endpoint_id", "id"),
        Index("ix_webhook_deliveries_created_at", "created_at"),  # the sweep deletes by age
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    endpoint_id: Mapped[int] = mapped_column(ForeignKey("webhook_endpoints.id", ondelete="CASCADE"))
    event_id: Mapped[str] = mapped_column(String(40))  # evt_..., the same on every try: the receiver dedupes by it
    event_type: Mapped[str] = mapped_column(String(32))
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB)
    status: Mapped[DeliveryStatus] = mapped_column(
        Enum(
            DeliveryStatus,
            name="delivery_status",
            native_enum=False,
            create_constraint=True,
            length=16,
            values_callable=lambda members: [m.value for m in members],
        ),
        default=DeliveryStatus.PENDING,
    )
    attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_status_code: Mapped[int | None] = mapped_column(Integer)
    last_error: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class WebhookTestHit(Base):
    """What the demo campus's built-in tester received (wave 14.5): the last
    20 per endpoint, kept an hour, so a visitor sees a real signed delivery."""

    __tablename__ = "webhook_test_hits"
    __table_args__ = (
        Index("ix_webhook_test_hits_endpoint_id", "endpoint_id", "id"),
        Index("ix_webhook_test_hits_received_at", "received_at"),  # the sweep deletes by age
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    endpoint_id: Mapped[int] = mapped_column(ForeignKey("webhook_endpoints.id", ondelete="CASCADE"))
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    event_type: Mapped[str | None] = mapped_column(String(32))
    event_id: Mapped[str | None] = mapped_column(String(40))
    headers: Mapped[dict[str, Any]] = mapped_column(JSONB)  # the StudySpot-* ones only
    body: Mapped[str] = mapped_column(Text)  # at most MAX_TEST_BODY: the receiver cuts it
    signature_ok: Mapped[bool] = mapped_column(Boolean)
    answered: Mapped[int] = mapped_column(Integer)  # 200, or 503 while the tester plays broken
