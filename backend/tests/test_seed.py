"""The Braude demo data matches docs/CAMPUS_DATA.md."""

from datetime import time

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Building, Institution, Place, PlaceKind, Seat, SpecialPeriod
from app.seed import seed_braude, seed_institution
from app.seed.braude import FRIDAY, SUNDAY_TO_THURSDAY


@pytest.fixture
def braude(session: Session) -> Institution:
    return seed_braude(session)


def count(session: Session, model, institution: Institution) -> int:
    return session.scalar(
        select(func.count()).select_from(model).where(model.institution_id == institution.id)
    )


def test_buildings_and_places_counts(session: Session, braude: Institution):
    assert count(session, Building, braude) == 7
    assert count(session, Place, braude) == 10


def test_building_statuses(session: Session, braude: Institution):
    statuses = {b.code: b.status.value for b in braude.buildings}
    assert statuses == {
        "M": "active", "L": "active", "EM": "active", "EF": "active", "P": "active",
        "NX": "new", "NG": "under_construction",
    }


def test_places_by_kind(braude: Institution):
    places = [p for b in braude.buildings for p in b.places]
    by_kind: dict[PlaceKind, list[Place]] = {}
    for place in places:
        by_kind.setdefault(place.kind, []).append(place)

    assert sum(p.capacity for p in by_kind[PlaceKind.COMPUTER_LAB]) == 95
    assert len(by_kind[PlaceKind.COMPUTER_LAB]) == 4
    assert sum(p.capacity for p in by_kind[PlaceKind.OPEN_AREA]) == 140
    assert [p.capacity for p in by_kind[PlaceKind.LIBRARY]] == [80]
    assert [p.name for p in by_kind[PlaceKind.GROUP_ROOM]] == ["EM107"]


def test_every_lab_has_one_seat_per_layout_cell(session: Session, braude: Institution):
    labs = [p for b in braude.buildings for p in b.places if p.kind == PlaceKind.COMPUTER_LAB]
    for lab in labs:
        positions = {(s.row, s.col) for s in lab.seats}
        expected = {(r, c) for r in range(1, lab.lab_rows + 1) for c in range(1, lab.lab_cols + 1)}
        assert positions == expected, lab.name
    assert session.scalar(select(func.count()).select_from(Seat)) == 95


def test_seat_labels_are_row_letter_and_column(braude: Institution):
    m206 = next(p for b in braude.buildings for p in b.places if p.name == "M206")
    labels = {(s.row, s.col): s.label for s in m206.seats}
    assert labels[(1, 1)] == "A1"
    assert labels[(5, 8)] == "E8"


def test_every_place_is_on_a_floor_that_exists(braude: Institution):
    for building in braude.buildings:
        for place in building.places:
            assert 0 <= place.floor < building.floors_count, place.name


def test_opening_hours(braude: Institution):
    for building in braude.buildings:
        for place in building.places:
            hours = {h.weekday: (h.opens, h.closes) for h in place.opening_hours}
            for day in SUNDAY_TO_THURSDAY:
                assert hours[day] == (time(7), time(20)), place.name
            if building.code == "P":
                assert FRIDAY not in hours
            else:
                assert hours[FRIDAY] == (time(7), time(14)), place.name
            assert 5 not in hours  # Saturday: closed everywhere


def test_demo_exam_period_covers_only_l_and_ef_open_areas(session: Session, braude: Institution):
    period = session.scalars(
        select(SpecialPeriod).where(SpecialPeriod.institution_id == braude.id)
    ).one()
    assert "דמו" in period.name
    open_all_day = {(p.building.code, p.kind) for p in period.places}
    assert open_all_day == {("L", PlaceKind.OPEN_AREA), ("EF", PlaceKind.OPEN_AREA)}


def test_seeding_twice_does_not_duplicate(session: Session):
    first = seed_braude(session)
    second = seed_braude(session)
    assert first.id == second.id
    assert count(session, Place, first) == 10


def test_seed_rejects_a_place_on_a_floor_the_building_does_not_have(session: Session):
    data = {
        "institution": {"name": "Floor Test", "slug": "floor-test", "timezone": "Asia/Jerusalem"},
        "buildings": [
            {
                "code": "Z",
                "floors_count": 1,
                "places": [{"kind": "open_area", "name": "Top", "floor": 1, "capacity": 5}],
            }
        ],
    }
    with pytest.raises(ValueError, match="floor"):
        seed_institution(session, data)
    # Nothing from the rejected campus is left waiting in the session.
    assert not session.new
    session.flush()
    leftover = select(func.count()).select_from(Institution).where(Institution.slug == "floor-test")
    assert session.scalar(leftover) == 0



def test_braude_sign_in_rules_are_its_two_microsoft_tenants(braude: Institution):
    rules = {(r.provider.value, r.value) for r in braude.login_rules}
    assert rules == {
        ("microsoft", "49329ec4-6819-4a03-b6ae-bd7be2fcf6ab"),
        ("microsoft", "d4b0e69c-5394-4005-977c-7817ac32ca5e"),
    }
