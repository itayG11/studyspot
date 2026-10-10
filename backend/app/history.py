"""Occupancy history: how many people were in each place, every quarter
hour, kept as plain counts (models/history.py). The load forecast is an
average of them (app/forecast.py).

The sweep calls record_history. It counts from the check-ins' own start and
end times, not from what is in a place at the moment it runs, so a quiet
spell with no sweeps loses nothing: the next sweep fills it in."""

from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, select, text
from sqlalchemy.orm import Session

from app.models import ACTIVE_STATUSES, Booking, CheckIn, Institution

SLOT = timedelta(minutes=15)
# The forecast reads eight weeks: older quarter hours are not counted again.
MAX_BACKFILL = timedelta(weeks=8)
# Check-ins and bookings say who was where. Kept for this long after they
# end, then only the counts stay.
KEEP_CHECK_INS = timedelta(days=90)

_EPOCH = datetime(2000, 1, 1, tzinfo=UTC)

# One row per place and quarter hour, for the stays that overlap it. A
# quarter hour with no one has no row: the forecast reads that as 0.
_COUNT = text("""
    INSERT INTO occupancy_history (place_id, slot_start, people, simulated)
    SELECT c.place_id, slot.start, count(*), false
    FROM generate_series(CAST(:first AS timestamptz), CAST(:last AS timestamptz), interval '15 minutes')
        AS slot(start)
    JOIN check_ins c
        ON c.institution_id = :institution_id
        AND c.started_at < slot.start + interval '15 minutes'
        -- No stay is longer than a day: older check-ins cannot overlap.
        AND c.started_at > CAST(:first AS timestamptz) - interval '1 day'
        AND coalesce(c.ended_at, c.expires_at) > slot.start
    GROUP BY c.place_id, slot.start
    ON CONFLICT (place_id, slot_start) DO UPDATE SET people = excluded.people, simulated = false
""")


def slot_floor(moment: datetime) -> datetime:
    """The start of the quarter hour it falls in. In UTC, which matches local
    quarter hours in every zone offset by whole or half hours."""
    return _EPOCH + (moment - _EPOCH) // SLOT * SLOT


def record_history(session: Session, now: datetime) -> None:
    end = slot_floor(now)  # quarter hours before this one have ended
    # Locked, skipping one another process is already counting. NO KEY
    # UPDATE: new rows that point at the institution (a user's first sign-in)
    # do not wait for it.
    rows = select(Institution).with_for_update(skip_locked=True, key_share=True)
    for institution in session.scalars(rows):
        start = institution.history_until
        if start is None:
            first = session.scalar(select(func.min(CheckIn.started_at)).where(CheckIn.institution_id == institution.id))
            start = slot_floor(first) if first else end
        start = max(start, end - MAX_BACKFILL)
        if institution.counting_since is None:
            institution.counting_since = start
        if start < end:
            session.execute(_COUNT, {"first": start, "last": end - SLOT, "institution_id": institution.id})
            institution.history_until = end
        elif institution.history_until is None:
            institution.history_until = end
    session.flush()


def delete_old_check_ins(session: Session, now: datetime) -> int:
    """Ended check-ins and bookings older than KEEP_CHECK_INS. Their counts
    stay. Returns how many check-ins went."""
    check_ins = session.execute(
        delete(CheckIn).where(
            CheckIn.ended_at.is_not(None), CheckIn.ended_at < now - KEEP_CHECK_INS
        )
    ).rowcount
    session.execute(
        delete(Booking).where(Booking.status.not_in(ACTIVE_STATUSES), Booking.ends_at < now - KEEP_CHECK_INS)
    )
    return check_ins
