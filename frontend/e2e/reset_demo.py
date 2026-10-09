"""Puts the demo campus back to its seed data, for the e2e tests that add
buildings and places. The live site does the same once a day.

Run from backend/: python <this file>
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.campus_admin import reset_demo_extras
from app.config import get_settings

with Session(create_engine(get_settings().database_url)) as db:
    print(reset_demo_extras(db, "demo"))
    db.commit()
