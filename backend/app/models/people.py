"""Users, how they sign in, and which sign-ins belong to which institution."""

import enum
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.campus import _enum_column


class UserRole(enum.StrEnum):
    STUDENT = "student"
    INSTITUTION_ADMIN = "institution_admin"  # manages one institution's campus
    SYSTEM_ADMIN = "system_admin"  # runs the whole service


class AuthProvider(enum.StrEnum):
    MICROSOFT = "microsoft"
    GOOGLE = "google"
    DEMO = "demo"  # the demo sign-in (app/demo.py); never in a login rule
    EMAIL = "email"  # a one-time code sent to the address (app/email_codes.py)


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        # Target of the composite foreign keys from check_ins and bookings.
        UniqueConstraint("id", "institution_id"),
        CheckConstraint("email = lower(email)", name="email_lowercase"),
        CheckConstraint("btrim(display_name) <> ''", name="display_name_not_blank"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    institution_id: Mapped[int] = mapped_column(
        ForeignKey("institutions.id", ondelete="CASCADE"), index=True
    )
    # Shown to the user; never used to decide who they are (see UserIdentity).
    email: Mapped[str] = mapped_column(String(320))
    display_name: Mapped[str] = mapped_column(String(100))
    role: Mapped[UserRole] = mapped_column(
        _enum_column(UserRole, "user_role"), default=UserRole.STUDENT, server_default="student"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class UserIdentity(Base):
    """Who the user is at a sign-in provider.

    Microsoft: "<tid>:<oid>" (tenant and object id). Google: the "sub" claim.
    These never change and cannot be chosen by the user, unlike an email.
    """

    __tablename__ = "user_identities"
    __table_args__ = (UniqueConstraint("provider", "subject"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    provider: Mapped[AuthProvider] = mapped_column(_enum_column(AuthProvider, "auth_provider"))
    subject: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class InstitutionLoginRule(Base):
    """Which sign-ins belong to an institution.

    Microsoft: a tenant id (the "tid" claim, signed by Microsoft).
    Google: a Workspace domain (the "hd" claim). Email: the exact domain of
    the address a one-time code was sent to. One rule, one institution.
    """

    __tablename__ = "institution_login_rules"
    __table_args__ = (
        UniqueConstraint("provider", "value"),
        CheckConstraint("value = lower(value) AND btrim(value) <> ''", name="value_lowercase"),
        # Demo users are placed in their institution directly, never by a rule.
        CheckConstraint("provider IN ('microsoft', 'google', 'email')", name="real_provider"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    institution_id: Mapped[int] = mapped_column(
        ForeignKey("institutions.id", ondelete="CASCADE"), index=True
    )
    provider: Mapped[AuthProvider] = mapped_column(_enum_column(AuthProvider, "auth_provider"))
    value: Mapped[str] = mapped_column(String(255))


class AuthSession(Base):
    """One signed-in device. The refresh token itself is never stored, only
    its SHA-256 hash, so a database leak does not hand out sessions."""

    __tablename__ = "sessions"
    __table_args__ = (
        UniqueConstraint("token_hash"),
        CheckConstraint("expires_at > created_at", name="expires_after_creation"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Set when the token was rotated: using a replaced token again means it
    # was stolen, and every session of the user is revoked.
    replaced_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("sessions.id", ondelete="SET NULL")
    )


class EmailSignInCode(Base):
    """A one-time sign-in code sent by email (app/email_codes.py).

    Only an HMAC of the code is kept, keyed with a server secret: six digits
    are a million values, so a plain hash would be reversed in a moment.
    """

    __tablename__ = "email_sign_in_codes"
    __table_args__ = (
        CheckConstraint("email = lower(email)", name="email_lowercase"),
        CheckConstraint("expires_at > created_at", name="expires_after_creation"),
        CheckConstraint("attempts >= 0", name="attempts_not_negative"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(320), index=True)
    code_hash: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    # Wrong codes typed for this one; at MAX_ATTEMPTS it stops working.
    attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
