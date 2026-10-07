"""Signed-in sessions: a long refresh token in a cookie, a short access token.

- Refresh token: random, 7 days, sent only to /auth in an HttpOnly cookie.
  The database keeps its SHA-256, never the token. Every refresh replaces
  it (rotation); presenting a replaced token again means it was copied, so
  every session of that user is revoked.
- Access token: a JWT for 15 minutes, sent as "Authorization: Bearer".
  Each request also checks that its session is still alive, so "sign out
  everywhere" takes effect immediately.
"""

import hashlib
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta

import jwt
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.errors import Refusal
from app.models import AuthSession, User

SESSION_LIFETIME = timedelta(days=7)
ACCESS_TOKEN_LIFETIME = timedelta(minutes=15)
ACCESS_ALGORITHM = "HS256"
ISSUER = "studyspot"
AUDIENCE = "studyspot-api"


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


@dataclass(frozen=True)
class IssuedSession:
    session: AuthSession
    refresh_token: str  # the raw token, returned once and never stored


def start_session(db: Session, user: User, now: datetime) -> IssuedSession:
    token = secrets.token_urlsafe(32)
    row = AuthSession(
        user_id=user.id, token_hash=_hash(token), created_at=now, expires_at=now + SESSION_LIFETIME
    )
    db.add(row)
    db.flush()
    return IssuedSession(row, token)


def rotate(db: Session, refresh_token: str, now: datetime) -> tuple[User, IssuedSession]:
    row = db.scalars(
        select(AuthSession).where(AuthSession.token_hash == _hash(refresh_token)).with_for_update()
    ).first()
    if row is None:
        raise Refusal(401, "invalid_session")
    if row.revoked_at is not None:
        if row.replaced_by_id is not None:
            # A token that was already exchanged is being used again: someone
            # holds a copy. End every session of this user to cut them off.
            revoke_all(db, row.user_id, now)
        raise Refusal(401, "invalid_session")
    if row.expires_at <= now:
        raise Refusal(401, "invalid_session")
    user = db.get(User, row.user_id)
    issued = start_session(db, user, now)
    row.revoked_at, row.replaced_by_id = now, issued.session.id
    db.flush()
    return user, issued


def revoke(db: Session, refresh_token: str, now: datetime) -> None:
    db.execute(
        update(AuthSession)
        .where(AuthSession.token_hash == _hash(refresh_token), AuthSession.revoked_at.is_(None))
        .values(revoked_at=now)
    )


def revoke_all(db: Session, user_id: int, now: datetime) -> None:
    db.execute(
        update(AuthSession)
        .where(AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None))
        .values(revoked_at=now)
    )


def access_token(user: User, session: AuthSession, now: datetime, secret: bytes) -> str:
    claims = {
        "iss": ISSUER,
        "aud": AUDIENCE,
        "sub": str(user.id),
        "sid": session.id,
        "iat": int(now.timestamp()),
        "exp": int((now + ACCESS_TOKEN_LIFETIME).timestamp()),
    }
    return jwt.encode(claims, secret, algorithm=ACCESS_ALGORITHM)


def user_from_access_token(db: Session, token: str, now: datetime, secret: bytes) -> User:
    """Verify the JWT and that its session is still alive; return the user."""
    try:
        claims = jwt.decode(
            token,
            secret,
            algorithms=[ACCESS_ALGORITHM],  # fixed: "none" or RS256 are refused
            audience=AUDIENCE,
            issuer=ISSUER,
            # Time is checked below against the app clock (tests can move it).
            options={"require": ["exp", "sub", "sid"], "verify_exp": False, "verify_iat": False},
        )
        expires, user_id, session_id = int(claims["exp"]), int(claims["sub"]), int(claims["sid"])
    except (jwt.PyJWTError, KeyError, ValueError, TypeError):
        raise Refusal(401, "invalid_token") from None
    if expires <= now.timestamp():
        raise Refusal(401, "token_expired")
    alive = db.scalars(
        select(AuthSession.id).where(
            AuthSession.id == session_id,
            AuthSession.user_id == user_id,
            AuthSession.revoked_at.is_(None),
            AuthSession.expires_at > now,
        )
    ).first()
    user = db.get(User, user_id) if alive is not None else None
    if user is None:
        raise Refusal(401, "invalid_token")
    return user
