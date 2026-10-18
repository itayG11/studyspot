"""Booking endpoints. Creating, listing, cancelling and renewing need a
signed-in user; availability is public and never says who booked."""

from datetime import date, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status
from sqlalchemy.orm import Session

from app.api.actions import run_action
from app.api.deps import get_session
from app.auth import get_current_user
from app.bookings import busy_ranges, cancel_booking, create_booking, extend_booking, upcoming_bookings
from app.clock import get_now
from app.models import Booking, Place, User
from app.ratelimit import write_limit
from app.schemas import Availability, BookingCreate, BookingOut, BusyRange

router = APIRouter(tags=["bookings"])

SessionDep = Annotated[Session, Depends(get_session)]
NowDep = Annotated[datetime, Depends(get_now)]
UserDep = Annotated[User, Depends(get_current_user)]
BookingId = Annotated[int, Path(gt=0)]


def _out(row: Booking) -> BookingOut:
    return BookingOut(
        id=row.id,
        place_id=row.place_id,
        place_name=row.place.name,
        building_code=row.place.building.code,
        seat_id=row.seat_id,
        seat_label=row.seat.label if row.seat else None,
        starts_at=row.starts_at,
        ends_at=row.ends_at,
        status=row.status,
        source=row.source,
    )


@router.post(
    "/bookings",
    response_model=BookingOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(write_limit)],
)
def create(body: BookingCreate, user: UserDep, session: SessionDep, now: NowDep):
    booking = run_action(
        session,
        lambda: create_booking(
            session, user, body.place_id, body.seat_id, body.starts_at, body.ends_at, now
        ),
    )
    return _out(booking)


@router.get("/me/bookings", response_model=list[BookingOut])
def my_bookings(user: UserDep, session: SessionDep, now: NowDep):
    return [_out(b) for b in upcoming_bookings(session, user, now)]


@router.post(
    "/bookings/{booking_id}/cancel", response_model=BookingOut, dependencies=[Depends(write_limit)]
)
def cancel(booking_id: BookingId, user: UserDep, session: SessionDep):
    return _out(run_action(session, lambda: cancel_booking(session, user, booking_id)))


@router.post(
    "/bookings/{booking_id}/extend", response_model=BookingOut, dependencies=[Depends(write_limit)]
)
def extend(booking_id: BookingId, user: UserDep, session: SessionDep, now: NowDep):
    return _out(run_action(session, lambda: extend_booking(session, user, booking_id, now)))


@router.get("/places/{place_id}/availability", response_model=Availability)
def availability(
    place_id: Annotated[int, Path(gt=0)],
    day: Annotated[date, Query(alias="date")],
    session: SessionDep,
    now: NowDep,
):
    place = session.get(Place, place_id)
    if place is None:
        raise HTTPException(404, "place_not_found")
    busy = [
        BusyRange(seat_id=b.seat_id, starts_at=b.starts_at, ends_at=b.ends_at)
        for b in busy_ranges(session, place, day, now)
    ]
    return Availability(place_id=place.id, date=day, busy=busy)
