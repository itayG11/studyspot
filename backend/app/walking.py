"""Real walking times between buildings (wave 9), from OpenRouteService.

The map estimate (app/between_classes.py) is a straight line times a
detour factor; it knows nothing of stairs, hills or fences. A routing
service does. Its free plan allows 500 matrix requests a day and 40 a
minute, at most 3,500 building pairs in one request (openrouteservice.org/
plans, /restrictions). So:

- one request per campus holds every pair of its buildings at once;
- it is sent only when the buildings' places change. The background sweep
  compares a fingerprint of them with the one the stored times were fetched
  for, so every way a building moves (the form, the map, a table import, the
  demo reset) is covered without a hook in each;
- at most one request per campus every 15 minutes, whatever the outcome
  (96 a day at worst, even if a visitor drags the demo campus's buildings
  around all day), and at most 10 in one round of the sweep;
- a building that moved walks by the estimate until its new times arrive;
- the network call is made outside any database transaction, and the
  answer is kept only if the buildings did not move while it was asked.

No key, a failure, a pair with no route: no row, and the estimate is used.
Results are shown with the credit OpenRouteService asks for.
"""

import hashlib
import logging
import math
from collections.abc import Sequence
from datetime import datetime, timedelta

import httpx
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import Building, Institution, WalkTime

log = logging.getLogger(__name__)

MAX_BUILDINGS = 59  # 59 x 59 = 3,481 pairs: under the 3,500 a request may hold
RETRY_AFTER = timedelta(minutes=15)  # between two requests for one campus
MAX_PER_ROUND = 10
LONGEST_SECONDS = 3 * 60 * 60  # a longer walk across one campus is a wrong answer


class OrsMatrix:
    """OpenRouteService's matrix API, on foot. The key goes in a header,
    never in the address, so it is not written to any log."""

    def __init__(self, http: httpx.Client, key: str, url: str):
        self.http, self.key, self.url = http, key, url

    def durations(self, locations: Sequence[tuple[float, float]]) -> list[list] | None:
        """Seconds from each location to each other, or None on any failure.
        Locations are (longitude, latitude), the order the API takes."""
        try:
            response = self.http.post(
                self.url,
                json={"locations": [list(p) for p in locations], "metrics": ["duration"]},
                headers={"Authorization": self.key},
                timeout=15,
            )
            response.raise_for_status()
            return response.json()["durations"]
        except (httpx.HTTPError, ValueError, KeyError, TypeError) as error:
            log.warning("walking times unavailable: %s", type(error).__name__)
            return None


_http: httpx.Client | None = None


def matrix_from_settings(settings) -> OrsMatrix | None:
    """None without ORS_API_KEY: then only the estimate is used."""
    global _http
    if settings.ors_api_key is None:
        return None
    if _http is None:
        _http = httpx.Client()
    return OrsMatrix(_http, settings.ors_api_key.get_secret_value(), settings.ors_matrix_url)


def placed_buildings(session: Session, institution: Institution) -> list[Building]:
    return list(session.scalars(
        select(Building)
        .where(Building.institution_id == institution.id, Building.latitude.is_not(None))
        .order_by(Building.id)
    ))


def fingerprint(placed: Sequence[Building]) -> str:
    text = ";".join(f"{b.id}:{b.latitude}:{b.longitude}" for b in placed)
    return hashlib.sha256(text.encode()).hexdigest()


def _minutes(seconds) -> int | None:
    if isinstance(seconds, bool) or not isinstance(seconds, (int, float)):
        return None  # null: no route between the two
    if not 0 <= seconds <= LONGEST_SECONDS:
        return None
    return max(1, math.ceil(seconds / 60))


def _replace(session: Session, institution: Institution, placed: Sequence[Building], durations, mark: str) -> None:
    ids = select(Building.id).where(Building.institution_id == institution.id)
    session.execute(delete(WalkTime).where(WalkTime.from_building_id.in_(ids)))
    for i, a in enumerate(placed):
        for j, b in enumerate(placed):
            minutes = _minutes(durations[i][j]) if durations is not None and i != j else None
            if minutes is not None:
                session.add(WalkTime(from_building_id=a.id, to_building_id=b.id, minutes=minutes))
    institution.walks_fingerprint = mark
    session.commit()


def _well_formed(durations, n: int) -> bool:
    return isinstance(durations, list) and len(durations) == n and all(
        isinstance(row, list) and len(row) == n for row in durations
    )


def refresh_walks(session: Session, matrix: OrsMatrix | None, now: datetime) -> None:
    """Fetch the walking times of every campus whose buildings moved since.
    Commits as it goes: the network call is made between transactions. One
    campus failing never stops the others."""
    if matrix is None:
        return
    asked = 0
    for institution_id in session.scalars(select(Institution.id).order_by(Institution.id)).all():
        if asked >= MAX_PER_ROUND:
            return  # the rest next round: the free plan allows 40 a minute
        try:
            asked += _refresh_one(session, matrix, institution_id, now)
        except Exception:
            session.rollback()
            log.exception("walking times of institution %s not refreshed", institution_id)


def _refresh_one(session: Session, matrix: OrsMatrix, institution_id: int, now: datetime) -> int:
    """1 if a request was sent."""
    institution = session.get(Institution, institution_id)
    if institution is None:
        return 0
    placed = placed_buildings(session, institution)
    mark = fingerprint(placed)
    if institution.walks_fingerprint == mark:
        return 0
    if not 2 <= len(placed) <= MAX_BUILDINGS:
        if len(placed) > MAX_BUILDINGS:
            log.warning("institution %s: %s buildings, too many for one walking matrix", institution.id, len(placed))
        _replace(session, institution, placed, None, mark)  # nothing to ask: the estimate
        return 0
    # The old times are for old places: the estimate until the new ones come.
    ids = select(Building.id).where(Building.institution_id == institution.id)
    session.execute(delete(WalkTime).where(WalkTime.from_building_id.in_(ids)))
    if institution.walks_tried_at is not None and now - institution.walks_tried_at < RETRY_AFTER:
        session.commit()
        return 0
    institution.walks_tried_at = now
    locations = [(float(b.longitude), float(b.latitude)) for b in placed]
    session.commit()  # no transaction is held while the service answers

    durations = matrix.durations(locations)
    if durations is None or not _well_formed(durations, len(placed)):
        return 1
    session.expire_all()  # read again: another process may have moved a building meanwhile
    institution = session.get(Institution, institution_id)
    if institution is None:
        return 1
    placed = placed_buildings(session, institution)
    if fingerprint(placed) != mark:
        return 1  # moved while asking: the next round asks again, after the wait
    _replace(session, institution, placed, durations, mark)
    return 1
