"""Wave 13: a screen by the door with a check-in code that changes every minute."""

from datetime import UTC, datetime, timedelta

import pytest
from conftest import SUNDAY_10AM, TEST_CODE_SECRET, code_for, place_named
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError

from app import screens
from app.api.screens import screen_key
from app.codes import make_screen_code, read_code, window_at
from app.config import get_settings
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


# --- what the screen asks for: GET /screen ---------------------------------------

def _library(braude) -> Place:
    return place_named(braude, "EF", "ספרייה")


def _screen_for(session, place) -> str:
    place.check_in_mode = CheckInMode.SCREEN
    token = screens.new_screen(session, place, SUNDAY_10AM, screen_key(get_settings()))
    session.flush()
    return token


def _ask(client, token):
    return client.get("/screen", headers={"X-Screen-Token": token})


def test_the_screen_gets_this_minutes_code(client, session, braude):
    client.user = None  # a tablet by the door: nobody signed in
    library = _library(braude)
    answer = _ask(client, _screen_for(session, library))
    assert answer.status_code == 200
    body = answer.json()
    claim = read_code(body["code"], TEST_CODE_SECRET)
    assert (claim.place_id, claim.version, claim.window) == (library.id, library.code_version, window_at(SUNDAY_10AM))
    assert (body["place_name"], body["building_code"], body["capacity"]) == ("ספרייה", "EF", library.capacity)
    assert 1 <= body["seconds_left"] <= 60
    assert body["occupied"] == 0
    assert answer.headers["cache-control"] == "no-store"


def test_a_minute_later_the_code_is_new(client, session, braude):
    token = _screen_for(session, _library(braude))
    first = _ask(client, token).json()["code"]
    client.clock.now = SUNDAY_10AM + timedelta(minutes=1)
    assert _ask(client, token).json()["code"] != first


def test_revoking_the_sign_changes_the_screen_code_too(client, session, braude):
    library = _library(braude)
    token = _screen_for(session, library)
    before = _ask(client, token).json()["code"]
    library.code_version += 1
    session.flush()
    after = _ask(client, token).json()["code"]
    assert after != before and read_code(after, TEST_CODE_SECRET).version == library.code_version


def test_a_closed_place_shows_no_code(client, session, braude):
    token = _screen_for(session, _library(braude))
    client.clock.now = SUNDAY_10AM.replace(hour=1)  # 03:00 or 04:00 in Karmiel: closed
    body = _ask(client, token).json()
    assert body["code"] is None


@pytest.mark.parametrize("token", ["x" * 43, "a-real-looking-but-unknown-token-0123456789"])
def test_an_unknown_link_finds_nothing(client, token):
    answer = _ask(client, token)
    assert (answer.status_code, answer.json()["detail"]) == (404, "screen_not_found")


def test_no_token_is_refused(client):
    assert client.get("/screen").status_code == 422


def test_a_place_back_on_a_printed_sign_has_no_screen(client, session, braude):
    library = _library(braude)
    token = _screen_for(session, library)
    library.check_in_mode = CheckInMode.SIGN
    session.flush()
    assert _ask(client, token).status_code == 404


def test_a_new_link_ends_the_old_one(client, session, braude):
    library = _library(braude)
    old = _screen_for(session, library)
    new = _screen_for(session, library)
    assert _ask(client, old).status_code == 404
    assert _ask(client, new).status_code == 200


def test_removing_the_link_ends_it(client, session, braude):
    library = _library(braude)
    token = _screen_for(session, library)
    screens.revoke(session, library)
    assert _ask(client, token).status_code == 404


def test_the_token_is_kept_only_as_a_hash(session, braude):
    library = _library(braude)
    token = _screen_for(session, library)
    stored = session.get(PlaceScreen, library.id).token_hash
    assert token not in stored and len(stored) == 64


def test_seen_is_marked_now_and_then_not_on_every_poll(client, session, braude):
    library = _library(braude)
    token = _screen_for(session, library)
    _ask(client, token)
    assert session.get(PlaceScreen, library.id).last_seen_at == SUNDAY_10AM
    client.clock.now = SUNDAY_10AM + timedelta(minutes=4)
    _ask(client, token)
    assert session.get(PlaceScreen, library.id).last_seen_at == SUNDAY_10AM
    client.clock.now = SUNDAY_10AM + timedelta(minutes=5)
    _ask(client, token)
    assert session.get(PlaceScreen, library.id).last_seen_at == SUNDAY_10AM + timedelta(minutes=5)


def test_asking_is_limited(client):
    codes = [_ask(client, "z" * 43).status_code for _ in range(301)]
    assert codes[-1] == 429


# --- checking in with the screen's code --------------------------------------------


def _screen_code(place, minutes_ago=0):
    return make_screen_code(place.id, place.code_version, window_at(SUNDAY_10AM) - minutes_ago, TEST_CODE_SECRET)


def _check_in(client, code):
    return client.post("/check-ins", json={"code": code})


@pytest.mark.parametrize("minutes_ago", [0, 1])
def test_this_minutes_or_the_last_minutes_code_lets_a_student_in(client, session, braude, minutes_ago):
    library = _library(braude)
    library.check_in_mode = CheckInMode.SCREEN
    session.flush()
    answer = _check_in(client, _screen_code(library, minutes_ago))
    assert answer.status_code == 201
    assert answer.json()["place_id"] == library.id


def test_an_older_screen_code_is_refused_as_expired(client, session, braude):
    library = _library(braude)
    library.check_in_mode = CheckInMode.SCREEN
    session.flush()
    answer = _check_in(client, _screen_code(library, minutes_ago=2))
    assert (answer.status_code, answer.json()["detail"]) == (400, "screen_code_expired")


def test_a_code_from_the_future_is_refused(client, session, braude):
    library = _library(braude)
    library.check_in_mode = CheckInMode.SCREEN
    session.flush()
    assert _check_in(client, _screen_code(library, minutes_ago=-1)).json()["detail"] == "screen_code_expired"


def test_on_a_screen_the_printed_sign_no_longer_works(client, session, braude):
    library = _library(braude)
    library.check_in_mode = CheckInMode.SCREEN
    session.flush()
    answer = _check_in(client, code_for(library))
    assert (answer.status_code, answer.json()["detail"]) == (400, "invalid_code")


def test_on_a_printed_sign_a_screen_code_is_refused(client, braude):
    answer = _check_in(client, _screen_code(_library(braude)))
    assert (answer.status_code, answer.json()["detail"]) == (400, "invalid_code")


def test_the_printed_sign_still_works_where_there_is_no_screen(client, braude):
    assert _check_in(client, code_for(_library(braude))).status_code == 201
