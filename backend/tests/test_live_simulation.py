"""The demo campus has hardly any real visitors in its places, so its live
numbers would sit at "all free". Simulated students come and go there,
minute by minute, along the same made-up day as the simulated history.
They are labelled simulated, a real student always gets in before them,
and they never reach a campus with real sign-in rules."""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from conftest import SUNDAY_10AM, TEST_CODE_SECRET, code_for, place_named
from sqlalchemy import func, select

from app.checkins import check_in
from app.config import get_settings
from app.history import record_history
from app.models import Booking, BookingSource, BookingStatus, CheckIn, OccupancyHistory, PlaceKind, User
from app.occupancy import occupied_by_place, occupied_seat_ids
from app.seed import live, seed_demo
from app.seed.live import simulate_live
from app.sweeper import sweep

TZ = ZoneInfo("Asia/Jerusalem")
SUNDAY_NOON = datetime(2026, 10, 11, 12, 0, tzinfo=TZ)
SATURDAY_NOON = datetime(2026, 10, 10, 12, 0, tzinfo=TZ)


@pytest.fixture(autouse=True)
def demo_sign_in_on(monkeypatch):
    """The live site has the demo sign-in on; the simulation runs only then."""
    monkeypatch.setenv("DEMO_LOGIN_ENABLED", "true")
    get_settings.cache_clear()


def settle(session, institution, now, runs=40):
    """Enough runs to reach the target from an empty campus."""
    for _ in range(runs):
        simulate_live(session, institution, now)


def active(session, place, now):
    return session.scalars(
        select(CheckIn).where(CheckIn.place_id == place.id, CheckIn.ended_at.is_(None), CheckIn.expires_at > now)
    ).all()


def real_student(session, institution, n):
    user = User(institution_id=institution.id, email=f"real{n}@demo.example", display_name=f"Real {n}")
    session.add(user)
    session.flush()
    return user


def places_of(institution):
    return [p for b in institution.buildings for p in b.places]


def test_at_noon_the_open_places_have_simulated_people_within_capacity(session):
    demo = seed_demo(session)
    settle(session, demo, SUNDAY_NOON)
    counts = occupied_by_place(session, [p.id for p in places_of(demo)], SUNDAY_NOON)
    for place in places_of(demo):
        rows = active(session, place, SUNDAY_NOON)
        assert all(r.simulated for r in rows)
        if place.kind == PlaceKind.GROUP_ROOM:
            assert rows == []  # rooms are judged by bookings only
        else:
            # Busy, never full: a real student can always walk in.
            assert 0 < counts.get(place.id, 0) < place.capacity
    users = session.scalars(select(User).join(CheckIn, CheckIn.user_id == User.id)).all()
    assert users and all(u.simulated for u in users)


def test_lab_seats_are_real_seats_and_no_one_sits_twice(session):
    demo = seed_demo(session)
    settle(session, demo, SUNDAY_NOON)
    lab = place_named(demo, "EM", "EM315")
    rows = active(session, lab, SUNDAY_NOON)
    seats = [r.seat_id for r in rows]
    assert seats and None not in seats and len(set(seats)) == len(seats)
    assert set(seats) == occupied_seat_ids(session, lab.id, SUNDAY_NOON)


def test_it_changes_gradually_not_all_at_once(session):
    demo = seed_demo(session)
    simulate_live(session, demo, SUNDAY_NOON)
    library = place_named(demo, "EF", "ספרייה")
    first = len(active(session, library, SUNDAY_NOON))
    settle(session, demo, SUNDAY_NOON)
    assert 0 < first < len(active(session, library, SUNDAY_NOON))


def test_a_closed_campus_empties(session):
    demo = seed_demo(session)
    settle(session, demo, SUNDAY_NOON)
    evening = SUNDAY_NOON.replace(hour=23)
    simulate_live(session, demo, evening)
    assert all(active(session, p, evening) == [] for p in places_of(demo))
    simulate_live(session, demo, SATURDAY_NOON)
    assert all(active(session, p, SATURDAY_NOON) == [] for p in places_of(demo))


def test_a_campus_with_real_sign_in_rules_gets_none(session, braude):
    settle(session, braude, SUNDAY_NOON, runs=3)
    assert session.scalar(select(func.count()).select_from(CheckIn)) == 0
    assert session.scalar(select(func.count()).select_from(User).where(User.simulated)) == 0


def test_a_real_student_gets_into_a_place_full_with_simulated_people(session):
    demo = seed_demo(session)
    area = place_named(demo, "P", "מתחם 2")
    settle(session, demo, SUNDAY_NOON)
    simulated = len(active(session, area, SUNDAY_NOON))
    assert simulated > 0
    for n in range(area.capacity - simulated):
        check_in(session, real_student(session, demo, n), code_for(area), None, SUNDAY_NOON, TEST_CODE_SECRET)
    assert occupied_by_place(session, [area.id], SUNDAY_NOON)[area.id] == area.capacity
    late = real_student(session, demo, 99)
    result = check_in(session, late, code_for(area), None, SUNDAY_NOON, TEST_CODE_SECRET)
    assert result.created and result.check_in.user_id == late.id
    # One simulated student made room; the place is still at capacity.
    assert occupied_by_place(session, [area.id], SUNDAY_NOON)[area.id] == area.capacity
    assert len([r for r in active(session, area, SUNDAY_NOON) if r.simulated]) == simulated - 1


def test_a_real_student_takes_a_seat_a_simulated_one_sits_on(session):
    demo = seed_demo(session)
    lab = place_named(demo, "EM", "EM212")
    settle(session, demo, SUNDAY_NOON)
    taken = active(session, lab, SUNDAY_NOON)[0].seat_id
    real = real_student(session, demo, 1)
    result = check_in(session, real, code_for(lab), taken, SUNDAY_NOON, TEST_CODE_SECRET)
    assert result.check_in.seat_id == taken and result.check_in.user_id == real.id
    assert [r.user_id for r in active(session, lab, SUNDAY_NOON) if r.seat_id == taken] == [real.id]


def test_a_booked_seat_is_left_for_its_owner(session):
    demo = seed_demo(session)
    lab = place_named(demo, "EM", "EM212")
    owner = real_student(session, demo, 1)
    for seat in lab.seats:  # every seat booked from now on: none is free for a stay
        session.add(
            Booking(
                institution_id=demo.id, user_id=owner.id, place_id=lab.id, seat_id=seat.id,
                starts_at=SUNDAY_NOON - timedelta(minutes=5), ends_at=SUNDAY_NOON + timedelta(hours=1),
                status=BookingStatus.BOOKED, source=BookingSource.ADVANCE,
            )
        )
        owner = real_student(session, demo, 10 + seat.id)
    session.flush()
    settle(session, demo, SUNDAY_NOON)
    assert active(session, lab, SUNDAY_NOON) == []


def test_simulated_stays_are_not_counted_as_history(session):
    demo = seed_demo(session)
    settle(session, demo, SUNDAY_NOON)
    record_history(session, SUNDAY_NOON + timedelta(hours=1))
    real = session.scalars(select(OccupancyHistory).where(OccupancyHistory.simulated.is_(False))).all()
    assert real == []


def test_the_sweep_runs_it_and_clears_old_simulated_stays(session):
    demo = seed_demo(session)
    sweep(session, SUNDAY_NOON)
    assert any(active(session, p, SUNDAY_NOON) for p in places_of(demo))
    # Two days on, at night: yesterday's simulated stays are gone, not kept for 90 days.
    later = SUNDAY_NOON + timedelta(days=2, hours=11)
    sweep(session, later)
    assert session.scalar(select(func.count()).select_from(CheckIn).where(CheckIn.simulated)) == 0


def test_the_daily_shape_is_quieter_early(session):
    demo = seed_demo(session)
    library = place_named(demo, "EF", "ספרייה")
    early = SUNDAY_10AM.astimezone(TZ).replace(hour=8)
    settle(session, demo, early)
    morning = len(active(session, library, early))
    simulate_live(session, demo, SUNDAY_NOON)  # leaves at most one step behind
    settle(session, demo, SUNDAY_NOON)
    assert morning < len(active(session, library, SUNDAY_NOON))


def simulated_users(session, institution):
    return session.scalar(
        select(func.count()).select_from(User).where(User.institution_id == institution.id, User.simulated)
    )


def test_the_made_up_students_are_capped_and_the_spare_ones_go(session, monkeypatch):
    # The shared demo admin can add places of up to 1000 seats: the pool of
    # made-up students stays small whatever the campus holds.
    demo = seed_demo(session)
    monkeypatch.setattr(live, "MAX_POOL", 30)
    settle(session, demo, SUNDAY_NOON, runs=5)
    assert simulated_users(session, demo) == 30
    monkeypatch.setattr(live, "MAX_POOL", 10)
    evening = SUNDAY_NOON.replace(hour=23)  # closed: nobody sits anywhere
    simulate_live(session, demo, evening)
    assert simulated_users(session, demo) == 10


def test_only_while_the_demo_sign_in_is_on(session, monkeypatch):
    demo = seed_demo(session)
    monkeypatch.setenv("DEMO_LOGIN_ENABLED", "false")
    get_settings.cache_clear()
    settle(session, demo, SUNDAY_NOON, runs=2)
    assert simulated_users(session, demo) == 0


def test_once_the_campus_has_a_sign_in_rule_even_a_waiting_one_the_made_up_students_go(session):
    from app.models import AuthProvider, InstitutionLoginRule

    demo = seed_demo(session)
    settle(session, demo, SUNDAY_NOON, runs=3)
    assert simulated_users(session, demo) > 0
    session.add(InstitutionLoginRule(institution_id=demo.id, provider=AuthProvider.EMAIL, value="college.example", approved=False))
    session.flush()
    session.refresh(demo)
    simulate_live(session, demo, SUNDAY_NOON)
    assert simulated_users(session, demo) == 0
    assert session.scalar(select(func.count()).select_from(CheckIn).where(CheckIn.simulated)) == 0


def test_a_failing_simulation_does_not_undo_the_rest_of_the_sweep(session, monkeypatch):
    from app import sweeper

    demo = seed_demo(session)
    expired_user = real_student(session, demo, 1)
    area = place_named(demo, "L", "מתחם לימוד")
    session.add(CheckIn(institution_id=demo.id, user_id=expired_user.id, place_id=area.id,
                        started_at=SUNDAY_NOON - timedelta(hours=3), expires_at=SUNDAY_NOON - timedelta(hours=1)))
    session.flush()

    def broken(*args):
        raise RuntimeError("boom")

    monkeypatch.setattr(sweeper, "simulate_live", broken)
    result = sweep(session, SUNDAY_NOON)
    assert result.expired_check_ins == 1
