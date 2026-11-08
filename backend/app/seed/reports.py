"""Made-up reports for the demo campus, so a visitor who opens the institution's
screen sees the table and the advice working (wave 19.3). Remade with the daily
reset (app/campus_admin.py), labelled by a made-up reporter (simulated), and the
same every time (a fixed seed), so the tests can rely on it.

A guess at a pattern, not data: one room is taken often on Tuesday and
Thursday around noon, one lab seat now and then, the rest of the week is quiet.
Only "handled" reports are made: a reporter found empty three times stops
counting (app/overstay.py), and the demo should not teach that."""

import random
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import (
    Institution,
    OccupancyReport,
    OverstayPolicy,
    Place,
    PlaceKind,
    ReportResolution,
    ReportStatus,
    User,
)
from app.seed.demo import DEMO

DAYS = 14
OPEN_FOR = 3  # reports of the last days are still open; older ones were handled
HOT_DAYS = (1, 3)  # Tuesday and Thursday, in Python's numbering
REPORTER_EMAIL = "simulated-reporter@demo.invalid"


def simulate_reports(session: Session, institution: Institution, today: date) -> int:
    """Replaces the demo campus's made-up reports, and turns reports on there (the
    visitor's admin cannot: the demo is locked). Only the demo campus."""
    if institution.slug != DEMO["institution"]["slug"] or institution.login_rules:
        return 0
    institution.overstay_policy = OverstayPolicy.REPORTS
    session.execute(
        delete(OccupancyReport).where(
            OccupancyReport.institution_id == institution.id,
            OccupancyReport.reporter_id.in_(select(User.id).where(User.institution_id == institution.id, User.simulated)),
        )
    )
    places = session.scalars(select(Place).where(Place.institution_id == institution.id).order_by(Place.id)).all()
    room = next((p for p in places if p.kind == PlaceKind.GROUP_ROOM), None)
    lab = next((p for p in places if p.kind == PlaceKind.COMPUTER_LAB and p.seats), None)
    reporter = session.scalars(select(User).where(User.institution_id == institution.id, User.email == REPORTER_EMAIL)).first()
    if reporter is None:
        reporter = User(institution_id=institution.id, email=REPORTER_EMAIL, display_name="מדווח מדומה", simulated=True)
        session.add(reporter)
        session.flush()
    zone = ZoneInfo(institution.timezone)
    rng = random.Random("demo-reports")
    made = 0
    for back in range(1, DAYS + 1):
        day = today - timedelta(days=back)
        wanted = []
        if room is not None and day.weekday() in HOT_DAYS:
            wanted += [(room, None, rng.choice((12, 13, 13, 14)))] * rng.choice((1, 2))
        if lab is not None and rng.random() < 0.25:
            wanted.append((lab, rng.choice(lab.seats), rng.choice((9, 10, 15, 16))))
        for place, seat, hour in wanted:
            created = datetime.combine(day, time(hour, rng.choice((0, 10, 20, 40))), tzinfo=zone)
            old = back > OPEN_FOR
            session.add(OccupancyReport(
                institution_id=institution.id, place_id=place.id, seat_id=seat.id if seat else None, booking_id=None,
                reporter_id=reporter.id, created_at=created,
                status=ReportStatus.RESOLVED if old else ReportStatus.OPEN,
                resolution=ReportResolution.HANDLED if old else None,
                resolved_at=created + timedelta(hours=2) if old else None,
            ))
            made += 1
    session.flush()
    return made
