"""A place between classes: in each gap of today's timetable, up to three
places that are open the whole time, reachable on foot, and not full now
(or not usually full, for a gap later today)."""

from datetime import time, timedelta

from conftest import SUNDAY_10AM, place_named

from app.between_classes import MIN_GAP, MIN_SIT, find_gaps, suggest, walk_minutes
from app.models import Booking, BookingSource, BookingStatus, CheckIn, ClassSlot, OccupancyHistory, User

SUNDAY = 6


def building(institution, code):
    return next(b for b in institution.buildings if b.code == code)


def add(session, user, institution, starts, ends, code, weekday=SUNDAY):
    row = ClassSlot(user_id=user.id, weekday=weekday, starts=starts, ends=ends, building_id=building(institution, code).id)
    session.add(row)
    session.flush()
    return row


def week(session, student, braude):
    add(session, student, braude, time(8, 30), time(10), "M")
    add(session, student, braude, time(11, 30), time(13), "EF")
    add(session, student, braude, time(13, 10), time(14), "EF")  # ten minutes: not a gap


def test_walking_time_is_an_honest_estimate(braude):
    m, ef, p = (building(braude, c) for c in ("M", "EF", "P"))
    assert walk_minutes(m, m) == 1  # stairs and corridors
    assert walk_minutes(m, ef) == 2  # about 70 m apart
    assert 7 <= walk_minutes(m, p) <= 9  # about 480 m


def test_only_gaps_long_enough_and_not_over(session, braude, student):
    week(session, student, braude)
    classes = [c for c in session.query(ClassSlot).all()]
    gaps = find_gaps(classes, time(10))
    assert [(g.starts, g.ends) for g in gaps] == [(time(10), time(11, 30))]
    assert MIN_GAP == timedelta(minutes=30)
    assert find_gaps(classes, time(12)) == []  # the gap is over


def test_the_gap_under_way_gets_three_nearby_places_with_room(session, braude, student):
    week(session, student, braude)
    result = suggest(session, student, SUNDAY_10AM)
    [gap] = result.gaps
    assert (gap.from_building, gap.to_building, gap.now) == ("M", "EF", True)
    assert len(gap.suggestions) == 3
    # The far building (P) loses time walking: never ahead of the near ones.
    assert all(s.building_code != "P" for s in gap.suggestions)
    first = gap.suggestions[0]
    assert first.sit_minutes == (gap.ends_dt - first.sit_from).total_seconds() // 60 - first.walk_after
    assert all(s.sit_minutes >= MIN_SIT for s in gap.suggestions)
    assert all(s.available is not None for s in gap.suggestions if s.kind != "group_room")


def test_a_full_place_is_not_suggested_now(session, braude, student):
    week(session, student, braude)
    library = place_named(braude, "EF", "ספרייה")
    for n in range(library.capacity):
        user = User(institution_id=braude.id, email=f"f{n}@braude.example", display_name=f"F{n}")
        session.add(user)
        session.flush()
        session.add(CheckIn(institution_id=braude.id, user_id=user.id, place_id=library.id,
                            started_at=SUNDAY_10AM - timedelta(minutes=5), expires_at=SUNDAY_10AM + timedelta(hours=2)))
    session.flush()
    names = [s.name for s in suggest(session, student, SUNDAY_10AM).gaps[0].suggestions]
    assert "ספרייה" not in names


def test_a_booked_room_is_not_suggested(session, braude, student):
    add(session, student, braude, time(8, 30), time(10), "EM")
    add(session, student, braude, time(11, 30), time(13), "EM")
    room = place_named(braude, "EM", "EM107")
    other = User(institution_id=braude.id, email="o@braude.example", display_name="O")
    session.add(other)
    session.flush()
    session.add(Booking(institution_id=braude.id, user_id=other.id, place_id=room.id, starts_at=SUNDAY_10AM + timedelta(minutes=30),
                        ends_at=SUNDAY_10AM + timedelta(hours=1), status=BookingStatus.BOOKED, source=BookingSource.ADVANCE))
    session.flush()
    assert "EM107" not in [s.name for s in suggest(session, student, SUNDAY_10AM).gaps[0].suggestions]


def test_a_place_closing_during_the_gap_is_not_suggested(session, braude, student):
    # Everything closes at 20:00 on Sunday: a gap until 21:00 has nowhere.
    add(session, student, braude, time(18), time(19, 30), "M")
    add(session, student, braude, time(21), time(22), "M")
    [gap] = suggest(session, student, SUNDAY_10AM).gaps
    assert gap.suggestions == []


def test_a_later_gap_skips_places_usually_full_then(session, braude, student):
    add(session, student, braude, time(13), time(14, 30), "EF")
    add(session, student, braude, time(16), time(17), "EF")
    library = place_named(braude, "EF", "ספרייה")
    for weeks_ago in (1, 2):
        for minutes in range(0, 90, 15):
            moment = SUNDAY_10AM - timedelta(weeks=weeks_ago) + timedelta(hours=4, minutes=30 + minutes)
            session.add(OccupancyHistory(place_id=library.id, slot_start=moment, people=library.capacity))
    session.flush()
    [gap] = suggest(session, student, SUNDAY_10AM).gaps
    assert gap.now is False
    assert "ספרייה" not in [s.name for s in gap.suggestions]


def test_only_today_and_only_mine(session, braude, student):
    add(session, student, braude, time(8, 30), time(10), "M", weekday=0)  # Monday
    add(session, student, braude, time(11, 30), time(13), "M", weekday=0)
    other = User(institution_id=braude.id, email="o2@braude.example", display_name="O")
    session.add(other)
    session.flush()
    add(session, other, braude, time(8, 30), time(10), "M")
    add(session, other, braude, time(11, 30), time(13), "M")
    assert suggest(session, student, SUNDAY_10AM).gaps == []


def test_the_endpoint(client, session, braude, student):
    week(session, student, braude)
    body = client.get("/me/between-classes").json()
    [gap] = body["gaps"]
    assert (gap["starts"], gap["ends"], gap["now"]) == ("10:00:00", "11:30:00", True)
    assert len(gap["suggestions"]) == 3
    client.user = None
    assert client.get("/me/between-classes").status_code == 401


def test_opening_hours_are_read_in_local_time_during_a_gap_under_way(session, braude, student):
    # 07:15 local is 04:15 in UTC. Read in UTC, every place would look
    # closed (they open at 07:00); in local time they are open.
    add(session, student, braude, time(6), time(7, 10), "M")
    add(session, student, braude, time(8, 30), time(10), "M")
    morning = SUNDAY_10AM - timedelta(hours=2, minutes=45)
    assert suggest(session, student, morning).gaps[0].suggestions != []


def test_a_day_has_at_most_so_many_gaps(session, braude, student):
    from app.between_classes import MAX_GAPS

    for n in range(MAX_GAPS + 3):
        add(session, student, braude, time(6 + n, 0), time(6 + n, 5), "M")
    assert len(find_gaps(session.query(ClassSlot).all(), time(5))) == MAX_GAPS


def test_the_suggestions_are_rate_limited(client, session, braude, student):
    from app.ratelimit import BETWEEN_PER_MINUTE

    for _ in range(BETWEEN_PER_MINUTE):
        assert client.get("/me/between-classes").status_code == 200
    assert client.get("/me/between-classes").status_code == 429
