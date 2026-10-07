"""Check-in and check-out rules.

Everything happens in the caller's transaction. The place's row is locked
(SELECT ... FOR UPDATE) first, so two students who scan the last free spot
at the same moment are handled one after the other: the second one sees
the first one's check-in and gets "place_full".
"""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import or_, select, update
from sqlalchemy.orm import Session, selectinload

from app.codes import InvalidCode, read_code
from app.hours import opening_status
from app.models import (
    CheckIn,
    CheckInEndReason,
    Institution,
    Place,
    PlaceKind,
    Seat,
    User,
    is_counted,
)
from app.occupancy import is_active, occupied_by_place, open_all_day_place_ids

CHECK_IN_DURATION = timedelta(hours=2)


class CheckInError(Exception):
    """A check-in or check-out was refused. `code` is a stable, machine-readable reason."""

    def __init__(self, status: int, code: str):
        super().__init__(code)
        self.status = status
        self.code = code


@dataclass(frozen=True)
class CheckInResult:
    check_in: CheckIn
    created: bool  # False when the student re-scanned the place they are already in


def check_in(
    session: Session,
    user: User,
    code: str,
    seat_id: int | None,
    now: datetime,
    secret: bytes,
) -> CheckInResult:
    place = _place_from_code(session, code, secret)
    if place.institution_id != user.institution_id:
        raise CheckInError(403, "other_institution")
    if place.kind == PlaceKind.GROUP_ROOM:
        # Group rooms are used through bookings (stage 4): scanning there
        # will confirm a booking instead of creating a walk-in check-in.
        raise CheckInError(409, "booking_required")

    closes_at = _closing_time_if_open(session, place, now)
    seat = _seat_for(session, place, seat_id)

    _close_expired(session, user, place, seat, now)
    current = session.scalars(
        select(CheckIn).where(CheckIn.user_id == user.id, CheckIn.ended_at.is_(None))
    ).first()
    if current is not None and current.place_id == place.id and current.seat_id == seat_id:
        return CheckInResult(current, created=False)

    if seat is not None and _seat_is_taken(session, seat, now):
        raise CheckInError(409, "seat_taken")
    if is_counted(place.kind):
        occupied = occupied_by_place(session, [place.id], now).get(place.id, 0)
        if current is not None and current.place_id == place.id:
            occupied -= 1  # the student is only moving within this place
        if occupied >= place.capacity:
            raise CheckInError(409, "place_full")

    if current is not None:
        current.ended_at = now
        current.end_reason = CheckInEndReason.MOVED
        session.flush()  # free the "one open check-in per user" slot first

    expires_at = now + CHECK_IN_DURATION
    if closes_at is not None:
        expires_at = min(expires_at, closes_at)
    row = CheckIn(
        institution_id=place.institution_id,
        user_id=user.id,
        place_id=place.id,
        seat_id=seat.id if seat else None,
        started_at=now,
        expires_at=expires_at,
    )
    session.add(row)
    session.flush()
    return CheckInResult(row, created=True)


def check_out(session: Session, user: User, check_in_id: int, now: datetime) -> CheckIn:
    """End the user's own open check-in.

    Someone else's check-in answers exactly like a missing one (404), so
    the API never reveals that it exists.
    """
    row = session.scalars(
        select(CheckIn)
        .where(CheckIn.id == check_in_id, CheckIn.user_id == user.id, CheckIn.ended_at.is_(None))
        .with_for_update()
    ).first()
    if row is None:
        raise CheckInError(404, "check_in_not_found")
    if row.expires_at <= now:
        row.ended_at, row.end_reason = row.expires_at, CheckInEndReason.EXPIRED
    else:
        row.ended_at, row.end_reason = now, CheckInEndReason.CHECKOUT
    session.flush()
    return row


def current_check_in(session: Session, user: User, now: datetime) -> CheckIn | None:
    return session.scalars(
        select(CheckIn).where(CheckIn.user_id == user.id, is_active(now))
    ).first()


# --- Steps of check_in() -------------------------------------------------------------


def _place_from_code(session: Session, code: str, secret: bytes) -> Place:
    try:
        claim = read_code(code, secret)
    except InvalidCode:
        raise CheckInError(400, "invalid_code") from None
    place = session.scalars(
        select(Place)
        .where(Place.id == claim.place_id)
        .options(selectinload(Place.opening_hours))
        .with_for_update(of=Place)
    ).first()
    # A revoked code (old version) is treated exactly like a forged one.
    if place is None or place.code_version != claim.version:
        raise CheckInError(400, "invalid_code")
    return place


def _closing_time_if_open(session: Session, place: Place, now: datetime) -> datetime | None:
    """Raise if the place is closed; otherwise return when it closes (None: open all day)."""
    timezone = session.scalar(
        select(Institution.timezone).where(Institution.id == place.institution_id)
    )
    local_now = now.astimezone(ZoneInfo(timezone))
    all_day = place.id in open_all_day_place_ids(session, place.institution_id, local_now.date())
    status = opening_status(place.opening_hours, local_now, all_day)
    if not status.is_open:
        raise CheckInError(409, "place_closed")
    return status.closes_at.astimezone(UTC) if status.closes_at else None


def _seat_for(session: Session, place: Place, seat_id: int | None) -> Seat | None:
    if place.kind != PlaceKind.COMPUTER_LAB:
        if seat_id is not None:
            raise CheckInError(400, "seat_not_in_place")
        return None
    if seat_id is None:
        raise CheckInError(400, "seat_required")
    seat = session.scalars(
        select(Seat).where(Seat.id == seat_id, Seat.place_id == place.id)
    ).first()
    if seat is None:
        raise CheckInError(400, "seat_not_in_place")
    return seat


def _seat_is_taken(session: Session, seat: Seat, now: datetime) -> bool:
    return (
        session.scalar(select(CheckIn.id).where(CheckIn.seat_id == seat.id, is_active(now)))
        is not None
    )


def _close_expired(session: Session, user: User, place: Place, seat: Seat | None, now: datetime):
    """Lazy release: mark expired open check-ins as ended, so the partial
    unique indexes stop counting them."""
    involved = [CheckIn.user_id == user.id, CheckIn.place_id == place.id]
    if seat is not None:
        involved.append(CheckIn.seat_id == seat.id)
    session.execute(
        update(CheckIn)
        .where(CheckIn.ended_at.is_(None), CheckIn.expires_at <= now, or_(*involved))
        .values(ended_at=CheckIn.expires_at, end_reason=CheckInEndReason.EXPIRED)
        .execution_options(synchronize_session="fetch")
    )
