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

from sqlalchemy.engine import make_url

url = get_settings().database_url
# For the test database only: never the live site's, whatever .env says.
if make_url(url).host not in ("localhost", "127.0.0.1"):
    raise SystemExit(f"refusing to reset a database that is not local: {make_url(url).host}")

with Session(create_engine(url)) as db:
    print(reset_demo_extras(db, "demo"))
    demo = db.scalars(select(Institution).where(Institution.slug == "demo")).one()
    simulate_history(db, demo, datetime.now(ZoneInfo(demo.timezone)).date())
    db.commit()
