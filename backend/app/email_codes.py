"""One-time sign-in codes sent by email.

1. start: the address must belong to an institution's email login rule
   (its exact domain); otherwise no email is sent, so the site cannot be
   used to mail strangers. A random 6-digit code is made, its HMAC stored
   for 10 minutes, and the code emailed.
2. verify: only the newest code of the address counts. It works once, and
   after MAX_ATTEMPTS wrong tries not at all; the comparison is in
   constant time. Then the usual sign-in (app/accounts.py) runs, with the
   address as the identity and its domain as the institution key.

Limits: CODES_PER_ADDRESS_PER_HOUR and _PER_DAY keep one inbox from being
flooded and bound the guesses at one address;
CODES_PER_DAY keeps the whole site under the free email plan's quota.
"""

import hashlib
import hmac
import re
import secrets
from datetime import datetime, timedelta

from sqlalchemy import delete, func, select, text
from sqlalchemy.orm import Session

from app.errors import Refusal
from app.models import AuthProvider, EmailSignInCode, InstitutionLoginRule
from app.oidc import ProviderIdentity

CODE_LIFETIME = timedelta(minutes=10)
MAX_ATTEMPTS = 5
CODES_PER_ADDRESS_PER_HOUR = 5
CODES_PER_ADDRESS_PER_DAY = 10  # with 5 tries each: at most 50 guesses a day at one address
CODES_PER_DAY = 250  # Brevo's free plan sends 300 a day
KEEP_FOR = timedelta(days=1)  # older rows are deleted; the daily count needs one day

# Plain on purpose: a domain with at least one dot. The real check is that
# the email arrives. The part before the @ is letters, digits, dots, dashes
# and underscores only: no "+tag", which would give one inbox many accounts.
_EMAIL = re.compile(r"[a-z0-9._-]+@(?:[a-z0-9-]+\.)+[a-z0-9-]{2,}")


def normalize_email(raw: str) -> str:
    email = raw.strip().lower()
    if len(email) > 254 or not _EMAIL.fullmatch(email):
        raise Refusal(400, "invalid_email")
    return email


def code_key(jwt_secret: bytes) -> bytes:
    """A key of its own, derived from the server secret, so a code HMAC can
    never be mistaken for any other signature the server makes."""
    return hmac.new(jwt_secret, b"studyspot email sign-in codes", hashlib.sha256).digest()


def hash_code(key: bytes, email: str, code: str) -> str:
    return hmac.new(key, f"{email}\n{code}".encode(), hashlib.sha256).hexdigest()


def _domain(email: str) -> str:
    return email.rsplit("@", 1)[1]


def domain_is_supported(db: Session, email: str) -> bool:
    return db.scalars(
        select(InstitutionLoginRule.id).where(
            InstitutionLoginRule.provider == AuthProvider.EMAIL, InstitutionLoginRule.value == _domain(email)
        )
    ).first() is not None


def issue_code(db: Session, email: str, now: datetime, key: bytes) -> tuple[int, str]:
    """Store a new code for the address; return its row id and the code, to
    be emailed. Requests for one address wait for each other here (a lock
    held until commit), so ten at once cannot all pass the counts below."""
    db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:email))"), {"email": email})
    db.execute(delete(EmailSignInCode).where(EmailSignInCode.created_at < now - KEEP_FOR))
    recent = db.scalar(
        select(func.count())
        .select_from(EmailSignInCode)
        .where(EmailSignInCode.email == email, EmailSignInCode.created_at > now - timedelta(hours=1))
    )
    in_a_day = db.scalar(
        select(func.count())
        .select_from(EmailSignInCode)
        .where(EmailSignInCode.email == email, EmailSignInCode.created_at > now - timedelta(days=1))
    )
    if recent >= CODES_PER_ADDRESS_PER_HOUR or in_a_day >= CODES_PER_ADDRESS_PER_DAY:
        raise Refusal(429, "too_many_codes")
    today = db.scalar(
        select(func.count()).select_from(EmailSignInCode).where(EmailSignInCode.created_at > now - timedelta(days=1))
    )
    if today >= CODES_PER_DAY:
        raise Refusal(429, "email_daily_limit")
    code = f"{secrets.randbelow(1_000_000):06d}"
    row = EmailSignInCode(
        email=email, code_hash=hash_code(key, email, code), created_at=now, expires_at=now + CODE_LIFETIME
    )
    db.add(row)
    db.flush()
    return row.id, code


def check_code(db: Session, email: str, code: str, now: datetime, key: bytes) -> None:
    """Use up the address's newest code, or refuse. A wrong try is counted
    on the row, so the caller commits even when this refuses."""
    row = db.scalars(
        select(EmailSignInCode)
        .where(EmailSignInCode.email == email)
        .order_by(EmailSignInCode.created_at.desc(), EmailSignInCode.id.desc())
        .limit(1)
        .with_for_update()  # two tabs with the same code: the second waits, then sees it used
    ).first()
    if row is None or row.used_at is not None or row.expires_at <= now:
        raise Refusal(400, "email_code_invalid")
    if row.attempts >= MAX_ATTEMPTS:
        raise Refusal(400, "email_code_locked")
    if not hmac.compare_digest(row.code_hash, hash_code(key, email, code)):
        row.attempts += 1
        db.flush()
        raise Refusal(400, "email_code_invalid")
    row.used_at = now
    db.flush()


def identity_for(email: str) -> ProviderIdentity:
    """The address is the identity: whoever reads its inbox is its owner.
    The shown name is made from the part before the @ ("itay.gabay" ->
    "Itay Gabay"); it is never used to decide anything."""
    local = email.split("@", 1)[0]
    words = [w for w in re.split(r"[._+-]+", local) if w]
    name = " ".join(w.capitalize() for w in words) or local
    return ProviderIdentity(subject=email, institution_key=_domain(email), email=email, display_name=name)
