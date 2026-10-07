"""Demo sign-in: two fixed users, with no Microsoft or Google account.

Used for development and for the live demo, so the site can be shown to
someone who is not a student of the institution. It is off unless
DEMO_LOGIN_ENABLED is set (see app/config.py), and the endpoint answers
404 while it is off.
"""

import enum
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import Refusal
from app.models import AuthProvider, Institution, User, UserIdentity, UserRole


class Persona(enum.StrEnum):
    STUDENT = "student"
    ADMIN = "admin"


@dataclass(frozen=True)
class _Profile:
    email: str
    display_name: str
    role: UserRole


PROFILES = {
    Persona.STUDENT: _Profile("demo.student@studyspot.invalid", "סטודנט לדוגמה", UserRole.STUDENT),
    Persona.ADMIN: _Profile("demo.admin@studyspot.invalid", "מנהל לדוגמה", UserRole.INSTITUTION_ADMIN),
}


def demo_user(db: Session, institution_slug: str, persona: Persona, now: datetime) -> User:
    """Find or create the persona's user in the demo institution."""
    institution = db.scalars(select(Institution).where(Institution.slug == institution_slug)).first()
    if institution is None:
        raise Refusal(404, "institution_not_found")
    # An institution where real people sign in (it has sign-in rules, like
    # Braude's Microsoft tenants) is never a demo: otherwise one wrong
    # setting would make every visitor an admin of a real college.
    if institution.login_rules:
        raise Refusal(403, "not_a_demo_institution")
    profile = PROFILES[persona]
    # The identity is "<slug>:<persona>", so each institution has its own pair.
    subject = f"{institution.slug}:{persona.value}"
    link = db.scalars(
        select(UserIdentity).where(
            UserIdentity.provider == AuthProvider.DEMO, UserIdentity.subject == subject
        )
    ).first()
    if link is None:
        user = User(
            institution_id=institution.id,
            email=profile.email,
            display_name=profile.display_name,
            role=profile.role,
        )
        db.add(user)
        db.flush()
        db.add(UserIdentity(user_id=user.id, provider=AuthProvider.DEMO, subject=subject))
    else:
        user = db.get(User, link.user_id)
        user.role = profile.role  # a demo user keeps exactly its persona's role
    user.last_login_at = now
    db.flush()
    return user
