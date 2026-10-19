"""The waiting list for group rooms (wave 11).

A student whose booking was refused because the time is taken asks to be
told if it frees. Nothing marks a room as freed: a booking can end by being
cancelled, by a no-show, by the sweep or lazily on the next booking. So the
sweep simply asks, for each waiting request, whether its whole range is free
now (take_freed). A cancel is a visit, so the sweep runs within the minute
(app/activity.py); a booking that may turn into a no-show wakes it, by the
alarm, when its arrival window closes (next_due).

Only a student we can tell may wait: one with no browser subscribed and no
email notices would be "told" into nothing, and hold up the next in line.

The first in line is told first. The others for that time get a head start
of HEAD_START behind them: if the first did not book, the next is told then.
The room is never held: whoever books first gets it, so nothing can stay
reserved for someone who walked away.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import and_, delete, exists, func, select
from sqlalchemy.orm import Session, selectinload

from app.bookings import NO_SHOW_AFTER, check_times, floor_to_slot, holding, same_resource
from app.closing import refuse_if_closing
from app.errors import Refusal
from app.models import AuthProvider, Booking, BookingStatus, Institution, Place, PlaceKind, User, UserIdentity
from app.models.waitlist import WaitlistEntry
from app.notify import Notice, reachable

MAX_WAITING = 3  # open requests per student
HEAD_START = timedelta(minutes=10)  # the first in line gets this long alone
USEFUL_LEFT = timedelta(minutes=30)  # less time than this left: not worth telling


@dataclass(frozen=True)
class Freed:
    user_id: int
    notice: Notice


def _taken(place: Place, starts_at: datetime, ends_at: datetime, now: datetime):
    """A booking that holds some of the range."""
    return exists().where(
        same_resource(place, None),
        holding(now),
        Booking.starts_at < ends_at,
        Booking.ends_at > starts_at,
    )


def _still_useful(now: datetime):
    """A request with enough of its time left to be worth booking. Its start
    may have passed: a room freed by a no-show frees just as the start can
    no longer be booked, and the rest of the time is still wanted."""
    return WaitlistEntry.ends_at > now + USEFUL_LEFT


def join(session: Session, user: User, place_id: int, starts_at: datetime, ends_at: datetime, now: datetime) -> WaitlistEntry:
    place = session.scalars(
        select(Place).where(Place.id == place_id).options(selectinload(Place.opening_hours))
    ).first()
    if place is None or place.institution_id != user.institution_id:
        raise Refusal(404, "place_not_found")
    refuse_if_closing(session, place.institution_id)
    if place.kind != PlaceKind.GROUP_ROOM:
        raise Refusal(409, "waitlist_rooms_only")  # a lab has many seats: book another
    shared_demo = session.scalars(
        select(UserIdentity.id).where(UserIdentity.user_id == user.id, UserIdentity.provider == AuthProvider.DEMO)
    ).first()
    if shared_demo is not None:
        raise Refusal(403, "push_demo_account")  # every visitor would be told about everyone's
    check_times(session, place, starts_at, ends_at, now)
    if not session.scalar(select(_taken(place, starts_at, ends_at, now))):
        raise Refusal(409, "waitlist_slot_free")  # it is free: book it
    if not session.scalar(select(reachable(user.id))):
        raise Refusal(409, "waitlist_no_notices")
    # The user's row first: two requests at once (a double tap) then wait for
    # each other, and the second finds the first's row instead of failing.
    session.scalars(select(User).where(User.id == user.id).with_for_update()).one()
    existing = session.scalars(
        select(WaitlistEntry).where(
            WaitlistEntry.user_id == user.id, WaitlistEntry.place_id == place.id, WaitlistEntry.starts_at == starts_at
        )
    ).first()
    if existing is not None:
        existing.ends_at, existing.notified_at = ends_at, None
        session.flush()
        return existing
    waiting = session.scalar(
        select(func.count()).select_from(WaitlistEntry).where(WaitlistEntry.user_id == user.id, _still_useful(now))
    )
    if waiting >= MAX_WAITING:
        raise Refusal(409, "waitlist_too_many")
    entry = WaitlistEntry(user_id=user.id, place_id=place.id, starts_at=starts_at, ends_at=ends_at)
    session.add(entry)
    session.flush()
    return entry


def my_entries(session: Session, user: User, now: datetime) -> list[WaitlistEntry]:
    return list(
        session.scalars(
            select(WaitlistEntry)
            .where(WaitlistEntry.user_id == user.id, _still_useful(now))
            .options(selectinload(WaitlistEntry.place))
            .order_by(WaitlistEntry.starts_at)
        )
    )


def leave(session: Session, user: User, entry_id: int) -> None:
    """Only one's own; anything else looks like 404."""
    deleted = session.execute(
        delete(WaitlistEntry).where(WaitlistEntry.id == entry_id, WaitlistEntry.user_id == user.id)
    ).rowcount
    if not deleted:
        raise Refusal(404, "waitlist_not_found")


def _overlap(a: WaitlistEntry, b: WaitlistEntry) -> bool:
    return a.place_id == b.place_id and a.starts_at < b.ends_at and b.starts_at < a.ends_at


def take_freed(session: Session, now: datetime) -> list[Freed]:
    """Mark the requests whose range is free now, and say whom to tell.
    Locked while marked (SKIP LOCKED), like the reminders, so two processes
    never tell the same one."""
    pending = session.scalars(
        select(WaitlistEntry)
        .where(WaitlistEntry.notified_at.is_(None), _still_useful(now), reachable(WaitlistEntry.user_id))
        .order_by(WaitlistEntry.created_at, WaitlistEntry.id)
        .with_for_update(skip_locked=True)
    ).all()
    if not pending:
        return []
    told = list(
        session.scalars(
            select(WaitlistEntry).where(WaitlistEntry.notified_at > now - HEAD_START, _still_useful(now))
        )
    )
    places = {p.id: p for p in session.scalars(select(Place).where(Place.id.in_({e.place_id for e in pending})))}
    institutions = {i.id: i for i in session.scalars(select(Institution).where(Institution.id.in_({p.institution_id for p in places.values()})))}
    out = []
    for entry in pending:
        place = places[entry.place_id]
        if any(_overlap(entry, other) and other.user_id != entry.user_id for other in told):
            continue  # someone ahead was just told: their head start
        # Free from the current slot on, if the start has passed: that is
        # what can still be booked (app/bookings.py check_times).
        free_from = max(entry.starts_at, floor_to_slot(now))
        if session.scalar(select(_taken(place, free_from, entry.ends_at, now))):
            continue
        entry.notified_at = now
        told.append(entry)
        institution = institutions[place.institution_id]
        zone = ZoneInfo(institution.timezone)
        span = f"{free_from.astimezone(zone):%H:%M}–{entry.ends_at.astimezone(zone):%H:%M}"
        out.append(Freed(entry.user_id, Notice(
            "החדר התפנה",
            f"{place.name}, {free_from.astimezone(zone):%d.%m} {span}. מי שמזמין ראשון מקבל.",
            f"/{institution.slug}/spaces/{place.id}",
        )))
    session.flush()
    return out


def next_due(session: Session, now: datetime) -> datetime | None:
    """When a waiting request may free without anyone acting: a booking in
    its way turns into a no-show, or a head start ends."""
    waiting = and_(WaitlistEntry.notified_at.is_(None), _still_useful(now))
    no_show = session.scalar(
        select(func.min(Booking.starts_at + NO_SHOW_AFTER)).where(
            Booking.status == BookingStatus.BOOKED,
            Booking.starts_at + NO_SHOW_AFTER > now,
            exists().where(
                waiting,
                WaitlistEntry.place_id == Booking.place_id,
                Booking.seat_id.is_(None),
                WaitlistEntry.starts_at < Booking.ends_at,
                WaitlistEntry.ends_at > Booking.starts_at,
            ),
        )
    )
    head_start = None
    if session.scalar(select(exists().where(waiting))):
        head_start = session.scalar(
            select(func.min(WaitlistEntry.notified_at + HEAD_START)).where(WaitlistEntry.notified_at + HEAD_START > now)
        )
    times = [t for t in (no_show, head_start) if t is not None]
    return min(times) if times else None


def delete_past(session: Session, now: datetime) -> int:
    """Requests with too little of their time left."""
    return session.execute(delete(WaitlistEntry).where(~_still_useful(now))).rowcount

