"""Ten students book the same room (or seat) for the same time at once:
the database lets exactly one through.

There is no lock in the booking code: the EXCLUDE constraints alone decide.
Like test_concurrency.py, this commits real data through separate
connections and cleans up after itself.
"""

import threading
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

import pytest
from conftest import SUNDAY_10AM
from sqlalchemy import Engine, delete
from sqlalchemy.orm import Session

from app.bookings import create_booking
from app.errors import Refusal
from app.models import Building, Institution, OpeningHours, Place, PlaceKind, Seat, User

STUDENTS = 10
MONDAY_14 = datetime(2026, 10, 12, 14, 0, tzinfo=ZoneInfo("Asia/Jerusalem"))


def _build_campus(engine: Engine) -> tuple[int, int, int, int, list[int]]:
    with Session(engine) as session:
        institution = Institution(name="Booking race", slug="booking-race")
        building = Building(code="B", floors_count=1)
        week = [OpeningHours(weekday=d, opens=time(7), closes=time(20)) for d in range(7)]
        room = Place(kind=PlaceKind.GROUP_ROOM, name="Room", floor=0, capacity=6)
        room.opening_hours = week
        lab = Place(
            kind=PlaceKind.COMPUTER_LAB, name="Lab", floor=0, capacity=1, lab_rows=1, lab_cols=1
        )
        lab.opening_hours = [
            OpeningHours(weekday=d, opens=time(7), closes=time(20)) for d in range(7)
        ]
        lab.seats = [Seat(row=1, col=1, label="A1")]
        building.places.extend([room, lab])
        institution.buildings.append(building)
        session.add(institution)
        session.flush()
        users = [
            User(institution_id=institution.id, email=f"b{i}@race.example", display_name=f"B{i}")
            for i in range(STUDENTS)
        ]
        session.add_all(users)
        session.commit()
        return institution.id, room.id, lab.id, lab.seats[0].id, [u.id for u in users]


@pytest.mark.parametrize("target", ["room", "seat"])
def test_only_one_booking_wins(engine: Engine, target: str):
    institution_id, room_id, lab_id, seat_id, user_ids = _build_campus(engine)
    place_id, seat = (room_id, None) if target == "room" else (lab_id, seat_id)
    start_together = threading.Barrier(STUDENTS)
    outcomes: list[str] = []
    lock = threading.Lock()

    def book(user_id: int) -> None:
        with Session(engine) as session:
            user = session.get(User, user_id)
            start_together.wait()
            try:
                create_booking(
                    session, user, place_id, seat, MONDAY_14, MONDAY_14 + timedelta(hours=2),
                    SUNDAY_10AM,
                )
                session.commit()
                outcome = "ok"
            except Refusal as error:
                session.rollback()
                outcome = error.code
        with lock:
            outcomes.append(outcome)

    threads = [threading.Thread(target=book, args=(uid,)) for uid in user_ids]
    try:
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=30)
        assert sorted(outcomes) == ["ok"] + ["slot_taken"] * (STUDENTS - 1)
    finally:
        with Session(engine) as session:
            session.execute(delete(Institution).where(Institution.id == institution_id))
            session.commit()
