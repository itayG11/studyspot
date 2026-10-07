"""Who is making the request: the user behind the "Authorization: Bearer"
access token, after checking that its session is still alive."""

from datetime import datetime
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.api.deps import get_session
from app.clock import get_now
from app.config import Settings, get_settings
from app.errors import Refusal
from app.models import User
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
        return user_from_access_token(db, credentials.credentials, now, settings.jwt_secret_bytes())
    except Refusal as refusal:
        raise _unauthorized(refusal.code) from None


def _unauthorized(code: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=code,
        headers={"WWW-Authenticate": "Bearer"},
    )
