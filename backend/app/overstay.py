"""What the institution reads of the reports (wave 19.3).

Places and times, never people. A report points at the booking of the one who
reported; here it is read only as a count by place, weekday and hour in the
institution's own time. A reporter whose reports the institution found empty
("nobody_there") three times in the last 30 days stops counting in the table
and in the advice, so a habit of false alarms cannot make a place look bad.
Their reports still show in the list: nothing is hidden from the institution.
"""

from collections import Counter
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Institution, OccupancyReport, Place, PlaceKind, ReportResolution, ReportStatus

DISCOUNT_AFTER = 3  # reports found empty, in DISCOUNT_WINDOW, and the reporter stops counting
DISCOUNT_WINDOW = timedelta(days=30)
ADVICE_AFTER = 3  # reports at one place within ADVICE_WINDOW make a suggestion
ADVICE_WINDOW = timedelta(days=7)
MAX_ROWS = 5000  # one request is bounded whatever is stored


def _counting(now: datetime):
    """Reports whose reporter has not cried wolf (see the top of this file)."""
    wolves = (
        select(OccupancyReport.reporter_id)
        .where(
            OccupancyReport.resolution == ReportResolution.NOBODY_THERE,
            OccupancyReport.resolved_at >= now - DISCOUNT_WINDOW,
        )
        .group_by(OccupancyReport.reporter_id)
        .having(func.count() >= DISCOUNT_AFTER)
    )
    return OccupancyReport.reporter_id.not_in(wolves)


def open_count(session: Session, institution: Institution) -> int:
    return session.scalar(
        select(func.count()).where(OccupancyReport.institution_id == institution.id, OccupancyReport.status == ReportStatus.OPEN)
    ) or 0


def heat(session: Session, institution: Institution, now: datetime, days: int) -> tuple[list[dict], list[dict]]:
    """(cells, advice): reports by place, weekday and hour, and the places with a pattern."""
    zone = ZoneInfo(institution.timezone)
    rows = session.execute(
        select(OccupancyReport.place_id, OccupancyReport.created_at, Place.name, Place.kind)
        .join(Place, Place.id == OccupancyReport.place_id)
        .where(
            OccupancyReport.institution_id == institution.id,
            OccupancyReport.created_at >= now - timedelta(days=days),
            _counting(now),
        )
        .order_by(OccupancyReport.created_at.desc())
        .limit(MAX_ROWS)
    ).all()
    cells: Counter[tuple[int, str, int, int]] = Counter()
    recent: Counter[tuple[int, str, PlaceKind]] = Counter()
    for place_id, created_at, name, kind in rows:
        local = created_at.astimezone(zone)
        cells[(place_id, name, local.weekday(), local.hour)] += 1
        if created_at >= now - ADVICE_WINDOW:
            recent[(place_id, name, kind)] += 1
    out_cells = [
        {"place_id": pid, "place_name": name, "weekday": weekday, "hour": hour, "count": count}
        for (pid, name, weekday, hour), count in sorted(cells.items(), key=lambda item: (item[0][1], item[0][2], item[0][3]))
    ]
    advice = [
        {
            "place_id": pid, "place_name": name, "count": count,
            "kind": "shorten_booking" if kind == PlaceKind.GROUP_ROOM else "add_sign",
        }
        for (pid, name, kind), count in recent.most_common()
        if count >= ADVICE_AFTER
    ]
    return out_cells, advice
