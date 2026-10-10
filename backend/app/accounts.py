"""Turning a verified provider identity into a StudySpot user."""

from datetime import datetime, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.errors import Refusal
from app.models import (
    AdminInvite,
    AuthProvider,
    Booking,
    CheckIn,
    Institution,
    InstitutionLoginRule,
    User,
    UserIdentity,
    UserRole,
)
from app.oidc import ProviderIdentity

# Anyone with a Google account can join the open campus, so new users there
# are capped per day: a flood of sign-ins cannot fill the free database.
OPEN_NEW_USERS_PER_DAY = 200


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
    db: Session,
    provider: AuthProvider,
    identity: ProviderIdentity,
    now: datetime,
    open_slug: str | None = None,
    system_admins: frozenset[str] = frozenset(),
) -> User:
    """Find or create the user. A sign-in that matches an institution's
    login rule joins that institution; any other joins the open campus, if
    there is one (Settings.open_sign_in_institution). Nobody is created
    otherwise."""
    rule = None
    if identity.institution_key:
        rule = db.scalars(
            select(InstitutionLoginRule).where(
                InstitutionLoginRule.provider == provider,
                InstitutionLoginRule.value == identity.institution_key,
                InstitutionLoginRule.approved,
            )
        ).first()
    link = db.scalars(
        select(UserIdentity).where(
            UserIdentity.provider == provider, UserIdentity.subject == identity.subject
        )
    ).first()
    existing = db.get(User, link.user_id) if link is not None else None

    if rule is not None:
        institution_id = rule.institution_id
    elif existing is not None and invited_to_own_institution(db, existing):
        # An admin who came by an invite (app/institutions.py) belongs to that
        # institution, not to the open campus their account would join, and
        # even where there is no open campus. A rule of another institution,
        # above, still wins, as for everyone.
        institution_id = existing.institution_id
    elif (open_campus := _open_institution(db, open_slug)) is not None:
        institution_id = open_campus.id
    else:
        raise Refusal(403, "institution_not_supported")

    if link is None:
        if rule is None:  # a new user of the open campus
            joined_today = db.scalar(
                select(func.count())
                .select_from(User)
                .where(User.institution_id == institution_id, User.created_at > func.now() - timedelta(days=1))
            )
            if joined_today >= OPEN_NEW_USERS_PER_DAY:
                raise Refusal(429, "open_sign_in_full")
        user = User(
            institution_id=institution_id,
            email=identity.email,
            display_name=identity.display_name[:100],
        )
        db.add(user)
        db.flush()
        db.add(UserIdentity(user_id=user.id, provider=provider, subject=identity.subject))
    else:
        user = existing
        if user.institution_id != institution_id:
            if not _moves_to_new_rule(db, user, rule, open_slug):
                raise Refusal(403, "institution_not_supported")
            # Signed in before the institution added this rule, so put in the
            # open campus then. Now the rule says where the account belongs.
            move_user(db, user, institution_id)
        # Keep the shown details current; they are not used for identity.
        user.email, user.display_name = identity.email, identity.display_name[:100]
    if provider == AuthProvider.GOOGLE:
        _sync_system_admin(db, user, identity, system_admins)
    user.last_login_at = now
    db.flush()
    return user


def move_user(db: Session, user: User, institution_id: int) -> None:
    """Move a user of the open campus to another institution. Their bookings
    and check-ins point at the open campus's places, and the database ties
    each to the user's institution (a composite key): they go first."""
    db.execute(delete(CheckIn).where(CheckIn.user_id == user.id))  # may point at a booking
    db.execute(delete(Booking).where(Booking.user_id == user.id))
    user.institution_id = institution_id


def _moves_to_new_rule(db: Session, user: User, rule: InstitutionLoginRule | None, open_slug: str | None) -> bool:
    """Only a student of the open campus moves by a rule, and only to an
    institution that is open. A real institution's user, an admin, or one of
    an institution still being set up, never does."""
    if rule is None or user.role != UserRole.STUDENT:
        return False
    current = db.get(Institution, user.institution_id)
    if current.slug != open_slug or current.login_rules:
        return False
    return db.get(Institution, rule.institution_id).is_active


def invited_to_own_institution(db: Session, user: User) -> bool:
    """Whether the user accepted an admin invite to the institution they are in."""
    return db.scalars(
        select(AdminInvite.id).where(AdminInvite.used_by == user.id, AdminInvite.institution_id == user.institution_id)
    ).first() is not None


def is_trusted_admin_address(identity: ProviderIdentity) -> bool:
    """Google's email_verified is reliable only for gmail.com, or for an
    account of the address's own Google Workspace (hd). Anyone can open a
    personal Google account with another address: verified long ago, or
    an address since recycled."""
    domain = identity.email.rsplit("@", 1)[-1]
    return identity.email_verified and (domain == "gmail.com" or identity.institution_key == domain)


def unlisted_role(db: Session, user: User) -> UserRole:
    """What a system admin taken off the list goes back to."""
    return UserRole.INSTITUTION_ADMIN if invited_to_own_institution(db, user) else UserRole.STUDENT


def _sync_system_admin(db: Session, user: User, identity: ProviderIdentity, system_admins: frozenset[str]) -> None:
    """The one place an e-mail address decides anything: SYSTEM_ADMIN_EMAILS.
    Only a Google sign-in counts, with an address Google can vouch for.
    (Someone taken off the list loses the role at once: app/auth.py.)"""
    if is_trusted_admin_address(identity) and identity.email.lower() in system_admins:
        user.role = UserRole.SYSTEM_ADMIN
    elif user.role == UserRole.SYSTEM_ADMIN:
        user.role = unlisted_role(db, user)
