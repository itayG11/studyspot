"""API keys for institutions (wave 14.2).

A key looks like  ss_live_<43 random characters>  (secrets.token_urlsafe(32),
256 bits). It is shown to the admin once; the server keeps only an HMAC of
it, with a key of its own made from the server secret. A request sends it
as  Authorization: Bearer ss_live_...  and it opens one institution only.

Revoking keeps the row (the list shows when it stopped), so a key never
comes back to life. The demo campus is shared by every visitor: there a
new key past the limit retires the oldest instead of being refused, and the
daily demo reset removes them all (app/campus_admin.py).
"""

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.errors import Refusal
from app.models import ApiKey, Institution, User

PREFIX = "ss_live_"
SHOWN_CHARS = len(PREFIX) + 4  # "ss_live_AbCd": enough to tell keys apart
MAX_ACTIVE = 5
MARK_USED_EVERY = timedelta(minutes=5)  # not a database write on every request


def api_key_key(jwt_secret: bytes) -> bytes:
    return hmac.new(jwt_secret, b"studyspot institution api keys", hashlib.sha256).digest()


def _hash(key: bytes, raw: str) -> str:
    return hmac.new(key, raw.encode(), hashlib.sha256).hexdigest()


def active_keys(db: Session, institution: Institution) -> list[ApiKey]:
    return list(
        db.scalars(
            select(ApiKey)
            .where(ApiKey.institution_id == institution.id, ApiKey.revoked_at.is_(None))
            .order_by(ApiKey.created_at, ApiKey.id)
        )
    )


def all_keys(db: Session, institution: Institution) -> list[ApiKey]:
    return list(
        db.scalars(select(ApiKey).where(ApiKey.institution_id == institution.id).order_by(ApiKey.id.desc()).limit(50))
    )


def new_key(
    db: Session, institution: Institution, name: str, by: User, now: datetime, key: bytes, rotate: bool = False
) -> tuple[ApiKey, str]:
    """A new key, and the key itself to show once. The caller holds a lock
    on the institution row, so two at once cannot pass the limit together."""
    active = active_keys(db, institution)
    if len(active) >= MAX_ACTIVE:
        if not rotate:
            raise Refusal(409, "api_key_limit")
        for old in active[: len(active) - MAX_ACTIVE + 1]:
            old.revoked_at = now
    raw = PREFIX + secrets.token_urlsafe(32)
    row = ApiKey(
        institution_id=institution.id,
        name=name,
        prefix=raw[:SHOWN_CHARS],
        key_hash=_hash(key, raw),
        created_by=by.id,
        created_at=now,
    )
    db.add(row)
    db.flush()
    return row, raw


def revoke(db: Session, institution: Institution, key_id: int, now: datetime) -> bool:
    done = db.execute(
        update(ApiKey)
        .where(ApiKey.id == key_id, ApiKey.institution_id == institution.id, ApiKey.revoked_at.is_(None))
        .values(revoked_at=now)
    )
    return done.rowcount == 1


def key_for(db: Session, raw: str, now: datetime, key: bytes) -> ApiKey | None:
    """The active key, or None. Marks when it was last used, now and then."""
    if not raw.startswith(PREFIX):
        return None
    row = db.scalars(select(ApiKey).where(ApiKey.key_hash == _hash(key, raw), ApiKey.revoked_at.is_(None))).first()
    if row is not None and (row.last_used_at is None or now - row.last_used_at >= MARK_USED_EVERY):
        row.last_used_at = now
        db.commit()
    return row
