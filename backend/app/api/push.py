"""Notifications: the site's push key; a user's browsers subscribing,
unsubscribing and asking for a test notification; and notices by email,
turned on and off, also from the signed link in every such email."""

import hmac
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.actions import run_action
from app.api.deps import get_session
from app.auth import get_current_user
from app.config import Settings, get_settings
from app.errors import Refusal
from app.models import AuthProvider, PushSubscription, User, UserIdentity
from app.notify import (
    Notice,
    PushSender,
    check_endpoint,
    decode_key,
    notify,
    public_key_b64,
    read_unsubscribe_token,
    sender_from_settings,
    unsubscribe_key,
    vapid_key,
)
from app.ratelimit import sign_in_limit, write_limit

router = APIRouter(tags=["push"])
SessionDep = Annotated[Session, Depends(get_session)]
UserDep = Annotated[User, Depends(get_current_user)]

MAX_SUBSCRIPTIONS = 5  # browsers per user: a phone, a laptop, a few more


class PushKeys(BaseModel):
    model_config = ConfigDict(extra="forbid")
    p256dh: str = Field(max_length=100)
    auth: str = Field(max_length=40)


class SubscriptionIn(BaseModel):
    """What the browser's PushSubscription.toJSON() gives, less what we ignore."""

    model_config = ConfigDict(extra="ignore")
    endpoint: str = Field(max_length=1000)
    keys: PushKeys


class EndpointIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    endpoint: str = Field(max_length=1000)


def get_push_sender(settings: Annotated[Settings, Depends(get_settings)]) -> PushSender | None:
    return sender_from_settings(settings)


def _shared_demo(db: Session, user: User) -> bool:
    return db.scalars(
        select(UserIdentity.id).where(UserIdentity.user_id == user.id, UserIdentity.provider == AuthProvider.DEMO)
    ).first() is not None


@router.get("/push/key")
def push_key(settings: Annotated[Settings, Depends(get_settings)]):
    """The applicationServerKey a browser subscribes with. Public by nature."""
    return {"key": public_key_b64(vapid_key(settings.jwt_secret_bytes()))}


@router.get("/me/push")
def my_push(user: UserDep, db: SessionDep):
    count = db.scalar(select(func.count()).select_from(PushSubscription).where(PushSubscription.user_id == user.id))
    return {"count": count}


@router.post("/me/push", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(write_limit)])
def subscribe(body: SubscriptionIn, user: UserDep, db: SessionDep):
    """A browser's subscription. The same browser again replaces its row,
    and moves to whoever is signed in on it now."""
    run_action(db, lambda: _subscribe(db, user, body))
    db.commit()


def _subscribe(db: Session, user: User, body: SubscriptionIn) -> None:
    if _shared_demo(db, user):
        # Every visitor is the same demo student: each would get the others' reminders.
        raise Refusal(403, "push_demo_account")
    check_endpoint(body.endpoint)
    decode_key(body.keys.p256dh, 65)
    decode_key(body.keys.auth, 16)
    row = db.scalars(select(PushSubscription).where(PushSubscription.endpoint == body.endpoint)).first()
    if row is not None and row.user_id != user.id and not hmac.compare_digest(decode_key(row.auth, 16), decode_key(body.keys.auth, 16)):
        # Another account's browser. Moving it here is right when it is the
        # same browser, now signed in as someone else: then its secret is
        # the same. A stranger who only learned the address does not have
        # that secret (test round, 25 Oct).
        raise Refusal(409, "push_endpoint_taken")
    if row is None:
        count = db.scalar(select(func.count()).select_from(PushSubscription).where(PushSubscription.user_id == user.id))
        if count >= MAX_SUBSCRIPTIONS:
            raise Refusal(409, "push_too_many")
        row = PushSubscription(endpoint=body.endpoint)
        db.add(row)
    row.user_id, row.p256dh, row.auth = user.id, body.keys.p256dh, body.keys.auth
    db.flush()


@router.delete("/me/push", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(write_limit)])
def unsubscribe(body: EndpointIn, user: UserDep, db: SessionDep):
    """Only one's own: someone else's endpoint is quietly left alone."""
    row = db.scalars(
        select(PushSubscription).where(PushSubscription.endpoint == body.endpoint, PushSubscription.user_id == user.id)
    ).first()
    if row is not None:
        db.delete(row)
        db.commit()


@router.post("/me/push/test", dependencies=[Depends(write_limit)])
def test_push(user: UserDep, db: SessionDep, push: Annotated[PushSender | None, Depends(get_push_sender)]):
    delivered = notify(db, user.id, Notice("StudySpot", "ההתראות פועלות במכשיר הזה.", "/me"), push)
    db.commit()
    return {"delivered": delivered}


class EmailNoticesIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool


def _email_notices_out(db: Session, user: User, settings: Settings) -> dict:
    """Whether notices may go by email, and if not, why: the shown reason."""
    if _shared_demo(db, user):
        reason = "demo"
    elif not user.email_verified:
        reason = "unverified"  # signed in with an address nobody proved
    elif not settings.email_login_enabled():
        reason = "off"  # no mailer on this site
    else:
        reason = None
    return {"enabled": user.email_notices and reason is None, "available": reason is None,
            "reason": reason, "address": user.email}


@router.get("/me/email-notices")
def my_email_notices(user: UserDep, db: SessionDep, settings: Annotated[Settings, Depends(get_settings)]):
    return _email_notices_out(db, user, settings)


@router.post("/me/email-notices", dependencies=[Depends(write_limit)])
def set_email_notices(
    body: EmailNoticesIn, user: UserDep, db: SessionDep, settings: Annotated[Settings, Depends(get_settings)]
):
    def act() -> None:
        if body.enabled:
            reason = _email_notices_out(db, user, settings)["reason"]
            if reason == "demo":
                raise Refusal(403, "push_demo_account")
            if reason is not None:
                raise Refusal(409, f"email_notices_{reason}")
        user.email_notices = body.enabled

    run_action(db, act)
    db.commit()
    return _email_notices_out(db, user, settings)


@router.post("/notices/unsubscribe", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(sign_in_limit)])
def unsubscribe_email(
    db: SessionDep,
    settings: Annotated[Settings, Depends(get_settings)],
    t: Annotated[str, Query(max_length=60)],
):
    """The link in every email notice, and the mail app's one-click button
    (RFC 8058). No sign-in: the signature says whose it is. It only ever
    turns notices off, so a stolen link can do no harm."""
    user_id = read_unsubscribe_token(unsubscribe_key(settings.jwt_secret_bytes()), t)
    if user_id is None:
        raise HTTPException(404, "unsubscribe_invalid")
    user = db.get(User, user_id)
    if user is not None and user.email_notices:
        user.email_notices = False
        db.commit()

