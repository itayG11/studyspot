"""The database enforces the check-in rules on its own."""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.orm import Session

from app.models import CheckIn, CheckInEndReason, PlaceKind, Seat, User
from factories import assert_rejected, make_building, make_institution, make_place

NOW = datetime(2026, 10, 7, 9, 0, tzinfo=UTC)


def make_user(session: Session, institution, email: str = "student@example.com") -> User:
    user = User(institution_id=institution.id, email=email, display_name="Student")
    session.add(user)
    session.flush()
    return user


def check_in(session: Session, user: User, place, seat=None, **kw) -> CheckIn:
    row = CheckIn(
        institution_id=kw.pop("institution_id", user.institution_id),
        user_id=user.id,
        place_id=place.id,
        seat_id=seat.id if seat else None,
        started_at=kw.pop("started_at", NOW),
        expires_at=kw.pop("expires_at", NOW + timedelta(hours=2)),
        **kw,
    )
    session.add(row)
    session.flush()
    return row


@pytest.fixture
def campus(session: Session):
    institution = make_institution(session)
    building = make_building(session, institution)
    area = make_place(session, building, name="Area", capacity=10)
    lab = make_place(
        session, building, kind=PlaceKind.COMPUTER_LAB, name="Lab",
        capacity=4, lab_rows=2, lab_cols=2,
    )
    seat = Seat(place_id=lab.id, row=1, col=1, label="A1")
    session.add(seat)
    session.flush()
    return institution, building, area, lab, seat


def test_user_email_is_unique_and_lowercase(session: Session, campus):
    institution = campus[0]
    make_user(session, institution, "a@example.com")
    assert_rejected(
        session, lambda: make_user(session, institution, "a@example.com"), "uq_users_email"
    )
    assert_rejected(
        session, lambda: make_user(session, institution, "B@Example.com"), "ck_users_email_lowercase"
    )


def test_one_active_check_in_per_user(session: Session, campus):
    _, _, area, lab, seat = campus
    user = make_user(session, campus[0])
    check_in(session, user, area)
    assert_rejected(
        session, lambda: check_in(session, user, lab, seat), "uq_check_ins_one_active_per_user"
    )


def test_ended_check_ins_do_not_block_a_new_one(session: Session, campus):
    _, _, area, _, _ = campus
    user = make_user(session, campus[0])
    check_in(session, user, area, ended_at=NOW, end_reason=CheckInEndReason.CHECKOUT)
    check_in(session, user, area)


def test_one_person_per_seat(session: Session, campus):
    institution, _, _, lab, seat = campus
    first = make_user(session, institution, "first@example.com")
    second = make_user(session, institution, "second@example.com")
    check_in(session, first, lab, seat)
    assert_rejected(
        session, lambda: check_in(session, second, lab, seat), "uq_check_ins_one_active_per_seat"
    )


def test_seat_must_belong_to_the_checked_in_place(session: Session, campus):
    _, building, _, _, seat = campus
    other_lab = make_place(
        session, building, kind=PlaceKind.COMPUTER_LAB, name="Other lab",
        capacity=1, lab_rows=1, lab_cols=1,
    )
    user = make_user(session, campus[0])
    assert_rejected(session, lambda: check_in(session, user, other_lab, seat), "fk_check_ins_seat")


def test_user_cannot_check_in_to_another_institution(session: Session, campus):
    """Multi-tenancy guard: user and place must share one institution."""
    _, _, area, _, _ = campus
    outsider = make_user(session, make_institution(session, "elsewhere"), "out@example.com")
    assert_rejected(
        session,
        lambda: check_in(session, outsider, area, institution_id=area.institution_id),
        "fk_check_ins_user",
    )
    assert_rejected(session, lambda: check_in(session, outsider, area), "fk_check_ins_place")


def test_check_in_must_expire_after_it_starts(session: Session, campus):
    user = make_user(session, campus[0])
    assert_rejected(
        session,
        lambda: check_in(session, user, campus[2], expires_at=NOW),
        "ck_check_ins_expires_after_start",
    )


def test_end_time_and_reason_come_together(session: Session, campus):
    user = make_user(session, campus[0])
    assert_rejected(
        session,
        lambda: check_in(session, user, campus[2], ended_at=NOW),
        "ck_check_ins_ended_with_reason",
    )
    assert_rejected(
        session,
        lambda: check_in(session, user, campus[2], end_reason=CheckInEndReason.CHECKOUT),
        "ck_check_ins_ended_with_reason",
    )


def test_place_code_version_is_positive(session: Session, campus):
    area = campus[2]
    area.code_version = 0
    assert_rejected(session, lambda: None, "ck_places_code_version_positive")
