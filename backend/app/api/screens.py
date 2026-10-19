"""The screen by the door (app/screens.py): it asks for the current code
with only its secret link, no sign-in."""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Response
from sqlalchemy.orm import Session

from app import screens
from app.api.deps import get_code_secret, get_session
from app.clock import get_now
from app.config import Settings, get_settings
from app.ratelimit import screen_limit
from app.schemas import ScreenOut

router = APIRouter(tags=["screens"])


def screen_key(settings: Settings) -> bytes:
    return screens.screen_key(settings.jwt_secret_bytes())


@router.get("/screen", response_model=ScreenOut, dependencies=[Depends(screen_limit)])
def read_screen(
    response: Response,
    x_screen_token: Annotated[str, Header(min_length=20, max_length=100)],
    db: Annotated[Session, Depends(get_session)],
    now: Annotated[datetime, Depends(get_now)],
    secret: Annotated[bytes, Depends(get_code_secret)],
    settings: Annotated[Settings, Depends(get_settings)],
):
    """The token comes in a header, not the address: the site keeps it after
    "#", which the browser never sends, and no log or Referer sees it."""
    view = screens.view_for(db, x_screen_token, now, secret, screen_key(settings))
    if view is None:
        raise HTTPException(404, "screen_not_found")
    db.commit()  # when it was last seen
    # A new code every minute: never kept by a browser or a proxy.
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Robots-Tag"] = "noindex"
    return ScreenOut(
        place_name=view.place.name,
        building_code=view.place.building.code,
        code=view.code,
        seconds_left=view.seconds_left,
        occupied=view.occupied,
        capacity=view.place.capacity,
    )
