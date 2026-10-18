"""What only the system admin does: create institutions and invite their
admins. Plus the two calls the invited admin makes with the link."""

import logging
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import campus_setup, closing, institutions
from app.api.auth import get_mailer
from app.api.deps import get_session
from app.auth import get_current_user
from app.clock import get_now
from app.config import Settings, get_settings
from app.errors import FOREIGN_KEY_VIOLATION, Refusal, is_duplicate, sqlstate
from app.mailer import Mailer
from app.models import AdminInvite, Building, Institution, InstitutionLoginRule, User, UserRole
from app.permissions import require_role
from app.ratelimit import write_limit
from app.schemas import (
    InstitutionCreateIn,
    InviteCreatedOut,
    InviteInstitutionOut,
    InviteOut,
    InviteTokenIn,
    LoginRuleOut,
    PendingRuleOut,
    SystemInstitutionOut,
)

router = APIRouter(tags=["system"])

log = logging.getLogger(__name__)
SessionDep = Annotated[Session, Depends(get_session)]
OwnerDep = Annotated[User, Depends(require_role(UserRole.SYSTEM_ADMIN))]
UserDep = Annotated[User, Depends(get_current_user)]
NowDep = Annotated[datetime, Depends(get_now)]
SettingsDep = Annotated[Settings, Depends(get_settings)]
Slug = Annotated[str, Path(max_length=64)]


def _key(settings: Settings) -> bytes:
    return institutions.invite_key(settings.jwt_secret_bytes())


def _institution(db: Session, slug: str) -> Institution:
    institution = db.scalars(select(Institution).where(Institution.slug == slug)).first()
    if institution is None:
        raise HTTPException(404, "institution_not_found")
    return institution


@router.get("/system/institutions", response_model=list[SystemInstitutionOut])
def list_all(owner: OwnerDep, db: SessionDep):
    buildings = (
        select(func.count()).select_from(Building).where(Building.institution_id == Institution.id).scalar_subquery()
    )
    admins = (
        select(func.count())
        .select_from(User)
        .where(User.institution_id == Institution.id, User.role == UserRole.INSTITUTION_ADMIN)
        .scalar_subquery()
    )
    rows = db.execute(select(Institution, buildings, admins).order_by(Institution.name)).all()
    return [
        SystemInstitutionOut(
            slug=i.slug, name=i.name, timezone=i.timezone, is_active=i.is_active, buildings=b, admins=a,
            closes_at=i.closes_at,
        )
        for i, b, a in rows
    ]


@router.post(
    "/system/institutions",
    status_code=status.HTTP_201_CREATED,
    response_model=SystemInstitutionOut,
    dependencies=[Depends(write_limit)],
)
def create(body: InstitutionCreateIn, owner: OwnerDep, db: SessionDep):
    try:
        institution = institutions.create_institution(db, body.name, body.slug, body.timezone)
        db.commit()
    except Refusal as refusal:
        raise HTTPException(refusal.status, refusal.code) from None
    except IntegrityError as error:  # the same name, created a moment ago in another tab
        if not is_duplicate(error):
            raise
        db.rollback()
        raise HTTPException(409, "institution_slug_taken") from None
    return SystemInstitutionOut(
        slug=institution.slug, name=institution.name, timezone=institution.timezone,
        is_active=False, buildings=0, admins=0,
    )


def _kept(settings: Settings) -> set[str]:
    return {settings.demo_institution} | ({settings.open_sign_in_institution} - {None})


@router.post("/system/institutions/{slug}/close", response_model=SystemInstitutionOut, dependencies=[Depends(write_limit)])
def close(
    slug: Slug,
    owner: OwnerDep,
    db: SessionDep,
    settings: SettingsDep,
    now: NowDep,
    mailer: Annotated[Mailer | None, Depends(get_mailer)],
):
    """Hidden now, deleted in 14 days (app/closing.py). Its admins get an
    email outside the notices' budget: few, and they must not miss it."""
    institution = db.scalars(select(Institution).where(Institution.slug == slug).with_for_update()).first()
    if institution is None:
        raise HTTPException(404, "institution_not_found")
    try:
        closed = closing.close(db, institution, now, _kept(settings), settings.system_admins())
    except Refusal as refusal:
        raise HTTPException(refusal.status, refusal.code) from None
    db.commit()
    if mailer is not None:
        subject, text = closing.admin_email(institution)
        for to in closed.admin_emails:
            try:
                mailer.send(to, subject, text)
            except Refusal:
                log.warning("closing %s: the email to an admin did not go out", slug)
    return _row(db, institution)


@router.post("/system/institutions/{slug}/reopen", response_model=SystemInstitutionOut, dependencies=[Depends(write_limit)])
def reopen(slug: Slug, owner: OwnerDep, db: SessionDep):
    institution = db.scalars(select(Institution).where(Institution.slug == slug).with_for_update()).first()
    if institution is None:
        raise HTTPException(404, "institution_not_found")
    try:
        closing.reopen(db, institution)
    except Refusal as refusal:
        raise HTTPException(refusal.status, refusal.code) from None
    db.commit()
    return _row(db, institution)


def _row(db: Session, institution: Institution) -> SystemInstitutionOut:
    buildings = db.scalar(select(func.count()).select_from(Building).where(Building.institution_id == institution.id))
    admins = db.scalar(
        select(func.count()).select_from(User).where(
            User.institution_id == institution.id, User.role == UserRole.INSTITUTION_ADMIN
        )
    )
    return SystemInstitutionOut(
        slug=institution.slug, name=institution.name, timezone=institution.timezone,
        is_active=institution.is_active, buildings=buildings, admins=admins, closes_at=institution.closes_at,
    )


@router.delete(
    "/system/institutions/{slug}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(write_limit)]
)
def delete(slug: Slug, owner: OwnerDep, db: SessionDep, settings: SettingsDep) -> None:
    institution = db.scalars(select(Institution).where(Institution.slug == slug).with_for_update()).first()
    if institution is None:
        raise HTTPException(404, "institution_not_found")
    try:
        institutions.delete_institution(db, institution, _kept(settings), settings.system_admins())
    except Refusal as refusal:
        raise HTTPException(refusal.status, refusal.code) from None
    db.commit()


@router.post(
    "/system/institutions/{slug}/invites",
    status_code=status.HTTP_201_CREATED,
    response_model=InviteCreatedOut,
    dependencies=[Depends(write_limit)],
)
def create_invite(slug: Slug, owner: OwnerDep, db: SessionDep, now: NowDep, settings: SettingsDep):
    invite, token = institutions.create_invite(db, _institution(db, slug), owner, now, _key(settings))
    db.commit()
    return InviteCreatedOut(id=invite.id, token=token, expires_at=invite.expires_at)


@router.get("/system/institutions/{slug}/invites", response_model=list[InviteOut])
def list_invites(slug: Slug, owner: OwnerDep, db: SessionDep, now: NowDep):
    institution = _institution(db, slug)
    invites = db.scalars(
        select(AdminInvite).where(AdminInvite.institution_id == institution.id).order_by(AdminInvite.id.desc())
    ).all()
    return [_invite_out(i, now) for i in invites]


@router.post("/system/invites/{invite_id}/revoke", response_model=InviteOut, dependencies=[Depends(write_limit)])
def revoke(invite_id: Annotated[int, Path(gt=0)], owner: OwnerDep, db: SessionDep, now: NowDep):
    invite = db.get(AdminInvite, invite_id, with_for_update=True)
    if invite is None:
        raise HTTPException(404, "invite_invalid")
    try:
        institutions.revoke_invite(invite, now)
    except Refusal as refusal:
        raise HTTPException(refusal.status, refusal.code) from None
    db.commit()
    return _invite_out(invite, now)


def _invite_out(invite: AdminInvite, now: datetime) -> InviteOut:
    return InviteOut(
        id=invite.id,
        status=institutions.invite_status(invite, now),
        created_at=invite.created_at,
        expires_at=invite.expires_at,
        used_at=invite.used_at,
    )


# --- The invited admin ------------------------------------------------------
# POST with the token in the body, never in the address: addresses end up
# in logs and in the browser's history.


@router.post("/invites/inspect", response_model=InviteInstitutionOut, dependencies=[Depends(write_limit)])
def inspect(body: InviteTokenIn, user: UserDep, db: SessionDep, now: NowDep, settings: SettingsDep):
    try:
        institution = institutions.inspect_invite(db, body.token, now, _key(settings))
    except Refusal as refusal:
        raise HTTPException(refusal.status, refusal.code) from None
    return InviteInstitutionOut(slug=institution.slug, name=institution.name)


@router.post("/invites/accept", response_model=InviteInstitutionOut, dependencies=[Depends(write_limit)])
def accept(body: InviteTokenIn, user: UserDep, db: SessionDep, now: NowDep, settings: SettingsDep):
    try:
        institution = institutions.accept_invite(db, user, body.token, now, _key(settings))
        db.commit()
    except Refusal as refusal:  # every refusal comes before the first write
        raise HTTPException(refusal.status, refusal.code) from None
    except IntegrityError as error:
        # Something of theirs changed at the same moment: a booking made in
        # the old institution trips the (user, institution) foreign key, the
        # same row added twice a unique index. Anything else is a bug.
        if not (is_duplicate(error) or sqlstate(error) == FOREIGN_KEY_VIOLATION):
            raise
        db.rollback()
        raise HTTPException(409, "concurrent_request") from None
    return InviteInstitutionOut(slug=institution.slug, name=institution.name)


# --- Login rules waiting for the system admin ---------------------------------


@router.get("/system/login-rules", response_model=list[PendingRuleOut])
def pending_rules(owner: OwnerDep, db: SessionDep):
    rows = db.execute(
        select(InstitutionLoginRule, Institution)
        .join(Institution, Institution.id == InstitutionLoginRule.institution_id)
        .where(~InstitutionLoginRule.approved)
        .order_by(InstitutionLoginRule.id)
    ).all()
    return [
        PendingRuleOut(
            id=r.id, provider=r.provider, value=r.value, approved=False,
            institution_slug=i.slug, institution_name=i.name,
        )
        for r, i in rows
    ]


@router.post("/system/login-rules/{rule_id}/approve", response_model=LoginRuleOut, dependencies=[Depends(write_limit)])
def approve_rule(rule_id: Annotated[int, Path(gt=0)], owner: OwnerDep, db: SessionDep):
    """After checking the domain or tenant is the institution's own. To
    refuse one, the system admin removes it (DELETE /admin/login-rules/{id})."""
    found = db.get(InstitutionLoginRule, rule_id, with_for_update=True)
    if found is None:
        raise HTTPException(404, "login_rule_not_found")
    try:
        campus_setup.approve_login_rule(db, found)
        db.commit()
    except Refusal as refusal:
        raise HTTPException(refusal.status, refusal.code) from None
    except IntegrityError as error:  # approved elsewhere at the same moment
        if not is_duplicate(error):
            raise
        db.rollback()
        raise HTTPException(409, "login_rule_taken") from None
    return found
