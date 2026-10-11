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

from sqlalchemy import delete, exists, func, select, update
from sqlalchemy.orm import Session, selectinload

from app.bookings import MIN_WALK_IN, holding
from app.config import get_settings
from app.history import slot_floor
from app.hours import place_status
from app.models import Booking, CheckIn, CheckInEndReason, Institution, Place, PlaceKind, User
from app.occupancy import is_active
from app.seed.demo import DEMO
from app.seed.history import FRIDAY, PEAK, _shape

SIMULATED_KINDS = (PlaceKind.OPEN_AREA, PlaceKind.LIBRARY, PlaceKind.COMPUTER_LAB)
# Each run moves a place by at most this share of its size (at least one).
STEP = 0.05
# A made-up stay lasts this long, unless the place closes or a booking starts first.
STAY = (timedelta(minutes=30), timedelta(minutes=120))
SHORTEST_STAY = timedelta(minutes=10)
# At most this many made-up students. The shared demo admin can add places
# of up to 1000 seats each; the pool, and the rows it writes, stay small.
MAX_POOL = 400


def is_simulated_campus(institution: Institution) -> bool:
    """The demo campus, while the demo sign-in is on and it has no real
    sign-in rules (approved or waiting)."""
    settings = get_settings()
    return (
        settings.demo_login_enabled
        and institution.slug == settings.demo_institution == DEMO["institution"]["slug"]
        and not institution.login_rules
    )


def simulate_live(session: Session, institution: Institution, now: datetime) -> None:
    if not is_simulated_campus(institution):
        _remove_all(session, institution)
        return
    # Stays whose time ran out end first: an open row still holds its
    # student and its seat (the partial unique indexes on check_ins).
    session.execute(
        update(CheckIn)
        .where(CheckIn.institution_id == institution.id, CheckIn.ended_at.is_(None), CheckIn.expires_at <= now)
        .values(ended_at=CheckIn.expires_at, end_reason=CheckInEndReason.EXPIRED)
        .execution_options(synchronize_session="fetch")
    )
    # The same row lock a real check-in takes (app/checkins.py), so the two
    # never count the same free spot. A place being checked into right now
    # is skipped until the next run.
    places = session.scalars(
        select(Place)
        .where(Place.institution_id == institution.id, Place.kind.in_(SIMULATED_KINDS))
        .options(selectinload(Place.seats), selectinload(Place.opening_hours))
        .order_by(Place.id)
        .with_for_update(of=Place, skip_locked=True)
    ).all()
    wanted = min(MAX_POOL, sum(_size(p) for p in places))
    free_users = _free_users(session, institution, wanted)
    zone = ZoneInfo(institution.timezone)
    for place in places:
        _move(session, place, now, zone, free_users)
    session.flush()
    _trim_pool(session, institution, wanted)


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
    seats, next_start = [], {}
    if place.kind == PlaceKind.COMPUTER_LAB:
        # One query for the lab's bookings, as the seat map does (api/campus.py).
        taken, held_now = {r.seat_id for r in rows}, set()
        for seat_id, starts_at in session.execute(
            select(Booking.seat_id, Booking.starts_at).where(
                Booking.place_id == place.id, holding(now), Booking.ends_at > now
            )
        ):
            if starts_at <= now:
                held_now.add(seat_id)
            elif seat_id not in next_start or starts_at < next_start[seat_id]:
                next_start[seat_id] = starts_at
        # Seats a real student could walk into now (the seat map's "free").
        seats = [
            s
            for s in place.seats
            if s.id not in taken
            and s.id not in held_now
            and _long_enough(now, next_start.get(s.id), status.closes_at)
        ]
        # One of them always stays free for a real student.
        target = min(target, len(simulated) + len(seats) - 1)
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
            if seat.id in next_start:
                until = min(until, next_start[seat.id])
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


def _long_enough(now: datetime, *limits: datetime | None) -> bool:
    """Free for at least a walk-in (MIN_WALK_IN) before the next booking or closing."""
    ends = [t for t in limits if t is not None]
    return not ends or min(ends) - now >= MIN_WALK_IN


def _end(rows: list[CheckIn], now: datetime) -> None:
    for row in rows:
        row.ended_at = now
        row.end_reason = CheckInEndReason.CHECKOUT


def _sitting():
    return exists().where(CheckIn.user_id == User.id, CheckIn.ended_at.is_(None))


def _trim_pool(session: Session, institution: Institution, wanted: int) -> None:
    """Spare made-up students not sitting anywhere go: the daily reset
    removes places a visitor added, and MAX_POOL may come down."""
    have = session.scalar(
        select(func.count()).select_from(User).where(User.institution_id == institution.id, User.simulated)
    )
    if have > wanted:
        spare = (
            select(User.id)
            .where(User.institution_id == institution.id, User.simulated, ~_sitting())
            .order_by(User.id.desc())
            .limit(have - wanted)
        )
        session.execute(delete(User).where(User.id.in_(spare)))


def _remove_all(session: Session, institution: Institution) -> None:
    """Not (or no longer) the simulated campus: its made-up students go, and
    their stays with them (ON DELETE CASCADE)."""
    if session.scalar(select(User.id).where(User.institution_id == institution.id, User.simulated).limit(1)) is None:
        return
    session.execute(delete(User).where(User.institution_id == institution.id, User.simulated))


def _free_users(session: Session, institution: Institution, wanted: int) -> list[User]:
    """The made-up students not sitting anywhere now: as many as the campus
    has places to sit, up to MAX_POOL. No identity, so no one can sign in as
    them."""
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
    return list(
        session.scalars(
            select(User).where(User.institution_id == institution.id, User.simulated, ~_sitting()).order_by(User.id.desc())
        )
    )
