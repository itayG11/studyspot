"""Role checks. Authorization lives on the server, next to the data."""

from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, HTTPException

from app.auth import get_current_user
from app.models import Institution, User, UserRole


def require_role(*roles: UserRole) -> Callable:
    def dependency(user: Annotated[User, Depends(get_current_user)]) -> User:
        if user.role not in roles:
            raise HTTPException(403, "forbidden")
        return user

    return dependency


require_admin = require_role(UserRole.INSTITUTION_ADMIN, UserRole.SYSTEM_ADMIN)


def can_manage(user: User, institution: Institution) -> bool:
    """A system admin manages every institution; an institution admin only theirs."""
    return user.role == UserRole.SYSTEM_ADMIN or (
        user.role == UserRole.INSTITUTION_ADMIN and user.institution_id == institution.id
    )
