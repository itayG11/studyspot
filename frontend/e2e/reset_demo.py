"""Puts the demo campus back to its seed data, for the e2e tests that add
buildings and places, with the made-up history of the load forecast. The
live site does the same once a day.

Run from backend/: python <this file>
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select

from app.campus_admin import reset_demo_extras
from app.config import get_settings
from app.models import Institution
from app.seed.history import simulate_history

with Session(create_engine(get_settings().database_url)) as db:
    print(reset_demo_extras(db, "demo"))
    demo = db.scalars(select(Institution).where(Institution.slug == "demo")).one()
    simulate_history(db, demo, datetime.now(ZoneInfo(demo.timezone)).date())
    db.commit()
