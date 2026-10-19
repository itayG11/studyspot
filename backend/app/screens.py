"""A place's screen by the door (wave 13): a tablet that shows a check-in
code which changes every minute (app/codes.py), and the live occupancy.

The screen holds a secret link, not an admin's sign-in: a tablet in a
corridor can be picked up by anyone, and the link can only show this one
place's code. As for calendar feeds (app/calendar_feed.py), the token is
random and only an HMAC of it is kept. A new link ends the old one.
"""

import hashlib
import hmac
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.codes import make_screen_code, seconds_left, window_at
from app.hours import place_status
from app.models import CheckInMode, Place, PlaceScreen
from app.occupancy import occupied_by_place

MARK_SEEN_EVERY = timedelta(minutes=5)  # not a database write on every poll


def screen_key(jwt_secret: bytes) -> bytes:
    """A key of its own, derived from the server secret, apart from the calendar's."""
    return hmac.new(jwt_secret, b"studyspot place screens", hashlib.sha256).digest()


def _hash(key: bytes, token: str) -> str:
    return hmac.new(key, token.encode(), hashlib.sha256).hexdigest()


def new_screen(db: Session, place: Place, now: datetime, key: bytes) -> str:
    """A new token, shown to the admin once. The old link stops working."""
    token = secrets.token_urlsafe(32)
    values = {"token_hash": _hash(key, token), "created_at": now, "last_seen_at": None}
    # One statement, so two clicks at once end with one row, not a 500.
    db.execute(
        pg_insert(PlaceScreen).values(place_id=place.id, **values)
        .on_conflict_do_update(index_elements=[PlaceScreen.place_id], set_=values)
    )
    db.expire_all()
    return token


def revoke(db: Session, place: Place) -> None:
    db.execute(delete(PlaceScreen).where(PlaceScreen.place_id == place.id))
    db.expire_all()


@dataclass(frozen=True)
class ScreenView:
    place: Place
    code: str | None  # None while the place is closed: nobody can check in then
    seconds_left: int
    occupied: int


def view_for(db: Session, token: str, now: datetime, code_secret: bytes, key: bytes) -> ScreenView | None:
    """What the screen shows, or None for an unknown link (or a place back on a printed sign)."""
    screen = db.scalars(select(PlaceScreen).where(PlaceScreen.token_hash == _hash(key, token))).first()
    if screen is None:
        return None
    place = db.get(Place, screen.place_id)
    if place is None or place.check_in_mode is not CheckInMode.SCREEN:
        return None
    if screen.last_seen_at is None or now - screen.last_seen_at >= MARK_SEEN_EVERY:
        screen.last_seen_at = now
        db.flush()
    is_open = place_status(db, place, now).is_open
    code = make_screen_code(place.id, place.code_version, window_at(now), code_secret) if is_open else None
    occupied = occupied_by_place(db, [place.id], now).get(place.id, 0)
    return ScreenView(place=place, code=code, seconds_left=seconds_left(now), occupied=occupied)
