"""New institutions, and the invite links that give each its first admin.

Only the system admin creates an institution (app/api/system.py). It starts
hidden from the public list until its admin marks it active. The admin
comes by an invite: a random token, of which only an HMAC is kept, good
for 7 days and for one use.
"""

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.accounts import move_user
from app.errors import Refusal
from app.models import (
    AdminInvite,
    AuthProvider,
    Institution,
    User,
    UserIdentity,
    UserRole,
)

INVITE_LIFETIME = timedelta(days=7)

# The site's fixed addresses. One of them wins over an institution's short
# name (frontend/src/router.tsx), so an institution called "scan" would never
# open. tests/test_system_institutions.py keeps this in step with the router.
RESERVED_SLUGS = frozenset({
    "admin", "api", "assets", "design", "icons", "images", "institutions", "invite",
    "login", "me", "places", "privacy", "scan", "signed-in", "spaces", "system",
})


def invite_key(jwt_secret: bytes) -> bytes:
    """A key of its own, derived from the server secret (as app/email_codes.py does)."""
    return hmac.new(jwt_secret, b"studyspot admin invites", hashlib.sha256).digest()


def _hash(key: bytes, token: str) -> str:
    return hmac.new(key, token.encode(), hashlib.sha256).hexdigest()


def create_institution(db: Session, name: str, slug: str, timezone: str) -> Institution:
    if slug in RESERVED_SLUGS:
        raise Refusal(422, "institution_slug_reserved")
    if db.scalars(select(Institution.id).where(Institution.slug == slug)).first() is not None:
        raise Refusal(409, "institution_slug_taken")
    institution = Institution(name=name, slug=slug, timezone=timezone, is_active=False)
    db.add(institution)
    db.flush()
    return institution


def create_invite(
    db: Session, institution: Institution, created_by: User | None, now: datetime, key: bytes
) -> tuple[AdminInvite, str]:
    """A new invite, and its link's token: returned this once, never kept."""
    token = secrets.token_urlsafe(32)
    invite = AdminInvite(
        institution_id=institution.id,
        token_hash=_hash(key, token),
        created_by=created_by.id if created_by else None,
        created_at=now,
        expires_at=now + INVITE_LIFETIME,
    )
    db.add(invite)
    db.flush()
    return invite, token


def invite_status(invite: AdminInvite, now: datetime) -> str:
    if invite.used_at is not None:
        return "used"
    if invite.revoked_at is not None:
        return "revoked"
    if invite.expires_at <= now:
        return "expired"
    return "open"


def revoke_invite(invite: AdminInvite, now: datetime) -> None:
    if invite_status(invite, now) != "open":
        raise Refusal(409, "invite_not_open")
    invite.revoked_at = now


def _open_invite(db: Session, token: str, now: datetime, key: bytes, lock: bool) -> AdminInvite:
    query = select(AdminInvite).where(AdminInvite.token_hash == _hash(key, token))
    # Locked: two tabs accepting the same link wait for each other, and the
    # second sees it used.
    invite = db.scalars(query.with_for_update() if lock else query).first()
    if invite is None:
        raise Refusal(404, "invite_invalid")
    status = invite_status(invite, now)
    if status != "open":
        raise Refusal(410, f"invite_{status}")
    return invite


def inspect_invite(db: Session, token: str, now: datetime, key: bytes) -> Institution:
    """Which institution an invite is for, without using it."""
    return db.get(Institution, _open_invite(db, token, now, key, lock=False).institution_id)


def accept_invite(db: Session, user: User, token: str, now: datetime, key: bytes) -> Institution:
    invite = _open_invite(db, token, now, key, lock=True)
    # Locked too: a booking made in another tab between the deletes and the
    # move below would block the move (the keys tie it to the institution).
    db.refresh(user, with_for_update=True)
    is_demo = db.scalars(
        select(UserIdentity.id).where(UserIdentity.user_id == user.id, UserIdentity.provider == AuthProvider.DEMO)
    ).first()
    if is_demo is not None:
        # Every visitor of the live site shares the demo accounts.
        raise Refusal(403, "invite_demo_account")
    if user.role == UserRole.SYSTEM_ADMIN:
        raise Refusal(409, "invite_system_admin")  # already manages every institution
    target = db.get(Institution, invite.institution_id)
    if user.role == UserRole.INSTITUTION_ADMIN and user.institution_id != target.id:
        # Their own institution would be left with no admin, silently.
        raise Refusal(409, "invite_already_admin")
    if user.institution_id != target.id:
        current = db.get(Institution, user.institution_id)
        if current.login_rules:
            # A real institution's user (Braude): their account is theirs by
            # its sign-in rules, and must not leave it.
            raise Refusal(403, "invite_other_institution")
        move_user(db, user, target.id)
    user.role = UserRole.INSTITUTION_ADMIN
    invite.used_at, invite.used_by = now, user.id
    db.flush()
    return target
