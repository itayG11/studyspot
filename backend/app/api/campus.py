"""Read-only campus endpoints. Open to everyone: they show only places and
numbers, never who is where."""

from collections.abc import Sequence
from datetime import datetime
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app import bookings as rules
from app.api.deps import get_session
from app.bookings import MIN_WALK_IN, holding
from app.clock import get_now
from app.forecast import forecast
from app.hours import opening_status, place_status
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
from app.schemas import (
    BookingRules,
    BuildingOut,
    ForecastOut,
    InstitutionListItem,
    InstitutionOut,
    OpeningHoursOut,
    PlaceDetail,
    PlaceOut,
    SeatOut,
)

router = APIRouter(tags=["campus"])

SessionDep = Annotated[Session, Depends(get_session)]
NowDep = Annotated[datetime, Depends(get_now)]
Slug = Annotated[str, Path(max_length=64, pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$")]  # as slug_format


def _institution(session: Session, slug: str) -> Institution:
    institution = session.scalars(select(Institution).where(Institution.slug == slug)).first()
    if institution is None:
        raise HTTPException(404, "institution_not_found")
    return institution


@router.get("/institutions", response_model=list[InstitutionListItem])
def list_institutions(session: SessionDep):
    """The institutions a visitor can pick. One being set up stays hidden
    until its admin marks it active, but still opens by its address."""
    return session.scalars(
        select(Institution).where(Institution.is_active).order_by(Institution.name)
    ).all()


@router.get("/institutions/{slug}", response_model=InstitutionOut)
def get_institution(slug: Slug, session: SessionDep):
    institution = _institution(session, slug)
    return InstitutionOut(
        slug=institution.slug,
        name=institution.name,
        timezone=institution.timezone,
        booking_rules=BOOKING_RULES,
    )


def _minutes(delta) -> int:
    return int(delta.total_seconds() // 60)


BOOKING_RULES = BookingRules(
    slot_minutes=_minutes(rules.SLOT),
    max_minutes=_minutes(rules.MAX_DURATION),
    days_ahead=rules.HORIZON.days,
    horizon_minutes=_minutes(rules.HORIZON),
    max_upcoming=rules.MAX_UPCOMING,
    arrive_early_minutes=_minutes(rules.ARRIVE_EARLY),
    no_show_after_minutes=_minutes(rules.NO_SHOW_AFTER),
)


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
    rooms = [p.id for p in places if p.kind == PlaceKind.GROUP_ROOM]
    held_until = _room_held_until(session, rooms, now)
    views = []
    for place in places:
        taken = occupied.get(place.id, 0)
        is_open = opening_status(place.opening_hours, local_now, place.id in all_day).is_open
        free_now = free_from = frees_at = None
        if place.kind == PlaceKind.GROUP_ROOM:
            free_from = held_until.get(place.id) if is_open else None
            free_now = is_open and free_from is None
        elif is_open and taken >= place.capacity:
            frees_at = forecast(session, place, local_now.weekday(), now).frees_at
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
                is_open=is_open,
                bookable=is_bookable(place.kind),
                counted=is_counted(place.kind),
                atmosphere=place.atmosphere,
                suited_for=place.suited_for,
                amenities=sorted(a.amenity for a in place.amenities),
                details_are_demo=place.details_are_demo,
                free_now=free_now,
                free_from=free_from,
                usually_frees_at=frees_at,
            )
        )
    return views


def _room_held_until(session: Session, room_ids: list[int], now: datetime) -> dict[int, datetime]:
    """For each group room booked right now: when it frees up.

    Bookings that follow each other with no gap count as one stretch, so a
    room booked 10-11 and 11-12 frees up at 12, not at 11.
    """
    if not room_ids:
        return {}
    rows = session.execute(
        select(Booking.place_id, Booking.starts_at, Booking.ends_at)
        .where(
            Booking.place_id.in_(room_ids),
            Booking.seat_id.is_(None),
            holding(now),
            Booking.ends_at > now,
        )
        .order_by(Booking.place_id, Booking.starts_at)
    )
    held: dict[int, datetime] = {}
    for place_id, starts_at, ends_at in rows:
        until = held.get(place_id)
        if until is None and starts_at <= now:
            held[place_id] = ends_at  # held right now
        elif until is not None and starts_at <= until:
            held[place_id] = max(until, ends_at)  # continues with no gap
    return held


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
        selectinload(Place.opening_hours),
        selectinload(Place.building),
        selectinload(Place.amenities),
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


@router.get("/places/{place_id}/forecast", response_model=ForecastOut)
def get_forecast(
    place_id: Annotated[int, Path(gt=0)],
    session: SessionDep,
    now: NowDep,
    weekday: Annotated[int | None, Query(ge=0, le=6)] = None,
):
    """How busy the place usually is on a day of the week (today when not
    given), quarter hour by quarter hour. Public, like the place itself."""
    place = session.scalars(_places_query().where(Place.id == place_id)).first()
    if place is None:
        raise HTTPException(404, "place_not_found")
    if weekday is None:
        zone = ZoneInfo(session.get(Institution, place.institution_id).timezone)
        weekday = now.astimezone(zone).weekday()
    result = forecast(session, place, weekday, now)
    return ForecastOut(
        weekday=result.weekday, capacity=result.capacity, weeks=result.weeks, simulated=result.simulated,
        closed=result.closed, slots=[{"start": s.start, "people": s.people} for s in result.slots],
        frees_at=result.frees_at,
    )


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
        institution_slug=institution.slug,
        opening_hours=[OpeningHoursOut.model_validate(h) for h in place.opening_hours],
        open_all_day_today=place.id in all_day,
        lab_rows=place.lab_rows,
        lab_cols=place.lab_cols,
        seats=seats,
    )
