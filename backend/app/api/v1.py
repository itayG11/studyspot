"""The institutions' API, version 1 (wave 14.2): read-only, with a key.

Everything here is under /api/v1 and answers in its own schemas, apart
from the web app's: the site may change its answers at will, while a
version-1 answer only ever gains fields. A breaking change would be /v2.

Each key opens its own institution only. A place of another institution
is "not found", the same as a place that does not exist, so a key cannot
learn which ids belong to whom. No personal data is ever returned.
"""

from datetime import datetime, time
from decimal import Decimal
from functools import lru_cache
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from fastapi.openapi.utils import get_openapi
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import api_keys
from app.api import campus
from app.api.deps import get_session
from app.clock import get_now
from app.config import Settings, get_settings
from app.models import Building, Institution, Place, PlaceKind
from app.ratelimit import LIMITERS, SlidingWindow, _too_many, per_ip
from app.seed.live import is_simulated_campus

SessionDep = Annotated[Session, Depends(get_session)]
NowDep = Annotated[datetime, Depends(get_now)]

# Per address first, before the database: a flood of made-up keys from one
# address stops here. Then per key, so one institution's busy script cannot
# slow another's.
_per_address = per_ip("api-v1-address", limit=600, window_seconds=60, evict=True)
KEY_PER_MINUTE = 120
_per_key = LIMITERS.setdefault("api-v1-key", SlidingWindow(KEY_PER_MINUTE, 60, evict=True))
_bearer = HTTPBearer(auto_error=False, description="An institution's key: Authorization: Bearer ss_live_...")

router = APIRouter(prefix="/v1", tags=["v1"], dependencies=[Depends(_per_address)])


def _unauthorized(code: str) -> HTTPException:
    return HTTPException(401, code, headers={"WWW-Authenticate": "Bearer"})


def api_institution(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    db: SessionDep,
    now: NowDep,
    settings: Annotated[Settings, Depends(get_settings)],
) -> Institution:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise _unauthorized("api_key_missing")
    raw = credentials.credentials
    if len(raw) > 100:
        raise _unauthorized("api_key_invalid")
    row = api_keys.key_for(db, raw, now, api_keys.api_key_key(settings.jwt_secret_bytes()))
    if row is None:
        raise _unauthorized("api_key_invalid")
    if not _per_key.allow(f"key:{row.id}"):
        raise _too_many(_per_key)
    institution = db.get(Institution, row.institution_id)
    # A closing institution is hidden and its data is on its way out.
    if institution.closes_at is not None:
        raise HTTPException(403, "institution_closing")
    return institution


InstitutionDep = Annotated[Institution, Depends(api_institution)]


# --- version 1's own answers --------------------------------------------------------


class V1Institution(BaseModel):
    slug: str
    name: str
    timezone: str  # every time of day in the API is local to this zone
    buildings_count: int
    places_count: int
    live_simulated: bool  # the demo campus: the live numbers include made-up students


class V1Building(BaseModel):
    id: int
    code: str
    name: str | None
    latitude: Decimal | None
    longitude: Decimal | None
    places_count: int
    # Places a student can walk into right now: open, and not group rooms.
    capacity: int
    occupied: int
    available: int


class V1Place(BaseModel):
    id: int
    building_code: str
    kind: PlaceKind
    name: str
    floor: int
    capacity: int
    occupied: int
    available: int
    is_open: bool
    bookable: bool
    # Group rooms only: free right now, or held until when.
    free_now: bool | None
    free_from: datetime | None
    # Full now: the first quarter hour today that is usually not full.
    usually_frees_at: time | None


class V1Slot(BaseModel):
    start: time
    people: float


class V1Forecast(BaseModel):
    place_id: int
    weekday: int  # Monday is 0
    capacity: int
    weeks: int  # how many weeks of history the forecast is based on
    closed: bool
    slots: list[V1Slot]
    today: list[V1Slot]  # the weekday asked is today: today's quarter hours so far


def _place(view) -> V1Place:
    return V1Place(**{field: getattr(view, field) for field in V1Place.model_fields})


def _own_place(db: Session, institution: Institution, place_id: int) -> Place:
    place = db.scalars(campus._places_query().where(Place.id == place_id)).first()
    if place is None or place.institution_id != institution.id:
        raise HTTPException(404, "place_not_found")
    return place


# --- the endpoints ----------------------------------------------------------------------


@router.get("/institution", response_model=V1Institution)
def v1_institution(institution: InstitutionDep, db: SessionDep):
    buildings = db.scalar(select(func.count(Building.id)).where(Building.institution_id == institution.id))
    places = db.scalar(select(func.count(Place.id)).where(Place.institution_id == institution.id))
    return V1Institution(
        slug=institution.slug,
        name=institution.name,
        timezone=institution.timezone,
        buildings_count=buildings or 0,
        places_count=places or 0,
        live_simulated=is_simulated_campus(institution),
    )


@router.get("/buildings", response_model=list[V1Building])
def v1_buildings(institution: InstitutionDep, db: SessionDep, now: NowDep):
    views = campus.list_buildings(institution.slug, db, now)
    return [V1Building(**{field: getattr(view, field) for field in V1Building.model_fields}) for view in views]


@router.get("/places", response_model=list[V1Place])
def v1_places(
    institution: InstitutionDep,
    db: SessionDep,
    now: NowDep,
    building: Annotated[str | None, Query(max_length=16, description="A building's code, such as L")] = None,
    kind: PlaceKind | None = None,
):
    return [_place(view) for view in campus.list_places(institution.slug, db, now, building, kind)]


@router.get("/places/{place_id}", response_model=V1Place)
def v1_place(place_id: Annotated[int, Path(gt=0)], institution: InstitutionDep, db: SessionDep, now: NowDep):
    place = _own_place(db, institution, place_id)
    return _place(campus._place_views(db, institution, [place], now)[0])


@router.get("/places/{place_id}/forecast", response_model=V1Forecast)
def v1_forecast(
    place_id: Annotated[int, Path(gt=0)],
    institution: InstitutionDep,
    db: SessionDep,
    now: NowDep,
    weekday: Annotated[int | None, Query(ge=0, le=6, description="Monday is 0; today when not given")] = None,
):
    _own_place(db, institution, place_id)
    result = campus.get_forecast(place_id, db, now, weekday)
    return V1Forecast(
        place_id=place_id,
        weekday=result.weekday,
        capacity=result.capacity,
        weeks=result.weeks,
        closed=result.closed,
        slots=[V1Slot(start=s.start, people=s.people) for s in result.slots],
        today=[V1Slot(start=s.start, people=s.people) for s in result.today],
    )


# --- its documentation -------------------------------------------------------------------
# Public, and only of these endpoints: the site's own API (admin routes
# included) stays out of it, and its docs page stays off in production.


@lru_cache(maxsize=1)
def _schema() -> dict[str, Any]:
    return get_openapi(
        title="StudySpot API",
        version="1.0",
        description=(
            "Read an institution's buildings, places and live occupancy. "
            "Every request needs the institution's key: `Authorization: Bearer ss_live_...`. "
            f"{KEY_PER_MINUTE} requests a minute per key. No personal data is ever returned."
        ),
        routes=[route for route in router.routes if getattr(route, "include_in_schema", True)],
        servers=[{"url": "/api"}],
    )


@router.get("/openapi.json", include_in_schema=False)
def v1_openapi() -> dict[str, Any]:
    return _schema()
