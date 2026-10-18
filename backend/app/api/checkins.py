"""Check-in endpoints. All of them need a signed-in user."""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Response, status
from sqlalchemy.orm import Session

from app.api.actions import run_action
from app.api.deps import get_code_secret, get_session
from app.auth import get_current_user
from app.checkins import check_in, check_out, current_check_in, still_here
from app.clock import get_now
from app.models import CheckIn, User
from app.ratelimit import write_limit
from app.schemas import CheckInCreate, CheckInOut

router = APIRouter(tags=["check-ins"])

SessionDep = Annotated[Session, Depends(get_session)]
NowDep = Annotated[datetime, Depends(get_now)]
UserDep = Annotated[User, Depends(get_current_user)]


def _out(row: CheckIn, cut_short_by=None) -> CheckInOut:
    return CheckInOut(
        booking_id=row.booking_id,
        cut_short_by=cut_short_by,
        id=row.id,
        place_id=row.place_id,
        place_name=row.place.name,
        building_code=row.place.building.code,
        seat_id=row.seat_id,
        seat_label=row.seat.label if row.seat else None,
        started_at=row.started_at,
        expires_at=row.expires_at,
        ended_at=row.ended_at,
        end_reason=row.end_reason,
        can_extend=row.booking_id is None and row.still_here_at is None and row.ended_at is None,
    )


@router.post(
    "/check-ins",
    response_model=CheckInOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(write_limit)],
)
def create_check_in(
    body: CheckInCreate,
    response: Response,
    user: UserDep,
    session: SessionDep,
    now: NowDep,
    secret: Annotated[bytes, Depends(get_code_secret)],
):
    result = run_action(session, lambda: check_in(session, user, body.code, body.seat_id, now, secret))
    if not result.created:
        response.status_code = status.HTTP_200_OK
    return _out(result.check_in, result.cut_short_by)


@router.get("/me/check-in", response_model=CheckInOut | None)
def get_my_check_in(user: UserDep, session: SessionDep, now: NowDep):
    """The current check-in, or null. Not being checked in is the usual
    state, not an error (wave 7.4)."""
    row = current_check_in(session, user, now)
    return None if row is None else _out(row)


@router.post(
    "/check-ins/{check_in_id}/checkout",
    response_model=CheckInOut,
    dependencies=[Depends(write_limit)],
)
def check_out_endpoint(
    check_in_id: Annotated[int, Path(gt=0)], user: UserDep, session: SessionDep, now: NowDep
):
    return _out(run_action(session, lambda: check_out(session, user, check_in_id, now)))


@router.post(
    "/check-ins/{check_in_id}/still-here",
    response_model=CheckInOut,
    dependencies=[Depends(write_limit)],
)
def still_here_endpoint(
    check_in_id: Annotated[int, Path(gt=0)], user: UserDep, session: SessionDep, now: NowDep
):
    return _out(run_action(session, lambda: still_here(session, user, check_in_id, now)))
