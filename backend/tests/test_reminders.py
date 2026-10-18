"""Booking reminders (wave 10): ten minutes before a booking starts, and
five minutes after, if the student has not checked in, a warning that the
place is released at fifteen. Each once at most, only to users with a
browser subscribed, and the background sweep wakes up for them."""

from datetime import timedelta

import httpx
from conftest import SUNDAY_10AM, place_named
from test_push import Browser, subscribe

from app.bookings import NO_SHOW_AFTER
from app.models import Booking, BookingSource, BookingStatus
from app.notify import PushSender, vapid_key
from app.reminders import RELEASE_WARNING_AFTER, START_AHEAD, Alarm, next_due, send_reminders

START = SUNDAY_10AM + timedelta(hours=1)  # 11:00 in Israel


def book(session, braude, user, starts=START, status=BookingStatus.BOOKED):
    room = place_named(braude, "EM", "EM107")
    row = Booking(
        institution_id=braude.id, user_id=user.id, place_id=room.id, starts_at=starts,
        ends_at=starts + timedelta(hours=1), status=status, source=BookingSource.ADVANCE,
    )
    session.add(row)
    session.flush()
    return row


def push(seen):
    def handle(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(201)

    return PushSender(httpx.Client(transport=httpx.MockTransport(handle)), vapid_key(b"x" * 32), "https://site.example")


def test_ten_minutes_before_the_start_once(session, braude, student):
    browser, seen = Browser(), []
    subscribe(session, student, browser)
    booking = book(session, braude, student)
    send_reminders(session, push(seen), START - START_AHEAD - timedelta(minutes=1))
    assert seen == []  # not yet
    send_reminders(session, push(seen), START - START_AHEAD)
    send_reminders(session, push(seen), START - START_AHEAD + timedelta(minutes=1))
    [request] = seen
    message = browser.read(request.content)
    assert "EM107" in message["body"] and "11:00" in message["body"]  # local time
    assert booking.reminded_start_at is not None


def test_a_warning_before_the_place_is_released(session, braude, student):
    browser, seen = Browser(), []
    subscribe(session, student, browser)
    booking = book(session, braude, student)
    booking.reminded_start_at = START - START_AHEAD
    send_reminders(session, push(seen), START + RELEASE_WARNING_AFTER)
    [request] = seen
    assert "11:15" in browser.read(request.content)["body"]  # released at the start + 15 minutes
    assert RELEASE_WARNING_AFTER < NO_SHOW_AFTER


def test_no_warning_once_checked_in_or_cancelled(session, braude, student):
    seen = []
    subscribe(session, student, Browser())
    book(session, braude, student, status=BookingStatus.CHECKED_IN)
    book(session, braude, student, starts=START + timedelta(hours=2), status=BookingStatus.CANCELLED)
    send_reminders(session, push(seen), START + RELEASE_WARNING_AFTER)
    send_reminders(session, push(seen), START + timedelta(hours=2) - START_AHEAD)
    assert seen == []


def test_a_reminder_too_late_is_not_sent(session, braude, student):
    """The server slept through it: a reminder after the start is no use."""
    seen = []
    subscribe(session, student, Browser())
    book(session, braude, student)
    send_reminders(session, push(seen), START + NO_SHOW_AFTER)
    assert seen == []


def test_without_a_subscribed_browser_nothing_is_marked(session, braude, student):
    booking = book(session, braude, student)
    send_reminders(session, push([]), START - START_AHEAD)
    assert booking.reminded_start_at is None


def test_the_next_reminder_time(session, braude, student):
    assert next_due(session, SUNDAY_10AM) is None  # no subscriber, nothing to wake for
    subscribe(session, student, Browser())
    booking = book(session, braude, student)
    assert next_due(session, SUNDAY_10AM) == START - START_AHEAD
    booking.reminded_start_at = START - START_AHEAD
    session.flush()
    assert next_due(session, SUNDAY_10AM) == START + RELEASE_WARNING_AFTER
    booking.reminded_release_at = START + RELEASE_WARNING_AFTER
    session.flush()
    assert next_due(session, SUNDAY_10AM) is None


def test_the_alarm_keeps_the_earliest_and_rings_on_time():
    alarm = Alarm()
    assert not alarm.due(START)
    alarm.earliest(START + timedelta(minutes=5))
    alarm.earliest(START)
    alarm.earliest(START + timedelta(minutes=9))
    assert not alarm.due(START - timedelta(seconds=1))
    assert alarm.due(START)
    alarm.set(None)
    assert not alarm.due(START + timedelta(days=1))


def test_after_a_round_the_next_reminder_is_never_in_the_past(session, braude, student):
    """Otherwise the alarm stays due and wakes the database every minute."""
    subscribe(session, student, Browser())
    book(session, braude, student)
    moments = [START - START_AHEAD, START - timedelta(seconds=1), START, START + RELEASE_WARNING_AFTER,
               START + NO_SHOW_AFTER - timedelta(seconds=1), START + NO_SHOW_AFTER]
    for now in moments:
        send_reminders(session, push([]), now)
        ahead = next_due(session, now)
        assert ahead is None or ahead > now, now


def test_a_warning_past_the_start_also_closes_the_start_reminder(session, braude, student):
    subscribe(session, student, Browser())
    booking = book(session, braude, student)
    send_reminders(session, push([]), START + RELEASE_WARNING_AFTER)  # the server slept through the first
    assert booking.reminded_release_at is not None and booking.reminded_start_at is not None


def test_without_push_nothing_is_sent_or_marked(session, braude, student):
    subscribe(session, student, Browser())
    booking = book(session, braude, student)
    assert send_reminders(session, None, START - START_AHEAD) == 0
    assert booking.reminded_start_at is None


def test_the_alarm_keeps_a_sooner_time_set_during_a_sweep():
    alarm = Alarm()
    alarm.earliest(START)  # a booking made while the sweep was reading
    alarm.settle(START + timedelta(hours=2), START - timedelta(hours=1))
    assert alarm.due(START)
    alarm.settle(None, START + timedelta(minutes=1))  # that time has passed: the database's answer wins
    assert not alarm.due(START + timedelta(days=1))


def test_a_reminder_by_email_when_there_is_no_browser(session, braude, student):
    from test_email_notices import FakeMailer, channel

    student.email_verified, student.email_notices = True, True
    booking = book(session, braude, student)
    assert next_due(session, SUNDAY_10AM) == START - START_AHEAD  # the alarm counts email users too
    email = channel(FakeMailer())
    assert send_reminders(session, None, START - START_AHEAD, email) == 1
    [(to, _subject, text, _headers)] = email.mailer.sent
    assert to == student.email and "11:00" in text
    assert booking.reminded_start_at is not None
