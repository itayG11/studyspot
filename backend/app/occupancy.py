"""Live occupancy, computed from active check-ins.

A check-in is active while it has not ended and has not expired yet.
Expired rows may still have ended_at empty (they are closed lazily), so
every count filters on expires_at too.
"""

from collections.abc import Iterable
from datetime import date, datetime, timedelta

from sqlalchemy import ColumnElement, and_, func, select
from sqlalchemy.orm import Session

from app.models import CheckIn, SpecialPeriod, SpecialPeriodPlace


def is_active(now: datetime) -> ColumnElement[bool]:
    return and_(CheckIn.ended_at.is_(None), CheckIn.expires_at > now)


def occupied_by_place(session: Session, place_ids: Iterable[int], now: datetime) -> dict[int, int]:
    ids = list(place_ids)
    if not ids:
        return {}
    rows = session.execute(
        select(CheckIn.place_id, func.count())
        .where(CheckIn.place_id.in_(ids), is_active(now))
        .group_by(CheckIn.place_id)
    ).all()
    return {place_id: count for place_id, count in rows}


def occupied_seat_ids(session: Session, place_id: int, now: datetime) -> set[int]:
    return set(
        session.scalars(
            select(CheckIn.seat_id).where(
                CheckIn.place_id == place_id, CheckIn.seat_id.is_not(None), is_active(now)
            )
        )
    )


def open_all_day_place_ids(session: Session, institution_id: int, today: date) -> set[int]:
    """Places that a special period covering today keeps open around the clock."""
    return set(
        session.scalars(
            select(SpecialPeriodPlace.place_id)
            .join(SpecialPeriodPlace.period)
            .where(
                SpecialPeriod.institution_id == institution_id,
                SpecialPeriod.starts_on <= today,
                SpecialPeriod.ends_on >= today,
            )
        )
    )


# A printed code is the same for everyone, so a photo of it works from home.
# Far more people checking in over an hour than the place could seat is what
# that looks like. Only a hint for the admin, who may replace the code.
SHARED_WINDOW = timedelta(hours=1)
SHARED_FACTOR = 2  # more than this many times the seats...
SHARED_MINIMUM = 6  # ...and never fewer people than this


def shared_sign_suspects(session: Session, places: Iterable[tuple[int, int]], now: datetime) -> set[int]:
    """Of (place id, capacity) pairs, the ids where more distinct real people
    started a check-in in the last hour than SHARED_FACTOR times the capacity
    (and at least SHARED_MINIMUM). The made-up check-ins of the demo campus
    (app/seed/live.py) do not count."""
    capacity = dict(places)
    if not capacity:
        return set()
    rows = session.execute(
        select(CheckIn.place_id, func.count(func.distinct(CheckIn.user_id)))
        .where(
            CheckIn.place_id.in_(list(capacity)),
            CheckIn.started_at > now - SHARED_WINDOW,
            CheckIn.started_at <= now,
            CheckIn.simulated.is_(False),
        )
        .group_by(CheckIn.place_id)
    ).all()
    return {
        place_id for place_id, people in rows if people >= SHARED_MINIMUM and people > SHARED_FACTOR * capacity[place_id]
    }
