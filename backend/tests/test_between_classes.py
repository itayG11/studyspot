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


_bookers = iter(range(1, 10_000))


def booking_for(session, braude, place, start, end, seat=None, user=None):
    if user is None:
        n = next(_bookers)
        user = User(institution_id=braude.id, email=f"b{n}@braude.example", display_name=f"B{n}")
        session.add(user)
        session.flush()
    session.add(Booking(institution_id=braude.id, user_id=user.id, place_id=place.id, seat_id=seat.id if seat else None,
                        starts_at=start, ends_at=end, status=BookingStatus.BOOKED, source=BookingSource.ADVANCE))
    session.flush()


def test_a_lab_with_every_seat_booked_is_not_suggested(session, braude, student):
    # Few people are in it now, but every seat is booked for the gap.
    add(session, student, braude, time(8, 30), time(10), "M")
    add(session, student, braude, time(11, 30), time(13), "M")
    lab = place_named(braude, "M", "M206")
    for seat in lab.seats:
        booking_for(session, braude, lab, SUNDAY_10AM, SUNDAY_10AM + timedelta(hours=2), seat=seat)
    names = [s.name for s in suggest(session, student, SUNDAY_10AM).gaps[0].suggestions]
    assert "M206" not in names


def test_booked_seats_count_against_what_is_free(session, braude, student):
    add(session, student, braude, time(8, 30), time(10), "M")
    add(session, student, braude, time(11, 30), time(13), "M")
    lab = place_named(braude, "M", "M206")
    for seat in lab.seats[:3]:
        booking_for(session, braude, lab, SUNDAY_10AM + timedelta(minutes=30), SUNDAY_10AM + timedelta(hours=1), seat=seat)
    [lab_suggestion] = [s for s in suggest(session, student, SUNDAY_10AM).gaps[0].suggestions if s.name == "M206"] or [None]
    if lab_suggestion is not None:
        assert lab_suggestion.available == lab.capacity - 3


def test_a_place_full_for_part_of_the_time_is_not_suggested(session, braude, student):
    # Empty at 14:30, full from 15:00: the whole stay counts, not its start.
    add(session, student, braude, time(13), time(14, 30), "EF")
    add(session, student, braude, time(16), time(17), "EF")
    library = place_named(braude, "EF", "ספרייה")
    for weeks_ago in (1, 2):
        for minutes in range(30, 90, 15):  # 15:00 to 15:45, local
            moment = SUNDAY_10AM - timedelta(weeks=weeks_ago) + timedelta(hours=5, minutes=minutes - 30)
            session.add(OccupancyHistory(place_id=library.id, slot_start=moment, people=library.capacity))
    session.flush()
    assert "ספרייה" not in [s.name for s in suggest(session, student, SUNDAY_10AM).gaps[0].suggestions]


def test_a_room_is_judged_by_its_bookings_not_its_history(session, braude, student):
    add(session, student, braude, time(13), time(14, 30), "EM")
    add(session, student, braude, time(16), time(17), "EM")
    room = place_named(braude, "EM", "EM107")
    for weeks_ago in (1, 2):
        for quarter in range(6):
            moment = SUNDAY_10AM - timedelta(weeks=weeks_ago) + timedelta(hours=4, minutes=30 + 15 * quarter)
            session.add(OccupancyHistory(place_id=room.id, slot_start=moment, people=1))
    session.flush()
    assert "EM107" in [s.name for s in suggest(session, student, SUNDAY_10AM).gaps[0].suggestions]


def test_with_no_bookings_left_a_free_room_is_not_offered_as_bookable(session, braude, student):
    add(session, student, braude, time(8, 30), time(10), "EM")
    add(session, student, braude, time(11, 30), time(13), "EM")
    lab = place_named(braude, "M", "M206")
    for day in (1, 2):  # two bookings already: the quota
        booking_for(session, braude, lab, SUNDAY_10AM + timedelta(days=day), SUNDAY_10AM + timedelta(days=day, hours=1),
                    seat=lab.seats[0], user=student)
    rooms = [s for s in suggest(session, student, SUNDAY_10AM).gaps[0].suggestions if s.kind == "group_room"]
    assert rooms and all(not s.bookable for s in rooms)


def test_the_order_is_the_same_every_time(session, braude, student):
    week(session, student, braude)
    first = [s.place_id for s in suggest(session, student, SUNDAY_10AM).gaps[0].suggestions]
    assert all([s.place_id for s in suggest(session, student, SUNDAY_10AM).gaps[0].suggestions] == first for _ in range(3))


def test_the_limit_is_per_student_not_per_campus_address(client, session, braude, student):
    # A whole campus can share one address: one student's limit is theirs.
    from app.ratelimit import BETWEEN_PER_MINUTE

    for _ in range(BETWEEN_PER_MINUTE):
        client.get("/me/between-classes")
    other = User(institution_id=braude.id, email="next@braude.example", display_name="N")
    session.add(other)
    session.flush()
    client.user = other
    assert client.get("/me/between-classes").status_code == 200


MONDAY, FRIDAY, SATURDAY = 0, 4, 5


def test_a_gap_on_another_day_gets_places_by_the_forecast(session, braude, student):
    # Sunday 10:00; the student looks at Monday's gap.
    add(session, student, braude, time(8, 30), time(10), "M", weekday=MONDAY)
    add(session, student, braude, time(11, 30), time(13), "EF", weekday=MONDAY)
    result = suggest(session, student, SUNDAY_10AM, weekday=MONDAY)
    assert (result.weekday, result.date.isoformat()) == (MONDAY, "2026-10-12")
    [gap] = result.gaps
    assert (gap.starts, gap.now) == (time(10), False)
    assert len(gap.suggestions) == 3
    # Not a live count: tomorrow's people are not here yet.
    assert all(s.available is None for s in gap.suggestions)
    assert gap.suggestions[0].sit_from.date().isoformat() == "2026-10-12"


def test_who_is_in_a_place_now_does_not_change_another_day(session, braude, student):
    add(session, student, braude, time(8, 30), time(10), "EF", weekday=MONDAY)
    add(session, student, braude, time(11, 30), time(13), "EF", weekday=MONDAY)
    before = [s.name for s in suggest(session, student, SUNDAY_10AM, weekday=MONDAY).gaps[0].suggestions]
    library = place_named(braude, "EF", "ספרייה")
    for n in range(library.capacity):  # full right now, on Sunday
        user = User(institution_id=braude.id, email=f"f{n}@braude.example", display_name=f"F{n}")
        session.add(user)
        session.flush()
        session.add(CheckIn(institution_id=braude.id, user_id=user.id, place_id=library.id,
                            started_at=SUNDAY_10AM - timedelta(minutes=5), expires_at=SUNDAY_10AM + timedelta(hours=2)))
    session.flush()
    assert [s.name for s in suggest(session, student, SUNDAY_10AM, weekday=MONDAY).gaps[0].suggestions] == before
    assert "ספרייה" in before


def test_the_day_the_clocks_go_back_is_read_in_its_own_offset(session, braude, student):
    # Israel goes back to winter time on Sunday 25 October 2026.
    from datetime import datetime
    from zoneinfo import ZoneInfo

    add(session, student, braude, time(8, 30), time(10), "M")
    add(session, student, braude, time(11, 30), time(13), "EF")
    saturday = datetime(2026, 10, 24, 12, tzinfo=ZoneInfo("Asia/Jerusalem"))
    [gap] = suggest(session, student, saturday, weekday=SUNDAY).gaps
    assert gap.suggestions[0].sit_from.astimezone(ZoneInfo("Asia/Jerusalem")).utcoffset() == timedelta(hours=2)


def test_today_by_its_number_is_today(session, braude, student):
    week(session, student, braude)
    assert suggest(session, student, SUNDAY_10AM, weekday=SUNDAY).gaps[0].now is True


def test_a_day_the_campus_is_closed_has_nowhere(session, braude, student):
    add(session, student, braude, time(9), time(10), "M", weekday=SATURDAY)
    add(session, student, braude, time(11), time(12), "M", weekday=SATURDAY)
    [gap] = suggest(session, student, SUNDAY_10AM, weekday=SATURDAY).gaps
    assert gap.suggestions == []


def test_a_room_booked_on_that_date_is_not_suggested(session, braude, student):
    add(session, student, braude, time(8, 30), time(10), "EM", weekday=MONDAY)
    add(session, student, braude, time(11, 30), time(13), "EM", weekday=MONDAY)
    room = place_named(braude, "EM", "EM107")
    other = User(institution_id=braude.id, email="o@braude.example", display_name="O")
    session.add(other)
    session.flush()
    monday_10 = SUNDAY_10AM + timedelta(days=1)
    session.add(Booking(institution_id=braude.id, user_id=other.id, place_id=room.id, starts_at=monday_10,
                        ends_at=monday_10 + timedelta(hours=1), status=BookingStatus.BOOKED, source=BookingSource.ADVANCE))
    session.flush()
    names = [s.name for s in suggest(session, student, SUNDAY_10AM, weekday=MONDAY).gaps[0].suggestions]
    assert "EM107" not in names
    # The same room is free the same hour on Sunday's own gap.
    add(session, student, braude, time(8, 30), time(10), "EM")
    add(session, student, braude, time(11, 30), time(13), "EM")
    assert "EM107" in [s.name for s in suggest(session, student, SUNDAY_10AM).gaps[0].suggestions]


def test_beyond_the_booking_horizon_nothing_is_offered_as_bookable(session, braude, student):
    # Friday is five days away: further than a booking may start.
    add(session, student, braude, time(8), time(9), "EM", weekday=FRIDAY)
    add(session, student, braude, time(10, 30), time(11, 30), "EM", weekday=FRIDAY)
    [gap] = suggest(session, student, SUNDAY_10AM, weekday=FRIDAY).gaps
    assert any(s.kind == "group_room" for s in gap.suggestions)
    assert not any(s.bookable for s in gap.suggestions)
    # The same week on Monday, within reach: the room is bookable.
    add(session, student, braude, time(8), time(9), "EM", weekday=MONDAY)
    add(session, student, braude, time(10, 30), time(11, 30), "EM", weekday=MONDAY)
    [monday] = suggest(session, student, SUNDAY_10AM, weekday=MONDAY).gaps
    assert any(s.bookable for s in monday.suggestions)


def test_the_endpoint_takes_a_day(client, session, braude, student):
    add(session, student, braude, time(8, 30), time(10), "M", weekday=MONDAY)
    add(session, student, braude, time(11, 30), time(13), "EF", weekday=MONDAY)
    body = client.get("/me/between-classes", params={"weekday": MONDAY}).json()
    assert (body["weekday"], body["date"], body["gaps"][0]["now"]) == (MONDAY, "2026-10-12", False)
    assert client.get("/me/between-classes", params={"weekday": 7}).status_code == 422
    assert client.get("/me/between-classes").json()["date"] == "2026-10-11"
