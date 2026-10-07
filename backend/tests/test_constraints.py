"""The database itself rejects invalid campus data.

Each test builds one broken row and expects PostgreSQL to refuse it,
so the rules hold even if a bug in the code (or a bad upload) skips
the checks in Python.
"""

from datetime import date, time

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import (
    Building,
    BuildingStatus,
    Institution,
    OpeningHours,
    Place,
    PlaceKind,
    Seat,
    SpecialPeriod,
    SpecialPeriodPlace,
)


def make_institution(session: Session, slug: str = "test-college") -> Institution:
    institution = Institution(name=f"Test {slug}", slug=slug)
    session.add(institution)
    session.flush()
    return institution


def make_building(session: Session, institution: Institution, code: str = "A", **kw) -> Building:
    building = Building(
        institution=institution,
        code=code,
        floors_count=kw.pop("floors_count", 3),
        status=kw.pop("status", BuildingStatus.ACTIVE),
        **kw,
    )
    session.add(building)
    session.flush()
    return building


def make_place(session: Session, building: Building, **kw) -> Place:
    # Set the ids directly: assigning .building would copy the building's
    # institution_id and hide the mismatch that some tests need to create.
    place = Place(
        building_id=building.id,
        institution_id=kw.pop("institution_id", building.institution_id),
        kind=kw.pop("kind", PlaceKind.OPEN_AREA),
        name=kw.pop("name", "Area 1"),
        floor=kw.pop("floor", 0),
        capacity=kw.pop("capacity", 20),
        **kw,
    )
    session.add(place)
    session.flush()
    return place


def assert_rejected(session: Session, add_row) -> None:
    """The row is refused, and only that attempt is undone (via a SAVEPOINT)."""
    with pytest.raises(IntegrityError):
        with session.begin_nested():
            add_row()
            session.flush()


# --- Valid rows are accepted -------------------------------------------------


def test_valid_campus_rows_are_accepted(session: Session):
    institution = make_institution(session)
    building = make_building(session, institution, latitude=32.9, longitude=35.3)
    lab = make_place(
        session, building, kind=PlaceKind.COMPUTER_LAB, name="A101",
        capacity=6, lab_rows=2, lab_cols=3,
    )
    session.add(Seat(place=lab, row=1, col=1, label="A1"))
    session.add(OpeningHours(place=lab, weekday=0, opens=time(7), closes=time(20)))
    session.commit()

    assert lab.id is not None


# --- Institutions and buildings ----------------------------------------------


def test_institution_slug_must_be_url_safe(session: Session):
    assert_rejected(session, lambda: session.add(Institution(name="Bad", slug="Bad Slug!")))


def test_institution_slug_is_unique(session: Session):
    make_institution(session, "same")
    assert_rejected(session, lambda: session.add(Institution(name="Other", slug="same")))


def test_building_code_is_unique_within_an_institution(session: Session):
    institution = make_institution(session)
    make_building(session, institution, code="M")
    assert_rejected(session, lambda: make_building(session, institution, code="M"))


def test_same_building_code_is_allowed_in_another_institution(session: Session):
    make_building(session, make_institution(session, "first"), code="M")
    make_building(session, make_institution(session, "second"), code="M")


def test_building_needs_at_least_one_floor(session: Session):
    institution = make_institution(session)
    assert_rejected(session, lambda: make_building(session, institution, floors_count=0))


@pytest.mark.parametrize(
    ("latitude", "longitude"),
    [(91, 35), (-91, 35), (32, 181), (32, -181), (32, None), (None, 35)],
)
def test_building_coordinates_are_in_range_and_come_in_pairs(session: Session, latitude, longitude):
    institution = make_institution(session)
    assert_rejected(
        session,
        lambda: make_building(session, institution, latitude=latitude, longitude=longitude),
    )


# --- Places --------------------------------------------------------------------


def test_place_cannot_belong_to_another_institution_than_its_building(session: Session):
    """Multi-tenancy guard: the composite foreign key keeps institutions apart."""
    building = make_building(session, make_institution(session, "owner"))
    other = make_institution(session, "intruder")
    assert_rejected(session, lambda: make_place(session, building, institution_id=other.id))


def test_place_floor_cannot_be_negative(session: Session):
    building = make_building(session, make_institution(session))
    assert_rejected(session, lambda: make_place(session, building, floor=-1))


def test_place_capacity_must_be_positive(session: Session):
    building = make_building(session, make_institution(session))
    assert_rejected(session, lambda: make_place(session, building, capacity=0))


def test_place_name_is_unique_within_a_building(session: Session):
    building = make_building(session, make_institution(session))
    make_place(session, building, name="Area 1")
    assert_rejected(session, lambda: make_place(session, building, name="Area 1"))


def test_computer_lab_needs_a_layout(session: Session):
    building = make_building(session, make_institution(session))
    assert_rejected(
        session, lambda: make_place(session, building, kind=PlaceKind.COMPUTER_LAB, capacity=10)
    )


def test_computer_lab_capacity_must_match_its_layout(session: Session):
    building = make_building(session, make_institution(session))
    assert_rejected(
        session,
        lambda: make_place(
            session, building, kind=PlaceKind.COMPUTER_LAB, capacity=10, lab_rows=2, lab_cols=3
        ),
    )


def test_only_computer_labs_have_a_layout(session: Session):
    building = make_building(session, make_institution(session))
    assert_rejected(
        session,
        lambda: make_place(
            session, building, kind=PlaceKind.OPEN_AREA, capacity=6, lab_rows=2, lab_cols=3
        ),
    )


def test_unknown_place_kind_is_rejected_by_the_database(session: Session):
    building = make_building(session, make_institution(session))
    place = make_place(session, building)
    with pytest.raises(IntegrityError):
        with session.begin_nested():
            session.execute(
                Place.__table__.update().where(Place.id == place.id).values(kind="lecture_hall")
            )


# --- Seats ----------------------------------------------------------------------


def test_seat_position_is_unique_and_positive(session: Session):
    building = make_building(session, make_institution(session))
    lab = make_place(
        session, building, kind=PlaceKind.COMPUTER_LAB, capacity=4, lab_rows=2, lab_cols=2
    )
    session.add(Seat(place=lab, row=1, col=1, label="A1"))
    session.flush()
    assert_rejected(session, lambda: session.add(Seat(place=lab, row=1, col=1, label="X")))
    assert_rejected(session, lambda: session.add(Seat(place=lab, row=0, col=1, label="Z")))


# --- Hours and special periods ---------------------------------------------------


def test_opening_hours_must_open_before_closing(session: Session):
    building = make_building(session, make_institution(session))
    place = make_place(session, building)
    assert_rejected(
        session,
        lambda: session.add(OpeningHours(place=place, weekday=0, opens=time(20), closes=time(7))),
    )


def test_opening_hours_weekday_is_0_to_6_and_unique(session: Session):
    building = make_building(session, make_institution(session))
    place = make_place(session, building)
    session.add(OpeningHours(place=place, weekday=6, opens=time(7), closes=time(20)))
    session.flush()
    assert_rejected(
        session,
        lambda: session.add(OpeningHours(place=place, weekday=6, opens=time(8), closes=time(9))),
    )
    assert_rejected(
        session,
        lambda: session.add(OpeningHours(place=place, weekday=7, opens=time(7), closes=time(20))),
    )


def test_special_period_must_not_end_before_it_starts(session: Session):
    institution = make_institution(session)
    assert_rejected(
        session,
        lambda: session.add(
            SpecialPeriod(
                institution=institution, name="Exams",
                starts_on=date(2027, 2, 1), ends_on=date(2027, 1, 1),
            )
        ),
    )


def test_special_period_cannot_include_a_place_of_another_institution(session: Session):
    owner = make_institution(session, "owner")
    other = make_institution(session, "other")
    period = SpecialPeriod(
        institution=owner, name="Exams", starts_on=date(2027, 1, 1), ends_on=date(2027, 2, 1)
    )
    session.add(period)
    other_place = make_place(session, make_building(session, other))
    assert_rejected(
        session,
        lambda: session.add(
            SpecialPeriodPlace(period=period, place=other_place, institution_id=owner.id)
        ),
    )
