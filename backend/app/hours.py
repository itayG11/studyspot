"""Is a place open right now, and when does it close today?"""

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime

from app.models import OpeningHours


@dataclass(frozen=True)
class OpeningStatus:
    is_open: bool
    # Local closing time today; None when open around the clock or closed.
    closes_at: datetime | None


def opening_status(
    hours: Iterable[OpeningHours], local_now: datetime, open_all_day: bool = False
) -> OpeningStatus:
    """local_now must be in the institution's timezone.

    open_all_day is True when a special period (for example exams) that
    includes this place covers today.
    """
    if open_all_day:
        return OpeningStatus(is_open=True, closes_at=None)
    today = next((h for h in hours if h.weekday == local_now.weekday()), None)
    if today is None:
        return OpeningStatus(is_open=False, closes_at=None)
    current = local_now.time()
    if today.opens <= current < today.closes:
        closes = datetime.combine(local_now.date(), today.closes, tzinfo=local_now.tzinfo)
        return OpeningStatus(is_open=True, closes_at=closes)
    return OpeningStatus(is_open=False, closes_at=None)


def institution_zone(session, institution_id: int):
    """The institution's timezone (opening hours are local times)."""
    from zoneinfo import ZoneInfo

    from sqlalchemy import select

    from app.models import Institution

    return ZoneInfo(
        session.scalar(select(Institution.timezone).where(Institution.id == institution_id))
    )


def place_status(session, place, moment: datetime) -> OpeningStatus:
    """Is the place open at `moment` (any timezone)? closes_at is returned in UTC.

    The one place that combines opening hours with special periods; booking
    rules, check-in and the seat map all use it.
    """
    from datetime import UTC

    from app.occupancy import open_all_day_place_ids

    local = moment.astimezone(institution_zone(session, place.institution_id))
    all_day = place.id in open_all_day_place_ids(session, place.institution_id, local.date())
    status = opening_status(place.opening_hours, local, all_day)
    closes = status.closes_at.astimezone(UTC) if status.closes_at else None
    return OpeningStatus(is_open=status.is_open, closes_at=closes)
