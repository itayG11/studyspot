"""Live occupancy for the demo campus: made-up students who come and go.

The demo campus has hardly any real visitors in its places, so its live
numbers would sit at "all free" all day. The background sweep calls
simulate_live once a minute (only while the site has visitors, like the
rest of the sweep). Each run moves every open place a few people towards
a target taken from the same made-up day as the simulated history
(app/seed/history.py), so the numbers on the site drift like a real
campus instead of jumping.

They are ordinary check-ins, marked simulated, of made-up students that
have no sign-in identity. So every count, the seat map and the
suggestions between classes see them with no extra code. Three rules keep
them out of the way:
- never full: a place keeps at least one free spot for a real student;
- a real student always wins: check-in ends a simulated stay to make room
  (app/checkins.py);
- never a seat someone booked, and never group rooms (judged by bookings).

Only the demo campus, and only while it has no real sign-in rules."""

import math
import random
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import exists, func, select, update
from sqlalchemy.orm import Session

from app.bookings import booking_covering, next_booking_start
from app.history import slot_floor
from app.hours import place_status
from app.models import CheckIn, CheckInEndReason, Institution, Place, PlaceKind, User
from app.occupancy import is_active
from app.seed.demo import DEMO
from app.seed.history import FRIDAY, PEAK, _shape

SIMULATED_KINDS = (PlaceKind.OPEN_AREA, PlaceKind.LIBRARY, PlaceKind.COMPUTER_LAB)
# Each run moves a place by at most this share of its size (at least one).
STEP = 0.05
# A made-up stay lasts this long, unless the place closes or a booking starts first.
STAY = (timedelta(minutes=30), timedelta(minutes=120))
SHORTEST_STAY = timedelta(minutes=10)


def is_simulated_campus(institution: Institution) -> bool:
    return institution.slug == DEMO["institution"]["slug"] and not institution.login_rules


def simulate_live(session: Session, institution: Institution, now: datetime) -> None:
    if not is_simulated_campus(institution):
        return
    # Stays whose time ran out end first: an open row still holds its
    # student and its seat (the partial unique indexes on check_ins).
    session.execute(
        update(CheckIn)
        .where(CheckIn.institution_id == institution.id, CheckIn.ended_at.is_(None), CheckIn.expires_at <= now)
        .values(ended_at=CheckIn.expires_at, end_reason=CheckInEndReason.EXPIRED)
        .execution_options(synchronize_session="fetch")
    )
    places = session.scalars(
        select(Place).where(Place.institution_id == institution.id, Place.kind.in_(SIMULATED_KINDS))
    ).all()
    free_users = _free_users(session, institution, sum(_size(p) for p in places), now)
    zone = ZoneInfo(institution.timezone)
    for place in places:
        _move(session, place, now, zone, free_users)
    session.flush()


def _size(place: Place) -> int:
    return len(place.seats) if place.kind == PlaceKind.COMPUTER_LAB else place.capacity


def _move(session: Session, place: Place, now: datetime, zone: ZoneInfo, free_users: list[User]) -> None:
    rows = session.scalars(select(CheckIn).where(CheckIn.place_id == place.id, is_active(now))).all()
    simulated = sorted((r for r in rows if r.simulated), key=lambda r: (r.started_at, r.id))
    status = place_status(session, place, now)
    if not status.is_open:
        _end(simulated, now)
        return

    local = now.astimezone(zone)
    noise = random.Random(f"live/{place.id}/{slot_floor(now).isoformat()}").uniform(0.85, 1.1)
    day_scale = 0.4 if local.weekday() == FRIDAY else 1.0
    size = _size(place)
    target = round(size * PEAK[place.kind] * _shape(local.hour + local.minute / 60) * day_scale * noise)
    real = len(rows) - len(simulated)
    seats = []
    if place.kind == PlaceKind.COMPUTER_LAB:
        taken = {r.seat_id for r in rows}
        seats = [s for s in place.seats if s.id not in taken and booking_covering(session, place, s.id, now, now) is None]
        # Seats held for a booking right now count as taken too.
        held = size - len(taken) - len(seats)
        target = min(target, size - real - held - 1)
    else:
        target = min(target, size - real - 1)  # never full: room for a real student
    target = max(target, 0)

    step = max(1, math.ceil(size * STEP))
    if len(simulated) > target:
        _end(simulated[: min(step, len(simulated) - target)], now)
        return
    rng = random.Random(f"live/{place.id}/{now.isoformat()}")
    for _ in range(min(step, target - len(simulated))):
        if not free_users:
            return
        seat = None
        until = now + rng.uniform(STAY[0].total_seconds(), STAY[1].total_seconds()) * timedelta(seconds=1)
        if status.closes_at is not None:
            until = min(until, status.closes_at)
        if seats:
            seat = seats.pop(rng.randrange(len(seats)))
            following = next_booking_start(session, place, seat.id, now, now)
            if following is not None:
                until = min(until, following)
        elif place.kind == PlaceKind.COMPUTER_LAB:
            return
        if until - now < SHORTEST_STAY:
            continue
        user = free_users.pop()
        session.add(
            CheckIn(
                institution_id=place.institution_id,
                user_id=user.id,
                place_id=place.id,
                seat_id=seat.id if seat else None,
                started_at=now,
                expires_at=until,
                simulated=True,
            )
        )


def _end(rows: list[CheckIn], now: datetime) -> None:
    for row in rows:
        row.ended_at = now
        row.end_reason = CheckInEndReason.CHECKOUT


def _free_users(session: Session, institution: Institution, wanted: int, now: datetime) -> list[User]:
    """The made-up students not sitting anywhere now. Made once, as many as
    the campus has places to sit; no identity, so no one can sign in as them."""
    have = session.scalar(
        select(func.count()).select_from(User).where(User.institution_id == institution.id, User.simulated)
    )
    for n in range(have, wanted):
        session.add(
            User(
                institution_id=institution.id,
                email=f"simulated-{n + 1}@demo.invalid",
                display_name="סטודנט מדומה",
                simulated=True,
            )
        )
    session.flush()
    sitting = exists().where(CheckIn.user_id == User.id, CheckIn.ended_at.is_(None))
    return list(
        session.scalars(
            select(User).where(User.institution_id == institution.id, User.simulated, ~sitting).order_by(User.id.desc())
        )
    )
