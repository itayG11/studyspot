"""Wave 19.1: a room or a seat whose time just ran out may still be taken.

Nothing in the software can see the chair, so a stay that ended by the clock
(not by the student leaving) is shown as "maybe still taken" for the
institution's grace minutes. It is a hint only: free_now never changes, and
the database's booking rules are not touched.
"""

from datetime import timedelta

from conftest import SUNDAY_10AM, place_named
from factories import make_place
from sqlalchemy.orm import Session

from app.lingering import lingering_room_ids, lingering_seat_ids
from app.models import (
    Booking,
    BookingSource,
    BookingStatus,
    CheckIn,
    CheckInEndReason,
    Institution,
    PlaceKind,
    User,
)

NOW = SUNDAY_10AM
GRACE = 5


def lab_of(braude: Institution):
    return next(p for b in braude.buildings for p in b.places if p.name == "M206")


def stay(
    session: Session,
    braude: Institution,
    user: User,
    place,
    *,
    seat=None,
    ended_minutes_ago: float = 2,
    reason: CheckInEndReason | None = CheckInEndReason.EXPIRED,
    swept: bool = True,
    simulated: bool = False,
) -> CheckIn:
    """A stay whose time ran out `ended_minutes_ago`. swept=False: the sweep
    has not closed it yet (ended_at empty, expires_at already past)."""
    end = NOW - timedelta(minutes=ended_minutes_ago)
    booking = Booking(
        institution_id=braude.id, user_id=user.id, place_id=place.id,
        seat_id=seat.id if seat else None, starts_at=end - timedelta(hours=1), ends_at=end,
        status=BookingStatus.COMPLETED, source=BookingSource.ADVANCE,
    )
    session.add(booking)
    session.flush()
    row = CheckIn(
        institution_id=braude.id, user_id=user.id, place_id=place.id,
        seat_id=seat.id if seat else None, booking_id=booking.id,
        started_at=end - timedelta(hours=1), expires_at=end, simulated=simulated,
        ended_at=end if swept else None, end_reason=reason if swept else None,
    )
    session.add(row)
    session.flush()
    return row


# --- Which rooms and seats are marked ------------------------------------------------------


def test_a_room_whose_time_just_ran_out_is_marked(session, braude, student):
    room = place_named(braude, "EM", "EM107")
    stay(session, braude, student, room, ended_minutes_ago=2)
    assert lingering_room_ids(session, [room.id], NOW, GRACE) == {room.id}


def test_leaving_by_oneself_is_not_marked(session, braude, student):
    room = place_named(braude, "EM", "EM107")
    stay(session, braude, student, room, reason=CheckInEndReason.CHECKOUT)
    assert lingering_room_ids(session, [room.id], NOW, GRACE) == set()


def test_moving_to_another_place_is_not_marked(session, braude, student):
    room = place_named(braude, "EM", "EM107")
    stay(session, braude, student, room, reason=CheckInEndReason.MOVED)
    assert lingering_room_ids(session, [room.id], NOW, GRACE) == set()


def test_after_the_grace_it_is_no_longer_marked(session, braude, student):
    room = place_named(braude, "EM", "EM107")
    stay(session, braude, student, room, ended_minutes_ago=GRACE + 1)
    assert lingering_room_ids(session, [room.id], NOW, GRACE) == set()


def test_exactly_at_the_end_of_the_grace_it_is_not_marked(session, braude, student):
    room = place_named(braude, "EM", "EM107")
    stay(session, braude, student, room, ended_minutes_ago=GRACE)
    assert lingering_room_ids(session, [room.id], NOW, GRACE) == set()


def test_a_grace_of_zero_never_marks(session, braude, student):
    room = place_named(braude, "EM", "EM107")
    stay(session, braude, student, room, ended_minutes_ago=0.5)
    assert lingering_room_ids(session, [room.id], NOW, 0) == set()


def test_a_stay_the_sweep_has_not_closed_yet_is_marked(session, braude, student):
    room = place_named(braude, "EM", "EM107")
    stay(session, braude, student, room, swept=False)
    assert lingering_room_ids(session, [room.id], NOW, GRACE) == {room.id}


def test_a_made_up_student_is_never_marked(session, braude, student):
    room = place_named(braude, "EM", "EM107")
    stay(session, braude, student, room, simulated=True)
    assert lingering_room_ids(session, [room.id], NOW, GRACE) == set()


def second_room(session, braude):
    building = next(b for b in braude.buildings if b.code == "EM")
    return make_place(session, building, kind=PlaceKind.GROUP_ROOM, name="EM-extra", capacity=6)


def test_only_the_asked_rooms_are_looked_at(session, braude, student):
    room, other = place_named(braude, "EM", "EM107"), second_room(session, braude)
    stay(session, braude, student, room)
    assert lingering_room_ids(session, [other.id], NOW, GRACE) == set()
    assert lingering_room_ids(session, [], NOW, GRACE) == set()


def test_a_seat_is_marked_and_the_next_seat_is_not(session, braude, student):
    lab = lab_of(braude)
    first, second = lab.seats[0], lab.seats[1]
    stay(session, braude, student, lab, seat=first)
    assert lingering_seat_ids(session, lab.id, NOW, GRACE) == {first.id}
    assert second.id not in lingering_seat_ids(session, lab.id, NOW, GRACE)


# --- What the API shows ----------------------------------------------------------------------


def test_the_room_is_still_free_now_but_marked(client, session, braude, student):
    room = place_named(braude, "EM", "EM107")
    before = client.get(f"/places/{room.id}").json()
    assert before["free_now"] is True and before["maybe_still_taken"] is False

    stay(session, braude, student, room, ended_minutes_ago=2)
    after = client.get(f"/places/{room.id}").json()
    assert after["free_now"] is True  # the contract does not change
    assert after["maybe_still_taken"] is True


def test_the_seat_map_marks_the_seat_and_keeps_free_now(client, session, braude, student):
    lab = lab_of(braude)
    seat = lab.seats[0]
    stay(session, braude, student, lab, seat=seat)
    seats = {s["id"]: s for s in client.get(f"/places/{lab.id}").json()["seats"]}
    assert seats[seat.id]["free_now"] is True
    assert seats[seat.id]["maybe_still_taken"] is True
    assert seats[lab.seats[1].id]["maybe_still_taken"] is False


def test_a_taken_room_is_not_marked(client, session, braude, student):
    """The mark is only for what would otherwise look free."""
    room = place_named(braude, "EM", "EM107")
    stay(session, braude, student, room, ended_minutes_ago=2)
    session.add(Booking(
        institution_id=braude.id, user_id=student.id, place_id=room.id, starts_at=NOW - timedelta(minutes=10),
        ends_at=NOW + timedelta(minutes=50), status=BookingStatus.CHECKED_IN, source=BookingSource.ADVANCE,
    ))
    session.flush()
    body = client.get(f"/places/{room.id}").json()
    assert body["free_now"] is False and body["maybe_still_taken"] is False


def test_an_open_area_is_never_marked(client, session, braude, student):
    area = next(p for b in braude.buildings for p in b.places if p.kind == PlaceKind.OPEN_AREA)
    stay(session, braude, student, area, ended_minutes_ago=1)
    assert client.get(f"/places/{area.id}").json()["maybe_still_taken"] is False


def test_the_list_marks_the_room_too(client, session, braude, student):
    room, other = place_named(braude, "EM", "EM107"), second_room(session, braude)
    stay(session, braude, student, room)
    places = {p["id"]: p for p in client.get("/institutions/braude/places").json()}
    assert places[room.id]["maybe_still_taken"] is True
    assert places[other.id]["maybe_still_taken"] is False


def test_the_grace_is_the_institutions_own(client, session, braude, student):
    room = place_named(braude, "EM", "EM107")
    stay(session, braude, student, room, ended_minutes_ago=3)
    braude.grace_minutes = 2
    session.flush()
    assert client.get(f"/places/{room.id}").json()["maybe_still_taken"] is False
    braude.grace_minutes = 5
    session.flush()
    assert client.get(f"/places/{room.id}").json()["maybe_still_taken"] is True


def test_the_grace_is_limited_to_fifteen_minutes(session, braude):
    import pytest
    from sqlalchemy.exc import IntegrityError

    braude.grace_minutes = 16
    with pytest.raises(IntegrityError):
        session.flush()
    session.rollback()


def test_scanning_out_after_the_time_ran_out_is_leaving_by_oneself(client, session, braude, student):
    """Not a stay that ran over: the room must not be shown as maybe still taken."""
    from app.checkins import check_out

    room = place_named(braude, "EM", "EM107")
    row = stay(session, braude, student, room, ended_minutes_ago=0, reason=None, swept=False)
    check_out(session, student, row.id, NOW + timedelta(minutes=1))
    assert lingering_room_ids(session, [room.id], NOW + timedelta(minutes=1), GRACE) == set()
