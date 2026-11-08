"""Reporting that a booked place is taken (wave 19.2), and where else to go."""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Path
from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from app.api.actions import run_action
from app.api.campus import _place_views, _places_query, _seat_map
from app.api.deps import get_session
from app.auth import get_current_user
from app.between_classes import walk_minutes, walk_table
from app.bookings import holding
from app.clock import get_now
from app.models import Booking, Institution, Place, User
from app.policy import effective_grace
from app.ratelimit import report_limit, write_limit
from app.reports import report_occupied
from app.schemas import AlternativeOut, ReportOut

router = APIRouter(tags=["reports"])

SessionDep = Annotated[Session, Depends(get_session)]
NowDep = Annotated[datetime, Depends(get_now)]
UserDep = Annotated[User, Depends(get_current_user)]

MAX_ALTERNATIVES = 3
MAX_LABS_LOOKED_AT = 5  # nearest first; a seat map is read for each


@router.post(
    "/bookings/{booking_id}/report-occupied",
    response_model=ReportOut,
    dependencies=[Depends(write_limit), Depends(report_limit)],
)
def report_occupied_endpoint(booking_id: Annotated[int, Path(gt=0)], user: UserDep, session: SessionDep, now: NowDep):
    """Say that someone is in the booked room or seat; get somewhere else to go."""
    report = run_action(session, lambda: report_occupied(session, user, booking_id, now))
    booking = session.get(Booking, report.booking_id)
    return ReportOut(reported=True, alternatives=alternatives(session, booking, now))


def alternatives(session: Session, booking: Booking, now: datetime) -> list[AlternativeOut]:
    """Up to three places free for the whole booking, nearest first. A room: other rooms.
    A seat: other seats of the same lab first, then a seat in another lab. Never a place
    that may still be taken, or whose student is on a break."""
    institution = session.get(Institution, booking.institution_id)
    here = session.get(Place, booking.place_id)
    overlapping = and_(holding(now), Booking.ends_at > now, Booking.starts_at < booking.ends_at, Booking.id != booking.id)
    busy_rooms = set(
        session.scalars(select(Booking.place_id).where(overlapping, Booking.seat_id.is_(None), Booking.institution_id == institution.id))
    )
    busy_seats = set(
        session.scalars(select(Booking.seat_id).where(overlapping, Booking.seat_id.is_not(None), Booking.institution_id == institution.id))
    )
    places = session.scalars(
        _places_query().where(Place.institution_id == institution.id, Place.kind == here.kind, Place.id != here.id)
    ).all()
    views = {v.id: v for v in _place_views(session, institution, places, now)}
    by_id = {p.id: p for p in places}
    table = walk_table(session, institution)
    walk = {p.id: walk_minutes(here.building, p.building, table) for p in places}

    found: list[AlternativeOut] = []
    if booking.seat_id is None:
        open_now = sorted(
            (v for v in views.values() if v.free_now and v.id not in busy_rooms and not v.maybe_still_taken and v.on_break_until is None),
            key=lambda v: (walk[v.id], v.name),
        )
        for v in open_now[:MAX_ALTERNATIVES]:
            found.append(AlternativeOut(place_id=v.id, place_name=v.name, building_code=v.building_code, walk_minutes=walk[v.id]))
        return found

    mine = next(s for s in here.seats if s.id == booking.seat_id)
    nearby = sorted(
        (s for s in _seat_map(session, here, now, effective_grace(institution))
         if s.free_now and s.id != mine.id and s.id not in busy_seats and not s.maybe_still_taken and s.break_until is None),
        key=lambda s: (abs(s.row - mine.row) + abs(s.col - mine.col), s.row, s.col),
    )
    for s in nearby[:MAX_ALTERNATIVES]:
        found.append(AlternativeOut(
            place_id=here.id, place_name=here.name, building_code=here.building.code, walk_minutes=walk_minutes(here.building, here.building),
            seat_id=s.id, seat_label=s.label, free_until=s.free_until,
        ))
    for place_id in sorted((v.id for v in views.values() if v.is_open), key=lambda i: (walk[i], i))[:MAX_LABS_LOOKED_AT]:
        if len(found) >= MAX_ALTERNATIVES:
            break
        lab = by_id[place_id]
        free = [
            s for s in _seat_map(session, lab, now, effective_grace(institution))
            if s.free_now and s.id not in busy_seats and not s.maybe_still_taken and s.break_until is None
        ]
        if free:
            s = free[0]
            found.append(AlternativeOut(
                place_id=lab.id, place_name=lab.name, building_code=lab.building.code, walk_minutes=walk[lab.id],
                seat_id=s.id, seat_label=s.label, free_until=s.free_until,
            ))
    return found

