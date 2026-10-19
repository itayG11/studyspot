"""A student's calendar feed (wave 12): a secret address with their
bookings and timetable, which a calendar app subscribes to and reads again
by itself every few hours.

The token is random; only an HMAC of it is kept (as for admin invites,
app/institutions.py). Making a new one ends the old one, and so does
removing it. Anyone holding the address sees the feed: it is shown to the
student once, and they can replace it at any time.
"""

import hashlib
import hmac
import secrets
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session, joinedload

from app.ics import Event, calendar
from app.models import Booking, BookingStatus, CalendarFeed, ClassSlot, Institution, Place, Seat, User

WEEKS_AHEAD = 16  # the classes, week by week: no RRULE and no time zone in the file
KEEP_PAST = timedelta(days=7)
MARK_READ_EVERY = timedelta(hours=1)  # not a database write on every read
UID_HOST = "getstudyspot.me"
# Completed too: an attended booking stays in the calendar's history (the
# sweep and a check-out mark it completed). Cancelled and no-show go.
SHOWN = (BookingStatus.BOOKED, BookingStatus.CHECKED_IN, BookingStatus.COMPLETED)


def feed_key(jwt_secret: bytes) -> bytes:
    """A key of its own, derived from the server secret (as app/email_codes.py does)."""
    return hmac.new(jwt_secret, b"studyspot calendar feeds", hashlib.sha256).digest()


def _hash(key: bytes, token: str) -> str:
    return hmac.new(key, token.encode(), hashlib.sha256).hexdigest()


def feed_of(db: Session, user: User) -> CalendarFeed | None:
    return db.get(CalendarFeed, user.id)


def new_feed(db: Session, user: User, now: datetime, key: bytes) -> str:
    """A new token, shown once. The old address stops working."""
    token = secrets.token_urlsafe(32)
    values = {"token_hash": _hash(key, token), "created_at": now, "last_read_at": None}
    # One statement, so two at once (two tabs) end with one row, not a 500.
    db.execute(
        pg_insert(CalendarFeed).values(user_id=user.id, **values)
        .on_conflict_do_update(index_elements=[CalendarFeed.user_id], set_=values)
    )
    db.expire_all()
    return token


def revoke(db: Session, user: User) -> None:
    db.execute(delete(CalendarFeed).where(CalendarFeed.user_id == user.id))
    db.expire_all()


def user_for(db: Session, token: str, now: datetime, key: bytes) -> User | None:
    feed = db.scalars(select(CalendarFeed).where(CalendarFeed.token_hash == _hash(key, token))).first()
    if feed is None:
        return None
    if feed.last_read_at is None or now - feed.last_read_at >= MARK_READ_EVERY:
        feed.last_read_at = now
        db.flush()
    return db.get(User, feed.user_id)


def _floor(floor: int) -> str:
    return "קומת קרקע" if floor == 0 else f"קומה {floor}"


def _bookings(db: Session, user: User, institution: Institution, now: datetime) -> list[Event]:
    rows = db.execute(
        select(Booking, Place, Seat)
        .join(Place, Place.id == Booking.place_id)
        .outerjoin(Seat, Seat.id == Booking.seat_id)
        .options(joinedload(Place.building))
        .where(Booking.user_id == user.id, Booking.status.in_(SHOWN), Booking.ends_at >= now - KEEP_PAST)
        .order_by(Booking.starts_at)
    ).all()
    found = []
    for booking, place, seat in rows:
        summary = f"StudySpot: {place.name}" + (f", עמדה {seat.label}" if seat else "")
        location = f"{place.building.name or place.building.code}, {_floor(place.floor)}, {institution.name}"
        found.append(Event(
            f"booking-{booking.id}@{UID_HOST}", booking.starts_at, booking.ends_at, summary, location,
            "הזמנה ב-StudySpot. מגיעים וסורקים את השלט בכניסה.",
        ))
    return found


def _classes(db: Session, user: User, zone: ZoneInfo, today: date) -> list[Event]:
    rows = db.scalars(
        select(ClassSlot).options(joinedload(ClassSlot.building)).where(ClassSlot.user_id == user.id)
    ).all()
    first = today - KEEP_PAST
    found = []
    for offset in range(7 * (WEEKS_AHEAD + 1)):
        day = first + timedelta(days=offset)
        for row in rows:
            if row.weekday != day.weekday():
                continue
            # The local hour, in that day's offset: across the clock change too.
            start = datetime.combine(day, row.starts, tzinfo=zone)
            end = datetime.combine(day, row.ends, tzinfo=zone)
            where = (row.building.name or row.building.code) if row.building else (row.place_text or "")
            found.append(Event(f"class-{row.id}-{day:%Y%m%d}@{UID_HOST}", start, end, row.title or "שיעור", where, ""))
    return found


def build(db: Session, user: User, now: datetime) -> str:
    institution = db.get(Institution, user.institution_id)
    zone = ZoneInfo(institution.timezone)
    today = now.astimezone(zone).date()
    events = _bookings(db, user, institution, now) + _classes(db, user, zone, today)
    return calendar(f"StudySpot · {institution.name}", events, now)
