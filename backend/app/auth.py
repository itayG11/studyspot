"""Who is making the request.

Sign-in with Google and Microsoft arrives in stage 5. Until then every
endpoint that needs a user answers 401: there is deliberately no
temporary shortcut (such as a "user id" header) that could reach
production by mistake. Tests replace this dependency with a test user
through app.dependency_overrides.
"""

from fastapi import HTTPException, status

from app.models import User


def get_current_user() -> User:
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="not_authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )
