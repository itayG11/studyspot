"""The calendar feed (app/calendar_feed.py): made and removed by the signed-in
student, read by their calendar app with only the token in the address."""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app import calendar_feed
from app.api.deps import get_session
from app.api.push import _shared_demo
from app.auth import get_current_user
from app.clock import get_now
from app.config import Settings, get_settings
from app.models import User
from app.ratelimit import calendar_limit, write_limit
from app.schemas import CalendarFeedOut

router = APIRouter(tags=["calendar"])

SessionDep = Annotated[Session, Depends(get_session)]
UserDep = Annotated[User, Depends(get_current_user)]
NowDep = Annotated[datetime, Depends(get_now)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


def _key(settings: Settings) -> bytes:
    return calendar_feed.feed_key(settings.jwt_secret_bytes())


@router.get("/me/calendar", response_model=CalendarFeedOut)
def my_feed(user: UserDep, db: SessionDep):
    feed = calendar_feed.feed_of(db, user)
    if feed is None:
        return CalendarFeedOut(active=False)
    return CalendarFeedOut(active=True, created_at=feed.created_at, last_read_at=feed.last_read_at)


@router.post(
    "/me/calendar", status_code=status.HTTP_201_CREATED, response_model=CalendarFeedOut,
    dependencies=[Depends(write_limit)],
)
def make_feed(user: UserDep, db: SessionDep, now: NowDep, settings: SettingsDep):
    if _shared_demo(db, user):
        # Every visitor is the same demo student: each would read, or end, the others' feed.
        raise HTTPException(403, "calendar_demo_account")
    token = calendar_feed.new_feed(db, user, now, _key(settings))
    db.commit()
    # Where the API is: /api next to the site in production (app/site.py).
    url = f"{settings.public_api_url.rstrip('/')}/calendar.ics?t={token}"
    return CalendarFeedOut(active=True, url=url, created_at=now)


@router.delete("/me/calendar", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(write_limit)])
def remove_feed(user: UserDep, db: SessionDep) -> None:
    calendar_feed.revoke(db, user)
    db.commit()


@router.get("/calendar.ics", dependencies=[Depends(calendar_limit)], include_in_schema=False)
def read_feed(
    t: Annotated[str, Query(min_length=20, max_length=100)], db: SessionDep, now: NowDep, settings: SettingsDep
) -> Response:
    """The token is in the query, not the path: the request log (app/edge.py)
    writes the path only, so the token is never in it."""
    user = calendar_feed.user_for(db, t, now, _key(settings))
    if user is None:
        raise HTTPException(404, "calendar_not_found")
    text = calendar_feed.build(db, user, now)
    db.commit()  # when it was last read
    return Response(
        text,
        media_type="text/calendar; charset=utf-8",
        headers={"Cache-Control": "private, max-age=900", "X-Robots-Tag": "noindex"},
    )
