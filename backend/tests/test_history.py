"""How many people were in each place, every quarter hour: counted from the
check-ins, kept as plain numbers with no one's name (occupancy_history).
The sweep fills in every quarter hour that has ended, also after a quiet
spell with no sweeps, and deletes check-ins older than 90 days."""

from datetime import timedelta

from conftest import SUNDAY_10AM, place_named
from sqlalchemy import select

from app.history import KEEP_CHECK_INS, MAX_BACKFILL, record_history
from app.models import CheckIn, CheckInEndReason, Institution, OccupancyHistory, User
from app.sweeper import sweep

Q = timedelta(minutes=15)
NINE = SUNDAY_10AM - timedelta(hours=1)


def stay(session, user, place, start, end, ended=True):
    row = CheckIn(
        institution_id=user.institution_id, user_id=user.id, place_id=place.id,
        started_at=start, expires_at=end,
        ended_at=end if ended else None, end_reason=CheckInEndReason.CHECKOUT if ended else None,
    )
    session.add(row)
    session.flush()
    return row


def counts(session, place) -> dict:
    rows = session.scalars(select(OccupancyHistory).where(OccupancyHistory.place_id == place.id)).all()
    return {(r.slot_start - NINE) // Q: r.people for r in rows}


def other_student(session, braude, n=2) -> User:
    user = User(institution_id=braude.id, email=f"s{n}@braude.example", display_name=f"S{n}")
    session.add(user)
    session.flush()
    return user


def test_each_quarter_hour_counts_the_stays_that_overlap_it(session, braude, student):
    area = place_named(braude, "L", "מתחם לימוד")
    stay(session, student, area, NINE, NINE + timedelta(minutes=40))
    stay(session, other_student(session, braude), area, NINE + timedelta(minutes=20), SUNDAY_10AM)
    record_history(session, SUNDAY_10AM)
    # 9:00 only the first; 9:15 and 9:30 both; 9:45 only the second.
    assert counts(session, area) == {0: 1, 1: 2, 2: 2, 3: 1}


def test_a_quarter_hour_still_running_waits(session, braude, student):
    area = place_named(braude, "L", "מתחם לימוד")
    stay(session, student, area, NINE, SUNDAY_10AM, ended=False)
    record_history(session, NINE + timedelta(minutes=50))
    assert counts(session, area) == {0: 1, 1: 1, 2: 1}  # 9:45 is not over yet


def test_after_a_quiet_spell_it_fills_in_what_it_missed_once(session, braude, student):
    area = place_named(braude, "L", "מתחם לימוד")
    stay(session, student, area, NINE, SUNDAY_10AM)
    record_history(session, NINE + timedelta(minutes=20))
    record_history(session, SUNDAY_10AM + timedelta(hours=3))  # no sweep in between
    assert counts(session, area) == {0: 1, 1: 1, 2: 1, 3: 1}
    record_history(session, SUNDAY_10AM + timedelta(hours=3))
    assert counts(session, area) == {0: 1, 1: 1, 2: 1, 3: 1}


def test_it_goes_back_eight_weeks_at_most(session, braude, student):
    area = place_named(braude, "L", "מתחם לימוד")
    long_ago = SUNDAY_10AM - MAX_BACKFILL - timedelta(days=7)
    stay(session, student, area, long_ago, long_ago + Q)
    record_history(session, SUNDAY_10AM)
    assert counts(session, area) == {}


def test_a_real_count_replaces_a_simulated_one(session, braude, student):
    area = place_named(braude, "L", "מתחם לימוד")
    session.add(OccupancyHistory(place_id=area.id, slot_start=NINE, people=30, simulated=True))
    braude.history_until = NINE
    stay(session, student, area, NINE, NINE + Q)
    record_history(session, SUNDAY_10AM)
    row = session.scalars(select(OccupancyHistory).where(OccupancyHistory.place_id == area.id)).one()
    assert (row.people, row.simulated) == (1, False)


def test_each_institution_keeps_its_own_place_in_time(session, braude, student):
    other = Institution(name="אחר", slug="other", timezone="Asia/Jerusalem")
    session.add(other)
    session.flush()
    record_history(session, SUNDAY_10AM)
    session.refresh(braude)
    session.refresh(other)
    assert braude.history_until == SUNDAY_10AM
    assert other.history_until == SUNDAY_10AM


def test_check_ins_older_than_ninety_days_are_deleted_and_the_counts_stay(session, braude, student):
    area = place_named(braude, "L", "מתחם לימוד")
    old = SUNDAY_10AM - KEEP_CHECK_INS - timedelta(days=1)
    session.add(OccupancyHistory(place_id=area.id, slot_start=old, people=1, simulated=False))
    stay(session, student, area, old, old + Q)
    recent = stay(session, student, area, NINE, NINE + Q)
    sweep(session, SUNDAY_10AM)
    assert [c.id for c in session.scalars(select(CheckIn)).all()] == [recent.id]
    assert session.scalars(select(OccupancyHistory).where(OccupancyHistory.slot_start == old)).one()


def test_the_sweep_records_history(session, braude, student):
    area = place_named(braude, "L", "מתחם לימוד")
    stay(session, student, area, NINE, NINE + Q)
    sweep(session, SUNDAY_10AM)
    assert counts(session, area) == {0: 1}
