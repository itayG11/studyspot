""""I'm studying here" (app/shares.py): the student makes a link for a stay
of their own; anyone with the link can read it while the stay lasts."""

from dataclasses import asdict
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Response
from sqlalchemy.orm import Session

from app import shares
from app.api.deps import get_session
from app.auth import get_current_user
from app.clock import get_now
from app.config import Settings, get_settings
from app.models import User
from app.ratelimit import share_limit, write_limit
from app.schemas import ShareIn, ShareLinkOut, ShareOut

router = APIRouter(tags=["shares"])

SessionDep = Annotated[Session, Depends(get_session)]
NowDep = Annotated[datetime, Depends(get_now)]
SettingsDep = Annotated[Settings, Depends(get_settings)]
TOKEN = Path(min_length=10, max_length=80, pattern=r"^[cb][0-9]+\.n[01]\.[A-Za-z0-9_-]+$")
KINDS = {"check_in": shares.CHECK_IN, "booking": shares.BOOKING}


def share_key(settings: Settings) -> bytes:
    return shares.share_key(settings.jwt_secret_bytes())


@router.post("/shares", response_model=ShareLinkOut, dependencies=[Depends(write_limit)])
def make_share(
    body: ShareIn,
    user: Annotated[User, Depends(get_current_user)],
    db: SessionDep,
    now: NowDep,
    settings: SettingsDep,
):
    """Nothing is saved: the link is signed, and checked again when opened."""
    kind = KINDS[body.kind]
    if not shares.owned_stay(db, user, kind, body.id, now):
        raise HTTPException(404, "stay_not_found")
    token = shares.make_token(share_key(settings), kind, body.id, body.show_name)
    return ShareLinkOut(url=f"{settings.frontend_url.rstrip('/')}/s/{token}")


@router.get("/shares/{token}", response_model=ShareOut, dependencies=[Depends(share_limit)])
def read_share(
    token: Annotated[str, TOKEN],
    response: Response,
    db: SessionDep,
    now: NowDep,
    settings: SettingsDep,
):
    view = shares.view_for(db, token, now, share_key(settings))
    if view is None:
        raise HTTPException(404, "share_ended")
    # It ends the moment the stay does: never kept by a browser or a proxy.
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Robots-Tag"] = "noindex"
    return ShareOut(**asdict(view))
