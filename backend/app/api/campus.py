"""Read-only campus endpoints. Open to everyone: they show only places and
numbers, never who is where."""

from collections.abc import Sequence
from datetime import datetime
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_session
from app.bookings import MIN_WALK_IN, holding
from app.hours import place_status
from app.clock import get_now
from app.hours import opening_status
from app.models import (
    Booking,
    Building,
    Institution,
    Place,
    PlaceKind,
    is_bookable,
    is_counted,
)
from app.occupancy import occupied_by_place, occupied_seat_ids, open_all_day_place_ids
from app.schemas import BuildingOut, OpeningHoursOut, PlaceDetail, PlaceOut, SeatOut

router = APIRouter(tags=["campus"])

SessionDep = Annotated[Session, Depends(get_session)]
NowDep = Annotated[datetime, Depends(get_now)]
Slug = Annotated[str, Path(max_length=64, pattern=r"^[a-z0-9-]+$")]


def _institution(session: Session, slug: str) -> Institution:
    institution = session.scalars(select(Institution).where(Institution.slug == slug)).first()
    if institution is None:
        raise HTTPException(404, "institution_not_found")
    return institution


def _place_views(
    session: Session,
    institution: Institution,
    places: Sequence[Place],
    now: datetime,
    all_day: set[int] | None = None,
) -> list[PlaceOut]:
    local_now = now.astimezone(ZoneInfo(institution.timezone))
    if all_day is None:
        all_day = open_all_day_place_ids(session, institution.id, local_now.date())
    occupied = occupied_by_place(session, [p.id for p in places], now)
    views = []
    for place in places:
        taken = occupied.get(place.id, 0)
        views.append(
            PlaceOut(
                id=place.id,
                building_code=place.building.code,
                kind=place.kind,
                name=place.name,
                floor=place.floor,
                location_note=place.location_note,
                capacity=place.capacity,
                occupied=taken,
                available=max(place.capacity - taken, 0),
                is_open=opening_status(place.opening_hours, local_now, place.id in all_day).is_open,
                bookable=is_bookable(place.kind),
                counted=is_counted(place.kind),
            )
        )
    return views


def _seat_map(session: Session, place: Place, now: datetime) -> list[SeatOut]:
    """Each seat: taken now? free now? free until when (next booking or closing)?

    "Free now" means a walk-in would be accepted, so it uses the same rule
    as check-in: at least MIN_WALK_IN before the next booking or closing.
    """
    status = place_status(session, place, now)
    taken = occupied_seat_ids(session, place.id, now)
    held_now: set[int] = set()
    next_start: dict[int, datetime] = {}
    for seat_id, starts_at in session.execute(
        select(Booking.seat_id, Booking.starts_at).where(
            Booking.place_id == place.id, holding(now), Booking.ends_at > now
        )
    ):
        if starts_at <= now:
            held_now.add(seat_id)
        elif seat_id not in next_start or starts_at < next_start[seat_id]:
            next_start[seat_id] = starts_at
    seats = []
    for s in place.seats:
        limits = [t for t in (next_start.get(s.id), status.closes_at) if t is not None]
        until = min(limits) if limits else None
        free_now = (
            status.is_open
            and s.id not in taken
            and s.id not in held_now
            and (until is None or until - now >= MIN_WALK_IN)
        )
        seats.append(
            SeatOut(
                id=s.id, row=s.row, col=s.col, label=s.label,
                occupied=s.id in taken,
                free_now=free_now,
                free_until=until if free_now else None,
            )
        )
    return seats


def _places_query():
    return select(Place).join(Place.building).options(
        selectinload(Place.opening_hours), selectinload(Place.building)
    )


@router.get("/institutions/{slug}/buildings", response_model=list[BuildingOut])
def list_buildings(slug: Slug, session: SessionDep, now: NowDep):
    institution = _institution(session, slug)
    places = session.scalars(
        _places_query().where(Place.institution_id == institution.id)
    ).all()
    # The map shows seats a student can walk into right now: open places,
    # without group rooms (those are booked, not walked into).
    walk_in = [
        view
        for view in _place_views(session, institution, places, now)
        if view.is_open and view.kind != PlaceKind.GROUP_ROOM
    ]
    result = []
    for building in institution.buildings:
        own = [p for p in places if p.building_id == building.id]
        open_here = [v for v in walk_in if v.building_code == building.code]
        capacity = sum(v.capacity for v in open_here)
        taken = sum(v.occupied for v in open_here)
        result.append(
            BuildingOut(
                id=building.id,
                code=building.code,
                name=building.name,
                status=building.status,
                floors_count=building.floors_count,
                latitude=building.latitude,
                longitude=building.longitude,
                places_count=len(own),
                capacity=capacity,
                occupied=taken,
                available=max(capacity - taken, 0),
            )
        )
    return result


@router.get("/institutions/{slug}/places", response_model=list[PlaceOut])
def list_places(
    slug: Slug,
    session: SessionDep,
    now: NowDep,
    building: Annotated[str | None, Query(max_length=16)] = None,
    kind: PlaceKind | None = None,
):
    institution = _institution(session, slug)
    query = _places_query().where(Place.institution_id == institution.id)
    if building is not None:
        query = query.where(Building.code == building)
    if kind is not None:
        query = query.where(Place.kind == kind)
    places = session.scalars(query.order_by(Building.id, Place.id)).all()
    return _place_views(session, institution, places, now)


@router.get("/places/{place_id}", response_model=PlaceDetail)
def get_place(place_id: Annotated[int, Path(gt=0)], session: SessionDep, now: NowDep):
    place = session.scalars(
        _places_query().where(Place.id == place_id).options(selectinload(Place.seats))
    ).first()
    if place is None:
        raise HTTPException(404, "place_not_found")
    institution = session.get(Institution, place.institution_id)
    local_today = now.astimezone(ZoneInfo(institution.timezone)).date()
    all_day = open_all_day_place_ids(session, institution.id, local_today)
    view = _place_views(session, institution, [place], now, all_day)[0]
    seats = None
    if place.kind == PlaceKind.COMPUTER_LAB:
        seats = _seat_map(session, place, now)
    return PlaceDetail(
        **view.model_dump(),
        opening_hours=[OpeningHoursOut.model_validate(h) for h in place.opening_hours],
        open_all_day_today=place.id in all_day,
        lab_rows=place.lab_rows,
        lab_cols=place.lab_cols,
        seats=seats,
    )
