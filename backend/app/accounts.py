"""Turning a verified provider identity into a StudySpot user."""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import Refusal
from app.models import Institution, InstitutionLoginRule, User, UserIdentity
from app.oidc import Provider, ProviderIdentity


def _open_institution(db: Session, slug: str | None) -> Institution | None:
    """The open campus, if one is set and it really is open: an institution
    with sign-in rules (a real one, like Braude) is never open to anyone."""
    if not slug:
        return None
    institution = db.scalars(select(Institution).where(Institution.slug == slug)).first()
    if institution is None or institution.login_rules:
        return None
    return institution


def sign_in(
    db: Session, provider: Provider, identity: ProviderIdentity, now: datetime, open_slug: str | None = None
) -> User:
    """Find or create the user. A sign-in that matches an institution's
    login rule joins that institution; any other joins the open campus, if
    there is one (Settings.open_sign_in_institution). Nobody is created
    otherwise."""
    rule = None
    if identity.institution_key:
        rule = db.scalars(
            select(InstitutionLoginRule).where(
                InstitutionLoginRule.provider == provider.name,
                InstitutionLoginRule.value == identity.institution_key,
            )
        ).first()
    if rule is not None:
        institution_id = rule.institution_id
    elif (open_campus := _open_institution(db, open_slug)) is not None:
        institution_id = open_campus.id
    else:
        raise Refusal(403, "institution_not_supported")

    link = db.scalars(
        select(UserIdentity).where(
            UserIdentity.provider == provider.name, UserIdentity.subject == identity.subject
        )
    ).first()
    if link is None:
        user = User(
            institution_id=institution_id,
            email=identity.email,
            display_name=identity.display_name[:100],
        )
        db.add(user)
        db.flush()
        db.add(UserIdentity(user_id=user.id, provider=provider.name, subject=identity.subject))
    else:
        user = db.get(User, link.user_id)
        if user.institution_id != institution_id:
            raise Refusal(403, "institution_not_supported")
        # Keep the shown details current; they are not used for identity.
        user.email, user.display_name = identity.email, identity.display_name[:100]
    user.last_login_at = now
    db.flush()
    return user
