"""One-time sign-in codes sent by email.

1. start: the address must belong to an institution's email login rule
   (its exact domain); otherwise no email is sent, so the site cannot be
   used to mail strangers. A random 6-digit code is made, its HMAC stored
   for 10 minutes, and the code emailed.
2. verify: any code this browser asked for, still in time, counts, not
   only the newest: a college mailbox may hold an email for minutes, and by
   then a new code was asked for. Which codes are this browser's is in a
   signed cookie (bind_cookie): whoever only knows the address cannot count
   wrong tries against the student's codes and lock them out. A wrong try
   counts on every one of those codes, so they do not add guesses; after
   MAX_ATTEMPTS they are locked. A sign-in
   uses up every open code of the address. The comparisons are in
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
from collections.abc import Collection
from datetime import datetime, timedelta

from sqlalchemy import delete, func, select, text
from sqlalchemy.orm import Session

from app.errors import Refusal
from app.models import AuthProvider, EmailSignInCode, InstitutionLoginRule, UserIdentity
from app.oidc import ProviderIdentity

CODE_LIFETIME = timedelta(minutes=10)  # still past a college mailbox's few minutes of scanning
MAX_ATTEMPTS = 5
CODES_PER_DOMAIN_PER_HOUR = 40  # one domain (made-up mailboxes) cannot use up the day's quota in a few minutes
RESERVED_FOR_KNOWN = 50  # of the day's codes, kept for addresses that signed in before
CODES_PER_ADDRESS_PER_HOUR = 5
CODES_PER_ADDRESS_PER_DAY = 10  # with 5 tries each: at most 50 guesses a day at one address
CODES_PER_DAY = 250  # Brevo's free plan sends 300 a day
KEEP_FOR = timedelta(days=1)  # older rows are deleted; the daily count needs one day

# Plain on purpose: a domain with at least one dot. The real check is that
# the email arrives. The part before the @ is letters, digits, dots, dashes
# and underscores only: no "+tag", which would give one inbox many accounts.
# Possessive (++): a label never gives back what it took, so a long run of
# dashes cannot make the match try every way to split it.
_EMAIL = re.compile(r"[a-z0-9._-]++@(?:[a-z0-9-]++\.)++[a-z0-9-]{2,}")


def normalize_email(raw: str) -> str:
    email = raw.strip().lower()
    if len(email) > 254 or not _EMAIL.fullmatch(email):
        raise Refusal(400, "invalid_email")
    return email


def code_key(jwt_secret: bytes) -> bytes:
    """A key of its own, derived from the server secret, so a code HMAC can
    never be mistaken for any other signature the server makes."""
    return hmac.new(jwt_secret, b"studyspot email sign-in codes", hashlib.sha256).digest()


def bind_key(jwt_secret: bytes) -> bytes:
    return hmac.new(jwt_secret, b"studyspot email code browser binding", hashlib.sha256).digest()


MAX_BOUND = 5  # codes one browser may hold at once; the address allows 5 an hour


def bind_cookie(key: bytes, email: str, ids: Collection[int]) -> str:
    """The cookie that says which codes of this address this browser asked
    for: "id,id.signature". The signature covers the address too."""
    listed = ",".join(str(i) for i in sorted(ids)[-MAX_BOUND:])
    return f"{listed}.{hmac.new(key, f'{email}\n{listed}'.encode(), hashlib.sha256).hexdigest()}"


def read_bind_cookie(key: bytes, email: str, value: str | None) -> list[int]:
    """The code ids in the cookie, or none when it is missing, forged, or
    made for another address."""
    if not value or value.count(".") != 1:
        return []
    listed, signature = value.split(".")
    expected = hmac.new(key, f"{email}\n{listed}".encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected):
        return []
    return [int(i) for i in listed.split(",") if i.isdigit()]


def hash_code(key: bytes, email: str, code: str) -> str:
    return hmac.new(key, f"{email}\n{code}".encode(), hashlib.sha256).hexdigest()


def _domain(email: str) -> str:
    return email.rsplit("@", 1)[1]


def domain_is_supported(db: Session, email: str) -> bool:
    return db.scalars(
        select(InstitutionLoginRule.id).where(
            InstitutionLoginRule.provider == AuthProvider.EMAIL,
            InstitutionLoginRule.value == _domain(email),
            InstitutionLoginRule.approved,
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
    this_hour_in_domain = db.scalar(
        select(func.count())
        .select_from(EmailSignInCode)
        .where(
            func.split_part(EmailSignInCode.email, "@", 2) == _domain(email),
            EmailSignInCode.created_at > now - timedelta(hours=1),
        )
    )
    if this_hour_in_domain >= CODES_PER_DOMAIN_PER_HOUR:
        raise Refusal(429, "too_many_codes")
    # A new address cannot use the part kept for people who already have an account.
    known = db.scalar(
        select(UserIdentity.id).where(UserIdentity.provider == AuthProvider.EMAIL, UserIdentity.subject == email)
    )
    if today >= (CODES_PER_DAY if known is not None else CODES_PER_DAY - RESERVED_FOR_KNOWN):
        raise Refusal(429, "email_daily_limit")
    code = f"{secrets.randbelow(1_000_000):06d}"
    row = EmailSignInCode(
        email=email, code_hash=hash_code(key, email, code), created_at=now, expires_at=now + CODE_LIFETIME
    )
    db.add(row)
    db.flush()
    return row.id, code


def check_code(db: Session, email: str, code: str, now: datetime, key: bytes, ids: Collection[int]) -> None:
    """Use up this browser's open codes (ids, from its cookie) with this
    one, or refuse. A wrong try is counted on those rows only, so the
    caller commits even when this refuses."""
    rows = db.scalars(
        select(EmailSignInCode)
        .where(
            EmailSignInCode.id.in_(ids),
            EmailSignInCode.email == email,
            EmailSignInCode.used_at.is_(None),
            EmailSignInCode.expires_at > now,
        )
        .order_by(EmailSignInCode.id)
        .with_for_update()  # two tabs with the same code: the second waits, then sees it used
    ).all()
    if not rows:
        raise Refusal(400, "email_code_invalid")
    wanted = hash_code(key, email, code)
    # Every row is compared, so the time taken does not tell which one matched.
    matches = [row for row in rows if hmac.compare_digest(row.code_hash, wanted)]
    if any(row.attempts >= MAX_ATTEMPTS for row in matches) or all(row.attempts >= MAX_ATTEMPTS for row in rows):
        raise Refusal(400, "email_code_locked")
    if not matches:
        for row in rows:
            row.attempts += 1
        db.flush()
        raise Refusal(400, "email_code_invalid")
    for row in rows:
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
