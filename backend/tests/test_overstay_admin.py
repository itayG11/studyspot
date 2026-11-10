"""Wave 19.3: the institution's side of "someone stayed after their time".

An institution chooses how much of it is on (none, reminders, reports), reads
the reports as a count by place and hour, and closes them. It sees places,
never people: no answer here names the one who reported or the one who stayed.
"""

from datetime import timedelta
from zoneinfo import ZoneInfo

import pytest
from conftest import SUNDAY_10AM, code_for, place_named
from factories import make_institution, make_user
from sqlalchemy import select
from test_push import Browser, subscribe
from test_reminders import push

from app.config import Settings, get_settings
from app.main import app
from app.models import (
    Booking,
    BookingSource,
    BookingStatus,
    CheckIn,
    CheckInEndReason,
    Institution,
    OccupancyReport,
    ReportResolution,
    ReportStatus,
    User,
    UserRole,
    WebhookDelivery,
    WebhookEndpoint,
)
from app.reminders import END_AHEAD, send_reminders

NOW = SUNDAY_10AM


@pytest.fixture
def admin(session, braude) -> User:
    user = User(institution_id=braude.id, email="admin@braude.example", display_name="Admin", role=UserRole.INSTITUTION_ADMIN)
    session.add(user)
    session.flush()
    return user


@pytest.fixture
def reporter(session, braude) -> User:
    return make_user(session, braude, "reporter@braude.example")


def room(braude):
    return place_named(braude, "EM", "EM107")


def a_report(session, braude, reporter, *, place=None, at=NOW, seat=None, status=ReportStatus.OPEN, resolution=None):
    row = OccupancyReport(
        institution_id=braude.id, place_id=(place or room(braude)).id, seat_id=seat.id if seat else None,
        booking_id=None, reporter_id=reporter.id, created_at=at, status=status, resolution=resolution,
        resolved_at=at if status == ReportStatus.RESOLVED else None,
    )
    session.add(row)
    session.flush()
    return row


def keys(value) -> set[str]:
    """Every key anywhere in an answer, to prove no name or person is in it."""
    found = set()
    if isinstance(value, dict):
        for key, item in value.items():
            found.add(key)
            found |= keys(item)
    elif isinstance(value, list):
        for item in value:
            found |= keys(item)
    return found


# --- The settings ----------------------------------------------------------------------------


def test_the_defaults_are_reminders_five_minutes_grace_and_a_twenty_minute_break(client, braude, admin):
    client.user = admin
    body = client.get("/admin/institutions/braude/overstay").json()
    assert body == {"policy": "reminders", "grace_minutes": 5, "break_minutes": 20, "locked": False, "open_reports": 0}


def test_an_admin_changes_them_and_they_stay(client, session, braude, admin):
    client.user = admin
    response = client.patch("/admin/institutions/braude/overstay", json={"policy": "reports", "grace_minutes": 3, "break_minutes": 10})
    assert response.status_code == 200 and response.json()["policy"] == "reports"
    session.refresh(braude)
    assert (braude.overstay_policy, braude.grace_minutes, braude.break_minutes) == ("reports", 3, 10)


@pytest.mark.parametrize("body", [{"grace_minutes": 16}, {"grace_minutes": -1}, {"break_minutes": 61}, {"policy": "everything"}, {"colour": "red"}])
def test_values_out_of_range_or_unknown_are_refused(client, braude, admin, body):
    client.user = admin
    assert client.patch("/admin/institutions/braude/overstay", json=body).status_code == 422


def test_a_student_cannot_read_or_change_them(client, braude, student):
    assert client.get("/admin/institutions/braude/overstay").status_code == 403
    assert client.patch("/admin/institutions/braude/overstay", json={"policy": "none"}).status_code == 403


def test_an_admin_of_another_institution_gets_a_404(client, session, braude):
    other = make_institution(session, "other-college")
    client.user = User(institution_id=other.id, email="a@o.example", display_name="A", role=UserRole.INSTITUTION_ADMIN)
    assert client.get("/admin/institutions/braude/overstay").status_code == 404
    assert client.patch("/admin/institutions/braude/overstay", json={"policy": "none"}).status_code == 404


def test_the_demo_campus_can_be_read_but_not_changed(client, session, admin):
    demo = make_institution(session, "demo")
    admin.institution_id = demo.id
    app.dependency_overrides[get_settings] = lambda: Settings(demo_login_enabled=True)
    client.user = admin
    try:
        assert client.get("/admin/institutions/demo/overstay").json()["locked"] is True
        assert client.patch("/admin/institutions/demo/overstay", json={"policy": "none"}).status_code == 403
    finally:
        app.dependency_overrides.pop(get_settings, None)


def test_the_public_institution_says_which_policy_it_has(client, session, braude):
    assert client.get("/institutions/braude").json()["overstay_policy"] == "reminders"
    braude.overstay_policy = "reports"
    session.flush()
    assert client.get("/institutions/braude").json()["overstay_policy"] == "reports"


# --- What each level switches on -------------------------------------------------------------


def stay_that_ran_out(session, braude, user):
    ended = NOW - timedelta(minutes=2)
    gone = Booking(
        institution_id=braude.id, user_id=user.id, place_id=room(braude).id, starts_at=ended - timedelta(hours=1),
        ends_at=ended, status=BookingStatus.COMPLETED, source=BookingSource.ADVANCE,
    )
    session.add(gone)
    session.flush()
    session.add(CheckIn(
        institution_id=braude.id, user_id=user.id, place_id=room(braude).id, booking_id=gone.id,
        started_at=ended - timedelta(hours=1), expires_at=ended, ended_at=ended, end_reason=CheckInEndReason.EXPIRED,
    ))
    session.flush()


def waiting_booking(session, braude, user):
    row = Booking(
        institution_id=braude.id, user_id=user.id, place_id=room(braude).id, starts_at=NOW + timedelta(minutes=5),
        ends_at=NOW + timedelta(hours=1, minutes=5), status=BookingStatus.BOOKED, source=BookingSource.ADVANCE,
    )
    session.add(row)
    session.flush()
    return row


def test_with_everything_off_nothing_is_marked_and_no_break_is_offered(client, session, braude, student, reporter):
    braude.overstay_policy = "none"
    session.flush()
    stay_that_ran_out(session, braude, reporter)
    assert client.get(f"/places/{room(braude).id}").json()["maybe_still_taken"] is False
    session.add(Booking(
        institution_id=braude.id, user_id=student.id, place_id=room(braude).id, starts_at=NOW, ends_at=NOW + timedelta(hours=1),
        status=BookingStatus.BOOKED, source=BookingSource.ADVANCE,
    ))
    session.flush()
    stay = client.post("/check-ins", json={"code": code_for(room(braude))}).json()
    assert stay["can_break"] is False
    assert client.post(f"/check-ins/{stay['id']}/break").json() == {"detail": "break_disabled"}


def test_with_everything_off_there_is_no_ends_soon_reminder(client, session, braude, student):
    braude.overstay_policy = "none"
    session.flush()
    subscribe(session, student, Browser())
    session.add(Booking(
        institution_id=braude.id, user_id=student.id, place_id=room(braude).id, starts_at=NOW, ends_at=NOW + timedelta(hours=1),
        status=BookingStatus.CHECKED_IN, source=BookingSource.ADVANCE,
    ))
    session.flush()
    seen = []
    send_reminders(session, push(seen), NOW + timedelta(hours=1) - END_AHEAD)
    assert seen == []


def test_reminders_only_marks_and_offers_breaks_but_takes_no_reports(client, session, braude, student, reporter):
    stay_that_ran_out(session, braude, reporter)
    assert client.get(f"/places/{room(braude).id}").json()["maybe_still_taken"] is True
    response = client.post(f"/bookings/{waiting_booking(session, braude, student).id}/report-occupied")
    assert (response.status_code, response.json()) == (409, {"detail": "report_disabled"})
    assert session.query(OccupancyReport).count() == 0


def test_reports_takes_them(client, session, braude, student):
    braude.overstay_policy = "reports"
    session.flush()
    assert client.post(f"/bookings/{waiting_booking(session, braude, student).id}/report-occupied").status_code == 200


# --- The webhook -----------------------------------------------------------------------------


def endpoint(session, braude, events):
    row = WebhookEndpoint(
        institution_id=braude.id, url="https://hooks.example.edu/studyspot", events=list(events), active=True, created_at=NOW
    )
    session.add(row)
    session.flush()
    return row


def test_a_report_is_an_event_for_the_institutions_webhooks_without_any_person(client, session, braude, student):
    braude.overstay_policy = "reports"
    wanting = endpoint(session, braude, ["place.overstay_reported"])
    not_wanting = endpoint(session, braude, ["checkin.started"])
    booking = waiting_booking(session, braude, student)
    client.post(f"/bookings/{booking.id}/report-occupied")
    [delivery] = session.scalars(select(WebhookDelivery).where(WebhookDelivery.endpoint_id == wanting.id)).all()
    assert delivery.event_type == "place.overstay_reported"
    data = delivery.payload["data"]
    assert data["place"]["name"] == "EM107" and data["report"]["seat_id"] is None
    assert keys(data).isdisjoint({"reporter_id", "reporter", "user", "user_id", "email", "booking"})
    assert not session.scalars(select(WebhookDelivery).where(WebhookDelivery.endpoint_id == not_wanting.id)).all()


# --- Reading and closing the reports ---------------------------------------------------------


def test_the_list_names_places_never_people(client, session, braude, admin, reporter):
    client.user = admin
    a_report(session, braude, reporter)
    [item] = client.get("/admin/institutions/braude/reports?status=open").json()
    assert item["place_name"] == "EM107" and item["building_code"] == "EM" and item["status"] == "open"
    assert keys(item).isdisjoint({"reporter_id", "reporter", "user", "user_id", "email", "booking_id"})
    assert client.get("/admin/institutions/braude/overstay").json()["open_reports"] == 1


def test_the_list_can_be_open_or_resolved_and_newest_first(client, session, braude, admin, reporter):
    client.user = admin
    old = a_report(session, braude, reporter, at=NOW - timedelta(days=2))
    new = a_report(session, braude, reporter, at=NOW - timedelta(hours=1))
    done = a_report(session, braude, reporter, status=ReportStatus.RESOLVED, resolution=ReportResolution.HANDLED)
    assert [r["id"] for r in client.get("/admin/institutions/braude/reports?status=open").json()] == [new.id, old.id]
    assert [r["id"] for r in client.get("/admin/institutions/braude/reports?status=resolved").json()] == [done.id]
    assert client.get("/admin/institutions/braude/reports?status=nonsense").status_code == 422


def test_closing_a_report_remembers_how_and_when_and_only_once(client, session, braude, admin, reporter):
    client.user = admin
    row = a_report(session, braude, reporter)
    response = client.post(f"/admin/reports/{row.id}/resolve", json={"resolution": "nobody_there"})
    assert response.status_code == 200
    session.refresh(row)
    assert (row.status, row.resolution, row.resolved_at) == (ReportStatus.RESOLVED, ReportResolution.NOBODY_THERE, NOW)
    assert client.post(f"/admin/reports/{row.id}/resolve", json={"resolution": "handled"}).json() == {"detail": "report_already_closed"}


def test_a_student_or_another_institutions_admin_cannot_close_a_report(client, session, braude, student, reporter):
    row = a_report(session, braude, reporter)
    assert client.post(f"/admin/reports/{row.id}/resolve", json={"resolution": "handled"}).status_code == 403
    other = make_institution(session, "other-college")
    client.user = User(institution_id=other.id, email="a@o.example", display_name="A", role=UserRole.INSTITUTION_ADMIN)
    assert client.post(f"/admin/reports/{row.id}/resolve", json={"resolution": "handled"}).status_code == 404
    assert client.get("/admin/institutions/braude/reports").status_code == 404


# --- The heat table --------------------------------------------------------------------------


def test_the_heat_counts_by_place_weekday_and_hour_in_the_institutions_time(client, session, braude, admin, reporter):
    client.user = admin
    local = NOW.astimezone(ZoneInfo("Asia/Jerusalem"))  # Sunday 10:00, which is weekday 6 in Python
    a_report(session, braude, reporter, at=NOW)
    a_report(session, braude, reporter, at=NOW + timedelta(minutes=20))
    a_report(session, braude, reporter, at=NOW + timedelta(hours=1))
    cells = {(c["weekday"], c["hour"]): c["count"] for c in client.get("/admin/institutions/braude/reports/heat?days=30").json()["cells"]}
    assert cells == {(local.weekday(), 10): 2, (local.weekday(), 11): 1}


def test_old_reports_are_outside_the_window(client, session, braude, admin, reporter):
    client.user = admin
    a_report(session, braude, reporter, at=NOW - timedelta(days=40))
    assert client.get("/admin/institutions/braude/reports/heat?days=30").json()["cells"] == []
    assert client.get("/admin/institutions/braude/reports/heat?days=0").status_code == 422


def test_three_reports_in_a_week_for_a_place_make_a_recommendation(client, session, braude, admin, reporter):
    client.user = admin
    for hours in (1, 5, 30):
        a_report(session, braude, reporter, at=NOW - timedelta(hours=hours))
    [advice] = client.get("/admin/institutions/braude/reports/heat").json()["recommendations"]
    assert advice["place_name"] == "EM107" and advice["count"] == 3 and advice["kind"] == "shorten_booking"
    a_report(session, braude, reporter, place=place_named(braude, "L", "מתחם לימוד"), at=NOW)  # one is not a pattern
    assert len(client.get("/admin/institutions/braude/reports/heat").json()["recommendations"]) == 1


def test_a_lab_gets_a_different_recommendation_than_a_room(client, session, braude, admin, reporter):
    client.user = admin
    lab = next(p for b in braude.buildings for p in b.places if p.name == "M206")
    for hours in (1, 2, 3):
        a_report(session, braude, reporter, place=lab, seat=lab.seats[0], at=NOW - timedelta(hours=hours))
    [advice] = client.get("/admin/institutions/braude/reports/heat").json()["recommendations"]
    assert advice["kind"] == "add_sign"


def test_a_reporter_whose_reports_were_found_empty_three_times_stops_counting(client, session, braude, admin, reporter):
    client.user = admin
    for days in (1, 2, 3):
        a_report(session, braude, reporter, at=NOW - timedelta(days=days), status=ReportStatus.RESOLVED, resolution=ReportResolution.NOBODY_THERE)
    a_report(session, braude, reporter, at=NOW)
    heat = client.get("/admin/institutions/braude/reports/heat?days=30").json()
    assert heat["cells"] == [] and heat["recommendations"] == []
    assert len(client.get("/admin/institutions/braude/reports?status=open").json()) == 1  # still listed: nothing is hidden from the institution


def test_the_answer_has_no_person_in_it(client, session, braude, admin, reporter):
    client.user = admin
    a_report(session, braude, reporter)
    assert keys(client.get("/admin/institutions/braude/reports/heat").json()).isdisjoint({"reporter_id", "reporter", "user_id", "email"})


def test_the_database_has_the_policy_check(session, braude):
    import pytest as _pytest
    from sqlalchemy.exc import IntegrityError

    session.execute(Institution.__table__.update().where(Institution.id == braude.id).values(overstay_policy="reports"))
    with _pytest.raises(IntegrityError):
        session.execute(Institution.__table__.update().where(Institution.id == braude.id).values(overstay_policy="loud"))
        session.flush()
    session.rollback()


# --- The demo campus -------------------------------------------------------------------------


def test_the_demo_campus_shows_made_up_reports_and_has_reports_on(session):
    from datetime import date

    from app.seed import seed_demo
    from app.seed.reports import simulate_reports

    demo = seed_demo(session)
    made = simulate_reports(session, demo, date(2026, 11, 8))
    assert made > 0 and demo.overstay_policy == "reports"
    assert simulate_reports(session, demo, date(2026, 11, 8)) == made  # the same every time
    assert session.query(OccupancyReport).filter_by(institution_id=demo.id).count() == made
    rows = session.query(OccupancyReport).filter_by(institution_id=demo.id).all()
    assert any(r.status == ReportStatus.OPEN for r in rows) and any(r.status == ReportStatus.RESOLVED for r in rows)
    assert all(r.resolution != ReportResolution.NOBODY_THERE for r in rows)


def test_another_campus_gets_no_made_up_reports(session, braude):
    from datetime import date

    from app.seed.reports import simulate_reports

    assert simulate_reports(session, braude, date(2026, 11, 8)) == 0
    assert braude.overstay_policy == "reminders"


@pytest.mark.parametrize("day", range(8, 15))  # 8 to 14 Nov 2026: each weekday once
def test_the_demo_campus_shows_a_suggestion_on_any_day_at_any_hour(session, day):
    """The live demo showed the table but no suggestion on a Tuesday (10 Nov): the
    room's reports of the last week were left to chance, under the threshold."""
    from datetime import date, datetime, time
    from zoneinfo import ZoneInfo

    from app.overstay import heat
    from app.seed import seed_demo
    from app.seed.reports import simulate_reports

    demo = seed_demo(session)
    today = date(2026, 11, day)
    simulate_reports(session, demo, today)
    zone = ZoneInfo(demo.timezone)
    for hour in (time(0, 5), time(12, 0), time(23, 55)):
        _, advice = heat(session, demo, datetime.combine(today, hour, tzinfo=zone), 30)
        assert advice, f"no suggestion on {today} at {hour}"
