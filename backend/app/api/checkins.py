"""Check-in endpoints. All of them need a signed-in user."""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Response, status
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session

from app.api.deps import get_code_secret, get_session
from app.auth import get_current_user
from app.checkins import CheckInError, check_in, check_out, current_check_in
from app.clock import get_now
from app.models import CheckIn, User
from app.schemas import CheckInCreate, CheckInOut

router = APIRouter(tags=["check-ins"])

RACE_CONSTRAINTS = {"uq_check_ins_one_active_per_user", "uq_check_ins_one_active_per_seat"}
DEADLOCK_DETECTED = "40P01"  # PostgreSQL error code


def _constraint(error: IntegrityError) -> str | None:
    diag = getattr(error.orig, "diag", None)
    return getattr(diag, "constraint_name", None)

SessionDep = Annotated[Session, Depends(get_session)]
NowDep = Annotated[datetime, Depends(get_now)]
UserDep = Annotated[User, Depends(get_current_user)]


def _out(row: CheckIn) -> CheckInOut:
    return CheckInOut(
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
    )


def _run(session: Session, action):
    """Run one check-in action atomically, turning refusals into HTTP errors.

    The action runs inside a SAVEPOINT, so a refusal undoes all of its
    writes, and only a successful action is committed.
    """
    try:
        with session.begin_nested():
            result = action()
    except CheckInError as error:
        raise HTTPException(error.status, error.code) from None
    except IntegrityError as error:
        # The database caught a race the code did not, for example the
        # same student checking in at two places in the same instant.
        # Any other constraint means a bug: let it surface as a 500.
        if _constraint(error) not in RACE_CONSTRAINTS:
            raise
        raise HTTPException(409, "concurrent_check_in") from None
    except OperationalError as error:
        if getattr(error.orig, "sqlstate", None) != DEADLOCK_DETECTED:
            raise
        raise HTTPException(409, "concurrent_check_in") from None
    session.commit()
    return result


@router.post("/check-ins", response_model=CheckInOut, status_code=status.HTTP_201_CREATED)
def create_check_in(
    body: CheckInCreate,
    response: Response,
    user: UserDep,
    session: SessionDep,
    now: NowDep,
    secret: Annotated[bytes, Depends(get_code_secret)],
):
    result = _run(session, lambda: check_in(session, user, body.code, body.seat_id, now, secret))
    if not result.created:
        response.status_code = status.HTTP_200_OK
    return _out(result.check_in)


@router.get("/me/check-in", response_model=CheckInOut)
def get_my_check_in(user: UserDep, session: SessionDep, now: NowDep):
    row = current_check_in(session, user, now)
    if row is None:
        raise HTTPException(404, "no_active_check_in")
    return _out(row)


@router.post("/check-ins/{check_in_id}/checkout", response_model=CheckInOut)
def check_out_endpoint(
    check_in_id: Annotated[int, Path(gt=0)], user: UserDep, session: SessionDep, now: NowDep
):
    return _out(_run(session, lambda: check_out(session, user, check_in_id, now)))
