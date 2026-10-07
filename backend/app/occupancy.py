"""Live occupancy, computed from active check-ins.

A check-in is active while it has not ended and has not expired yet.
Expired rows may still have ended_at empty (they are closed lazily), so
every count filters on expires_at too.
"""

from collections.abc import Iterable
from datetime import date, datetime

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
