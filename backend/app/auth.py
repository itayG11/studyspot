"""Who is making the request: the user behind the "Authorization: Bearer"
access token, after checking that its session is still alive."""

from datetime import datetime
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.accounts import unlisted_role
from app.api.deps import get_session
from app.clock import get_now
from app.config import Settings, get_settings
from app.errors import Refusal
from app.models import User, UserRole
from app.sessions import user_from_access_token

_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    db: Annotated[Session, Depends(get_session)],
    now: Annotated[datetime, Depends(get_now)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> User:
    if credentials is None:
        raise _unauthorized("not_authenticated")
    try:
        user = user_from_access_token(db, credentials.credentials, now, settings.jwt_secret_bytes())
    except Refusal as refusal:
        raise _unauthorized(refusal.code) from None
    return demote_unlisted(db, user, settings.system_admins())


def demote_unlisted(db: Session, user: User, system_admins: frozenset[str]) -> User:
    """A system admin taken off SYSTEM_ADMIN_EMAILS loses the role on their
    very next request, not only at their next sign-in: a session lives for
    days, and removing an admin is when it must take effect at once."""
    if user.role == UserRole.SYSTEM_ADMIN and user.email.lower() not in system_admins:
        user.role = unlisted_role(db, user)
        db.flush()
    return user


def _unauthorized(code: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=code,
        headers={"WWW-Authenticate": "Bearer"},
    )
