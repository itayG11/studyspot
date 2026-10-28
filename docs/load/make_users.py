"""Creates N throw-away students in the LOCAL demo campus and prints their
access tokens as JSON, for the booking race in loadtest.py (a real crowd is
many accounts, not one). Run from backend/ with the same environment as the
server:  python ../docs/load/make_users.py 100 > /tmp/tokens.json

Tokens last a few minutes: run the race right after. The users stay in the
local test database only.
"""

import json
import sys
from datetime import UTC, datetime

from sqlalchemy import select

from app.config import get_settings
from app.db import SessionLocal, get_engine
from app.models import Institution, User
from app.models.people import UserRole
from app.sessions import access_token, start_session


def main(count: int) -> None:
    settings = get_settings()
    now = datetime.now(UTC)
    tokens = []
    with SessionLocal(bind=get_engine()) as db:
        institution = db.scalars(select(Institution).where(Institution.slug == settings.demo_institution)).one()
        for n in range(count):
            email = f"loadtest.{n}@studyspot.invalid"
            user = db.scalars(select(User).where(User.email == email, User.institution_id == institution.id)).first()
            if user is None:
                user = User(institution_id=institution.id, email=email, display_name=f"Load {n}", role=UserRole.STUDENT)
                db.add(user)
                db.flush()
            issued = start_session(db, user, now)
            tokens.append(access_token(user, issued.session, now, settings.jwt_secret_bytes()))
        db.commit()
    json.dump(tokens, sys.stdout)


main(int(sys.argv[1]))
