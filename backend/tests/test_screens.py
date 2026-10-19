"""Wave 13: a screen by the door with a check-in code that changes every minute."""

from datetime import UTC, datetime

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError

from app.models import CheckInMode, Place, PlaceScreen

NOW = datetime(2026, 10, 20, 9, 0, tzinfo=UTC)


def _a_place(session, braude) -> Place:
    return session.scalars(select(Place).where(Place.institution_id == braude.id).order_by(Place.id)).first()


# --- the data model -------------------------------------------------------------


def test_a_place_starts_with_the_printed_sign(session, braude):
    assert _a_place(session, braude).check_in_mode is CheckInMode.SIGN


def test_the_database_refuses_an_unknown_mode(session, braude):
    place = _a_place(session, braude)
    with pytest.raises(IntegrityError), session.begin_nested():
        session.execute(text("UPDATE places SET check_in_mode = 'laser' WHERE id = :id"), {"id": place.id})


def test_two_screens_cannot_share_a_token(session, braude):
    first, second = session.scalars(select(Place).where(Place.institution_id == braude.id).limit(2)).all()
    session.add(PlaceScreen(place_id=first.id, token_hash="a" * 64, created_at=NOW))
    session.flush()
    with pytest.raises(IntegrityError), session.begin_nested():
        session.add(PlaceScreen(place_id=second.id, token_hash="a" * 64, created_at=NOW))
        session.flush()


def test_deleting_a_place_deletes_its_screen_link(session, braude):
    place = _a_place(session, braude)
    session.add(PlaceScreen(place_id=place.id, token_hash="b" * 64, created_at=NOW))
    session.flush()
    session.execute(text("DELETE FROM places WHERE id = :id"), {"id": place.id})
    left = session.execute(text("SELECT count(*) FROM place_screens WHERE place_id = :id"), {"id": place.id})
    assert left.scalar_one() == 0
