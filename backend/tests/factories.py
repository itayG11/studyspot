"""Small helpers that build valid rows for tests, and check rejections."""

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Building, BuildingStatus, Institution, Place, PlaceKind, User


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


def assert_rejected(session: Session, add_row, constraint: str) -> None:
    """The row is refused by the named constraint, and only that attempt is undone.

    Checking the constraint name proves each test fails for the rule it is
    about, not because of some unrelated mistake in the test data.
    """
    with pytest.raises(IntegrityError) as error, session.begin_nested():  # a SAVEPOINT, rolled back on error
        add_row()
        session.flush()
    assert error.value.orig.diag.constraint_name == constraint


def make_user(session: Session, institution: Institution, email: str = "student@example.com") -> User:
    user = User(institution_id=institution.id, email=email, display_name="Student")
    session.add(user)
    session.flush()
    return user
