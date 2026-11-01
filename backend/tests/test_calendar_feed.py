"""A calendar feed (wave 12): one secret address a calendar app subscribes
to, with the student's bookings and timetable. The app reads it again every
few hours, so a cancelled booking leaves the calendar by itself."""

from datetime import UTC, datetime, time, timedelta

import pytest
from conftest import SUNDAY_10AM, place_named
from sqlalchemy import select

from app.calendar_feed import WEEKS_AHEAD, build, feed_key, new_feed, user_for
from app.config import get_settings
from app.ics import Event, calendar, escape, fold
from app.models import (
    AuthProvider,
    Booking,
    BookingSource,
    BookingStatus,
    CalendarFeed,
    ClassSlot,
    User,
    UserIdentity,
)

KEY = feed_key(b"test-jwt-secret")


def book(session, user, place, start, status=BookingStatus.BOOKED, hours=1):
    booking = Booking(
        institution_id=user.institution_id, user_id=user.id, place_id=place.id, starts_at=start,
        ends_at=start + timedelta(hours=hours), status=status, source=BookingSource.ADVANCE,
    )
    session.add(booking)
    session.flush()
    return booking


def lesson(session, user, building, weekday=0, starts=time(10, 30), ends=time(12, 0), title="מבני נתונים"):
    row = ClassSlot(user_id=user.id, weekday=weekday, starts=starts, ends=ends, building_id=building.id, title=title)
    session.add(row)
    session.flush()
    return row


def unfold(text: str) -> list[str]:
    return text.replace("\r\n ", "").split("\r\n")


def events(text: str) -> list[dict[str, str]]:
    found, current = [], None
    for line in unfold(text):
        if line == "BEGIN:VEVENT":
            current = {}
        elif line == "END:VEVENT":
            found.append(current)
            current = None
        elif current is not None:
            name, _, value = line.partition(":")
            current[name] = value
    return found


# --- the format ---------------------------------------------------------------------


def test_text_is_escaped():
    assert escape("a,b;c\\d\ne") == "a\\,b\\;c\\\\d\\ne"
    assert escape("a\r\nb") == "a\\nb"


def test_a_long_line_is_folded_without_breaking_a_letter():
    line = "SUMMARY:" + "מקום ללמוד " * 20
    folded = fold(line)
    parts = folded.split("\r\n")
    assert all(len(p.encode()) <= 75 for p in parts)
    assert all(p.startswith(" ") for p in parts[1:])
    assert "".join(p[1:] if i else p for i, p in enumerate(parts)) == line  # every byte decodes: no letter cut


def test_a_calendar_is_crlf_and_complete():
    start = datetime(2026, 10, 12, 7, 0, tzinfo=UTC)
    text = calendar("StudySpot", [Event("x@getstudyspot.me", start, start + timedelta(hours=1), "חדר", "M", "")], start)
    assert text.startswith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n") and text.endswith("END:VCALENDAR\r\n")
    assert "\n" not in text.replace("\r\n", "")
    (event,) = events(text)
    assert (event["UID"], event["DTSTART"], event["DTEND"]) == ("x@getstudyspot.me", "20261012T070000Z", "20261012T080000Z")


# --- what is in it --------------------------------------------------------------------


def test_bookings_coming_and_recent_are_in_cancelled_are_not(session, braude, student):
    room = place_named(braude, "M", "M206")
    soon = book(session, student, room, SUNDAY_10AM + timedelta(days=1))
    here = book(session, student, room, SUNDAY_10AM - timedelta(days=2), BookingStatus.CHECKED_IN)
    book(session, student, room, SUNDAY_10AM + timedelta(days=2), BookingStatus.CANCELLED)
    book(session, student, room, SUNDAY_10AM - timedelta(days=9), BookingStatus.CHECKED_IN)  # too old
    uids = {e["UID"] for e in events(build(session, student, SUNDAY_10AM))}
    assert {u for u in uids if u.startswith("booking-")} == {
        f"booking-{soon.id}@getstudyspot.me", f"booking-{here.id}@getstudyspot.me"
    }


def test_an_attended_booking_stays_a_week_then_goes(session, braude, student):
    room = place_named(braude, "M", "M206")
    done = book(session, student, room, SUNDAY_10AM - timedelta(days=3), BookingStatus.COMPLETED)
    book(session, student, room, SUNDAY_10AM - timedelta(days=8), BookingStatus.COMPLETED)
    book(session, student, room, SUNDAY_10AM - timedelta(days=1), BookingStatus.NO_SHOW)
    assert [e["UID"] for e in events(build(session, student, SUNDAY_10AM))] == [f"booking-{done.id}@getstudyspot.me"]


def test_a_booking_says_where(session, braude, student):
    book(session, student, place_named(braude, "M", "M206"), SUNDAY_10AM + timedelta(days=1))
    (event,) = events(build(session, student, SUNDAY_10AM))
    assert "M206" in event["SUMMARY"] and "קומה" in event["LOCATION"]


def test_a_class_is_spread_over_the_coming_weeks(session, braude, student):
    building = next(b for b in braude.buildings if b.code == "M")
    row = lesson(session, student, building, weekday=0)  # Monday
    found = [e for e in events(build(session, student, SUNDAY_10AM)) if e["UID"].startswith("class-")]
    assert len(found) == WEEKS_AHEAD + 1  # the past week too
    assert found[0]["UID"] == f"class-{row.id}-20261005@getstudyspot.me"
    assert found[0]["SUMMARY"] == "מבני נתונים"


def test_a_class_keeps_its_local_hour_across_the_clock_change(session, braude, student):
    """Israel goes back an hour on 25.10.2026: 10:30 stays 10:30."""
    building = next(b for b in braude.buildings if b.code == "M")
    lesson(session, student, building, weekday=0)
    starts = {e["DTSTART"] for e in events(build(session, student, SUNDAY_10AM)) if e["UID"].startswith("class-")}
    assert "20261019T073000Z" in starts  # summer: UTC+3
    assert "20261026T083000Z" in starts  # winter: UTC+2


def test_a_class_somewhere_not_on_the_map_says_its_name(session, braude, student):
    row = ClassSlot(user_id=student.id, weekday=1, starts=time(8), ends=time(9), place_text="אולם ספורט")
    session.add(row)
    session.flush()
    event = next(e for e in events(build(session, student, SUNDAY_10AM)) if e["UID"].startswith("class-"))
    assert event["LOCATION"] == "אולם ספורט" and event["SUMMARY"] == "שיעור"


def test_only_your_own(session, braude, student):
    other = User(institution_id=braude.id, email="other@braude.example", display_name="O")
    session.add(other)
    session.flush()
    book(session, other, place_named(braude, "M", "M206"), SUNDAY_10AM + timedelta(days=1))
    assert events(build(session, student, SUNDAY_10AM)) == []


# --- the token ---------------------------------------------------------------------------


def test_only_a_hash_of_the_token_is_kept(session, student):
    token = new_feed(session, student, SUNDAY_10AM, KEY)
    row = session.get(CalendarFeed, student.id)
    assert token not in row.token_hash and len(token) >= 40
    assert user_for(session, token, SUNDAY_10AM, KEY) == student


def test_a_new_token_ends_the_old_one(session, student):
    old = new_feed(session, student, SUNDAY_10AM, KEY)
    new = new_feed(session, student, SUNDAY_10AM, KEY)
    assert user_for(session, old, SUNDAY_10AM, KEY) is None
    assert user_for(session, new, SUNDAY_10AM, KEY) == student


def test_a_new_token_over_an_unseen_row_does_not_fail(session, student):
    """Two tabs at once: the second insert meets the first one's row."""
    session.add(CalendarFeed(user_id=student.id, token_hash="0" * 64, created_at=SUNDAY_10AM))
    session.flush()
    token = new_feed(session, student, SUNDAY_10AM, KEY)
    assert user_for(session, token, SUNDAY_10AM, KEY) == student
    assert len(session.scalars(select(CalendarFeed)).all()) == 1


def test_reading_is_marked_at_most_once_an_hour(session, student):
    token = new_feed(session, student, SUNDAY_10AM, KEY)
    user_for(session, token, SUNDAY_10AM, KEY)
    user_for(session, token, SUNDAY_10AM + timedelta(minutes=30), KEY)
    assert session.get(CalendarFeed, student.id).last_read_at == SUNDAY_10AM
    user_for(session, token, SUNDAY_10AM + timedelta(hours=2), KEY)
    assert session.get(CalendarFeed, student.id).last_read_at == SUNDAY_10AM + timedelta(hours=2)


def test_it_goes_with_the_account(session, student):
    new_feed(session, student, SUNDAY_10AM, KEY)
    session.delete(student)
    session.flush()
    session.expire_all()
    assert session.scalars(select(CalendarFeed)).all() == []


# --- the endpoints -------------------------------------------------------------------------


def feed_url_token(url: str) -> str:
    assert url.startswith(get_settings().public_api_url.rstrip("/") + "/calendar.ics?t=")
    return url.split("?t=", 1)[1]


def test_the_whole_way(client, session, braude, student):
    assert client.get("/me/calendar").json() == {"active": False, "url": None, "created_at": None, "last_read_at": None}
    made = client.post("/me/calendar")
    assert made.status_code == 201, made.text
    token = feed_url_token(made.json()["url"])
    assert client.get("/me/calendar").json()["url"] is None  # shown once
    book(session, student, place_named(braude, "M", "M206"), SUNDAY_10AM + timedelta(days=1))
    client.user = None  # a calendar app has no cookie
    feed = client.get("/calendar.ics", params={"t": token})
    assert feed.status_code == 200
    assert feed.headers["content-type"] == "text/calendar; charset=utf-8"
    assert feed.headers["x-robots-tag"] == "noindex"
    assert "private" in feed.headers["cache-control"]
    assert "M206" in feed.text
    client.user = student
    assert client.get("/me/calendar").json()["last_read_at"] is not None
    assert client.delete("/me/calendar").status_code == 204
    client.user = None
    assert client.get("/calendar.ics", params={"t": token}).status_code == 404


@pytest.mark.parametrize("params", [{"t": "x" * 43}, {}, {"t": ""}, {"t": "x" * 300}])
def test_a_wrong_token_finds_nothing(client, params):
    client.user = None
    assert client.get("/calendar.ics", params=params).status_code in (404, 422)


def test_signed_out_cannot_make_one(client):
    client.user = None
    assert client.post("/me/calendar").status_code == 401


def test_the_shared_demo_student_cannot(client, session, student):
    session.add(UserIdentity(user_id=student.id, provider=AuthProvider.DEMO, subject="demo"))
    session.flush()
    refused = client.post("/me/calendar")
    assert (refused.status_code, refused.json()["detail"]) == (403, "calendar_demo_account")


def test_one_feed_is_limited_per_token(client):
    from app.ratelimit import CALENDAR_PER_TOKEN

    client.user = None
    codes = [client.get("/calendar.ics", params={"t": "y" * 43}).status_code for _ in range(CALENDAR_PER_TOKEN + 1)]
    assert codes[-1] == 429 and 429 not in codes[:-1]
    # Another token from the same address is not held back by it: a calendar
    # service reads many people's feeds from a few addresses.
    assert client.get("/calendar.ics", params={"t": "z" * 43}).status_code == 404


def test_many_feeds_from_one_address_are_not_refused_early(client):
    client.user = None
    codes = [client.get("/calendar.ics", params={"t": f"{n:043d}"}).status_code for n in range(150)]
    assert set(codes) == {404}




def test_signing_out_everywhere_ends_the_feed(client, session, student):
    """After a lost phone: "out everywhere" must not leave the timetable readable."""
    token = feed_url_token(client.post("/me/calendar").json()["url"])
    assert client.post("/auth/logout-all").status_code == 204
    client.user = None
    assert client.get("/calendar.ics", params={"t": token}).status_code == 404
