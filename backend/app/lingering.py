"""Rooms and seats whose time just ran out and may still be taken (wave 19).

Nothing here can see the chair. When a stay ends by the clock (the time ran
out) rather than by the student leaving (checking out, or moving to another
place), the next person may find someone still sitting there. For the
institution's grace minutes after the end, such a room or seat is shown as
"maybe still taken". That is all it does: free_now does not change, no
booking is blocked, and the database's booking rules are not touched.

Only rooms and lab seats are looked at: they are the places only one
booking can hold. An open area or a library counts people against a
capacity, and "maybe" means nothing there.
"""

from collections.abc import Iterable
from datetime import datetime, timedelta

from sqlalchemy import ColumnElement, and_, func, or_, select
from sqlalchemy.orm import Session

from app.models import CheckIn, CheckInEndReason


def _ended_by_the_clock(now: datetime, grace: timedelta) -> ColumnElement[bool]:
    """A stay whose time ran out within the last `grace`: closed by the sweep
    as EXPIRED, or not closed yet (ended_at empty, expires_at already past).
    A made-up student of the demo campus (app/seed/live.py) never counts."""
    end = func.coalesce(CheckIn.ended_at, CheckIn.expires_at)
    return and_(
        ~CheckIn.simulated,
        or_(CheckIn.end_reason == CheckInEndReason.EXPIRED, CheckIn.ended_at.is_(None)),
        end <= now,
        end > now - grace,
    )


def lingering_room_ids(session: Session, place_ids: Iterable[int], now: datetime, grace_minutes: int) -> set[int]:
    """Of these places, the ones with such a stay. Pass group rooms."""
    ids = list(place_ids)
    if not ids or grace_minutes <= 0:
        return set()
    grace = timedelta(minutes=grace_minutes)
    return set(
        session.scalars(
            select(CheckIn.place_id).where(CheckIn.place_id.in_(ids), _ended_by_the_clock(now, grace)).distinct()
        )
    )


def lingering_seat_ids(session: Session, place_id: int, now: datetime, grace_minutes: int) -> set[int]:
    """Of this lab's seats, the ones with such a stay."""
    if grace_minutes <= 0:
        return set()
    grace = timedelta(minutes=grace_minutes)
    return set(
        session.scalars(
            select(CheckIn.seat_id).where(
                CheckIn.place_id == place_id, CheckIn.seat_id.is_not(None), _ended_by_the_clock(now, grace)
            ).distinct()
        )
    )
