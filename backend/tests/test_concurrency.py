"""Ten students scan the last free spot at the same moment: exactly one gets it.

Unlike the other tests, this one commits real data through separate
database connections (one per thread), because a race only exists between
transactions. It cleans up after itself.
"""

import threading
from datetime import time

from conftest import SUNDAY_10AM, TEST_CODE_SECRET
from sqlalchemy import Engine, delete
from sqlalchemy.orm import Session

from app.checkins import CheckInError, check_in
from app.codes import make_code
from app.models import Building, Institution, OpeningHours, Place, PlaceKind, User

STUDENTS = 10


def _build_campus(engine: Engine) -> tuple[int, int, list[int]]:
    with Session(engine) as session:
        institution = Institution(name="Race test", slug="race-test")
        building = Building(code="R", floors_count=1)
        place = Place(kind=PlaceKind.OPEN_AREA, name="Last seat", floor=0, capacity=1)
        place.opening_hours = [
            OpeningHours(weekday=day, opens=time(0), closes=time(23, 59)) for day in range(7)
        ]
        building.places.append(place)
        institution.buildings.append(building)
        session.add(institution)
        session.flush()
        users = [
            User(institution_id=institution.id, email=f"s{i}@race.example", display_name=f"S{i}")
            for i in range(STUDENTS)
        ]
        session.add_all(users)
        session.commit()
        return institution.id, place.id, [u.id for u in users]


def test_only_one_student_gets_the_last_spot(engine: Engine):
    institution_id, place_id, user_ids = _build_campus(engine)
    code = make_code(place_id, 1, TEST_CODE_SECRET)
    start_together = threading.Barrier(STUDENTS)
    outcomes: list[str] = []
    lock = threading.Lock()

    def scan(user_id: int) -> None:
        with Session(engine) as session:
            user = session.get(User, user_id)
            start_together.wait()
            try:
                check_in(session, user, code, None, SUNDAY_10AM, TEST_CODE_SECRET)
                session.commit()
                outcome = "ok"
            except CheckInError as error:
                session.rollback()
                outcome = error.code
        with lock:
            outcomes.append(outcome)

    threads = [threading.Thread(target=scan, args=(uid,)) for uid in user_ids]
    try:
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=30)
        assert sorted(outcomes) == ["ok"] + ["place_full"] * (STUDENTS - 1)
    finally:
        with Session(engine) as session:
            session.execute(delete(Institution).where(Institution.id == institution_id))
            session.commit()
