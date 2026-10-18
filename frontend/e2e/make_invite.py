"""Creates a hidden test institution and an admin invite to it, for the e2e
test, and prints the invite link's token. The real way is the system
admin's page, which needs a real Google sign-in.

Run from backend/: python <this file>
"""

from datetime import UTC, datetime

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app import institutions
from app.config import get_settings
from app.models import Institution

SLUG = "e2e-invite"
settings = get_settings()
with Session(create_engine(settings.database_url)) as db:
    target = db.scalars(select(Institution).where(Institution.slug == SLUG)).first()
    if target is None:
        target = institutions.create_institution(db, "מוסד לבדיקה", SLUG, "Asia/Jerusalem")
    _, token = institutions.create_invite(
        db, target, created_by=None, now=datetime.now(UTC), key=institutions.invite_key(settings.jwt_secret_bytes())
    )
    db.commit()
print(token)
