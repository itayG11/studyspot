"""Finds the newest emailed sign-in code of an address, for the e2e test.

The development mailer prints codes to the server log, which the test
cannot read, and the database keeps only an HMAC of each code. Six digits
are a million values: trying them all against the stored HMAC takes about
a second. This is also why the HMAC needs a secret key: without one, a
leaked database would give every code away just as fast.

Run from backend/: python <this file> <email>
"""

import hmac
import sys

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.email_codes import code_key, hash_code
from app.models import EmailSignInCode

email = sys.argv[1]
settings = get_settings()
key = code_key(settings.jwt_secret_bytes())
with Session(create_engine(settings.database_url)) as db:
    stored = db.scalars(
        select(EmailSignInCode.code_hash)
        .where(EmailSignInCode.email == email)
        .order_by(EmailSignInCode.created_at.desc(), EmailSignInCode.id.desc())
        .limit(1)
    ).one()
for n in range(1_000_000):
    code = f"{n:06d}"
    if hmac.compare_digest(hash_code(key, email, code), stored):
        print(code)
        break
else:
    sys.exit("no code matches")
