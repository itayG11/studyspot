"""Running a write action: one SAVEPOINT, refusals become HTTP errors."""

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session

from app.errors import EXCLUSION_VIOLATION, Refusal, sqlstate

# Unique indexes that two simultaneous requests can race on. Losing such a
# race is a normal 409, not a server error.
RACE_CONSTRAINTS = {
    "uq_check_ins_one_active_per_user",
    "uq_check_ins_one_active_per_seat",
    "uq_check_ins_booking_id",
}
DEADLOCK_DETECTED = "40P01"  # PostgreSQL error code


def _constraint(error: IntegrityError) -> str | None:
    diag = getattr(error.orig, "diag", None)
    return getattr(diag, "constraint_name", None)



def run_action(session: Session, action):
    """Run one write action atomically, turning refusals into HTTP errors.

    The action runs inside a SAVEPOINT, so a refusal undoes all of its
    writes, and only a successful action is committed.
    """
    try:
        with session.begin_nested():
            result = action()
    except Refusal as error:
        raise HTTPException(error.status, error.code) from None
    except IntegrityError as error:
        # The database caught a race the code did not: two bookings for the
        # same time (EXCLUDE), or one student acting twice in the same instant.
        # Any other constraint means a bug: let it surface as a 500.
        if sqlstate(error) == EXCLUSION_VIOLATION:
            raise HTTPException(409, "slot_taken") from None
        if _constraint(error) not in RACE_CONSTRAINTS:
            raise
        raise HTTPException(409, "concurrent_request") from None
    except OperationalError as error:
        if sqlstate(error) != DEADLOCK_DETECTED:
            raise
        raise HTTPException(409, "concurrent_request") from None
    session.commit()
    return result
