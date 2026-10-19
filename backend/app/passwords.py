"""Passwords (wave 11), only for an address already proved by an emailed code.

The hash is argon2id (OWASP's first choice): slow and memory-hungry on
purpose, so guessing at scale costs a lot. Parameters are the library's
defaults; a hash made with older ones is redone at the next sign-in.

Wrong tries are counted in the database, per address, on top of the per-IP
limit: MAX_FAILURES in a row lock the password for LOCK_FOR. The answer to
every failure is the same, locked or not, known address or not, so no one
learns who has an account. Whoever is locked out can still sign in with a
code, so a lock never shuts anyone out.
"""

import re
import threading
from datetime import datetime, timedelta
from functools import cache
from importlib.resources import files

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import Refusal
from app.models import AuthProvider, UserIdentity

MIN_LENGTH = 10
MAX_LENGTH = 128  # hashing a huge text is slow: a way to tie up the server
MAX_FAILURES = 10
LOCK_FOR = timedelta(minutes=15)

# OWASP's second argon2id setting: 19 MiB, 2 passes, 1 lane. The library's
# default takes 64 MiB a hash: on the free server (512 MB), eight logins at
# once would run it out of memory, and anyone can send them.
_hasher = PasswordHasher(time_cost=2, memory_cost=19_456, parallelism=1)
# And at most this many hashes at once; the rest wait a little, then 429.
HASHES_AT_ONCE = 4
_hashing = threading.BoundedSemaphore(HASHES_AT_ONCE)
WAIT_FOR_HASH = 5.0  # seconds


def _bounded(work):
    if not _hashing.acquire(timeout=WAIT_FOR_HASH):
        raise Refusal(429, "password_busy")
    try:
        return work()
    finally:
        _hashing.release()


@cache
def _common() -> frozenset[str]:
    text = files("app").joinpath("data/common_passwords.txt").read_text(encoding="utf-8")
    return frozenset(line for line in text.splitlines() if line and not line.startswith("#"))


def check_strength(password: str, email: str) -> None:
    """The rules the user asked for: long, all four kinds of character, and
    not a well-known password with a capital and a digit stuck on."""
    if len(password) < MIN_LENGTH:
        raise Refusal(422, "password_too_short")
    if len(password) > MAX_LENGTH:
        raise Refusal(422, "password_too_long")
    if not any(c.isupper() for c in password):
        raise Refusal(422, "password_needs_upper")
    # Hebrew has no case: its letters count as lower case here.
    if not any(c.islower() or (c.isalpha() and not c.isupper()) for c in password):
        raise Refusal(422, "password_needs_lower")
    if not any(c.isdigit() for c in password):
        raise Refusal(422, "password_needs_digit")
    if not any(not c.isalnum() for c in password):
        raise Refusal(422, "password_needs_symbol")
    letters = re.sub(r"[^a-z]", "", password.lower())
    if letters in _common():  # "Password123!" is "password"
        raise Refusal(422, "password_too_common")
    local = re.sub(r"[^a-z]", "", email.split("@")[0])
    if len(local) >= 4 and local in letters:
        raise Refusal(422, "password_has_email")


def hash_password(password: str) -> str:
    return _bounded(lambda: _hasher.hash(password))


def verify_password(hashed: str, password: str) -> bool:
    def check() -> bool:
        try:
            return _hasher.verify(hashed, password)
        except (VerificationError, InvalidHashError):
            return False

    return _bounded(check)


@cache
def _dummy_hash() -> str:
    return hash_password("no account has this password 0!")


def set_password(identity: UserIdentity, password: str, now: datetime) -> None:
    identity.password_hash = hash_password(password)
    identity.password_set_at = now
    identity.failed_logins, identity.locked_until = 0, None


def check_password(db: Session, email: str, password: str, now: datetime) -> UserIdentity:
    """The identity if the password is right. The caller commits even on a
    refusal, so a wrong try stays counted."""
    identity = db.scalars(
        select(UserIdentity)
        .where(UserIdentity.provider == AuthProvider.EMAIL, UserIdentity.subject == email)
        .with_for_update()
    ).first()
    if identity is None or identity.password_hash is None:
        verify_password(_dummy_hash(), password)  # the same time as a real check
        raise Refusal(401, "password_invalid")
    if identity.locked_until is not None and identity.locked_until > now:
        verify_password(_dummy_hash(), password)
        raise Refusal(401, "password_invalid")
    if not verify_password(identity.password_hash, password):
        identity.failed_logins += 1
        if identity.failed_logins >= MAX_FAILURES:
            identity.failed_logins, identity.locked_until = 0, now + LOCK_FOR
        db.flush()
        raise Refusal(401, "password_invalid")
    identity.failed_logins, identity.locked_until = 0, None
    if _hasher.check_needs_rehash(identity.password_hash):
        identity.password_hash = hash_password(password)
    db.flush()
    return identity


_dummy_hash()  # made now, not on the first unknown address: that one would take twice as long
