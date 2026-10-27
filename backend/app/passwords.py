"""Passwords (wave 11), only for an address already proved by an emailed code.

The hash is argon2id (OWASP's first choice): slow and memory-hungry on
purpose, so guessing at scale costs a lot. Parameters are the library's
defaults; a hash made with older ones is redone at the next sign-in.

Wrong tries are counted twice. Per mail address and client address together
(in memory, WrongTries): MAX_FAILURES wrong from one client refuse that
client for LOCK_FOR. So someone who only knows an address cannot lock its
owner out from a single computer. And per mail address in the database, from
everywhere: ACCOUNT_MAX_FAILURES in a row lock the password for LOCK_FOR,
which stops guessing from many addresses at once (and lets that many
addresses together lock the owner out: a known limit; the owner still signs
in with a code). The answer to every failure is the same, locked or not,
known address or not, so no one learns who has an account. Whoever is locked
out can still sign in with a code, so a lock never shuts anyone out.

The per-client table lives in one server's memory and starts empty after a
restart; the database count does not.
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
MAX_FAILURES = 5  # from one client address
ACCOUNT_MAX_FAILURES = 20  # from all addresses together
MAX_KEPT = 10_000  # clients remembered at once; the oldest are dropped first
LOCK_FOR = timedelta(minutes=15)

# OWASP's second argon2id setting: 19 MiB, 2 passes, 1 lane. The library's
# default takes 64 MiB a hash: on the free server (512 MB), eight logins at
# once would run it out of memory, and anyone can send them.
_hasher = PasswordHasher(time_cost=2, memory_cost=19_456, parallelism=1)
# And at most this many hashes at once; the rest wait a little, then 429.
HASHES_AT_ONCE = 4
_hashing = threading.BoundedSemaphore(HASHES_AT_ONCE)
WAIT_FOR_HASH = 1.0  # seconds: a hash takes a fraction of that; a flood holds a thread for 1 s, not 5 (test round, 25 Oct)


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


# Digits and symbols that stand for letters: "P@ssw0rd" is "password".
_LEET = str.maketrans({"0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "!": "i"})


def _unleet(password: str) -> str:
    """The word under the disguise. What is stuck on at either end ("2026!")
    comes off first, or its digits would read as letters too."""
    core = password.lower()
    # A loop, not a regex: "[^a-z]+$" can take quadratic time on a long
    # run of symbols (CodeQL, polynomial ReDoS).
    start, end = 0, len(core)
    while start < end and not core[start].isalpha():
        start += 1
    while end > start and not core[end - 1].isalpha():
        end -= 1
    return "".join(c for c in core[start:end].translate(_LEET) if "a" <= c <= "z")


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
    if letters in _common() or _unleet(password) in _common():  # "Password123!", "P@ssw0rd!26"
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


class WrongTries:
    """Wrong passwords per (mail address, client address), by the app's own
    clock so tests can move it. Same interface as the rate limiters, so the
    tests' reset between cases reaches it."""

    def __init__(self) -> None:
        self._tries: dict[str, list[datetime]] = {}
        self._lock = threading.Lock()

    def blocked(self, key: str, now: datetime) -> bool:
        with self._lock:
            recent = [t for t in self._tries.get(key, []) if t > now - LOCK_FOR]
            if recent:
                self._tries[key] = recent
            else:
                self._tries.pop(key, None)
            return len(recent) >= MAX_FAILURES

    def add(self, key: str, now: datetime) -> None:
        with self._lock:
            self._tries.setdefault(key, []).append(now)
            while len(self._tries) > MAX_KEPT:
                self._tries.pop(next(iter(self._tries)))

    def clear(self, key: str) -> None:
        with self._lock:
            self._tries.pop(key, None)

    def reset(self) -> None:
        with self._lock:
            self._tries.clear()


wrong_tries = WrongTries()


def check_password(db: Session, email: str, password: str, now: datetime, client: str) -> UserIdentity:
    """The identity if the password is right. The caller commits even on a
    refusal, so a wrong try stays counted. `client` is the visitor's
    address (app/ratelimit.py, address_key)."""
    pair = f"{email}|{client}"
    identity = db.scalars(
        select(UserIdentity)
        .where(UserIdentity.provider == AuthProvider.EMAIL, UserIdentity.subject == email)
        .with_for_update()
    ).first()
    if identity is None or identity.password_hash is None:
        verify_password(_dummy_hash(), password)  # the same time as a real check
        raise Refusal(401, "password_invalid")
    if (identity.locked_until is not None and identity.locked_until > now) or wrong_tries.blocked(pair, now):
        verify_password(_dummy_hash(), password)
        raise Refusal(401, "password_invalid")
    if not verify_password(identity.password_hash, password):
        wrong_tries.add(pair, now)
        identity.failed_logins += 1
        if identity.failed_logins >= ACCOUNT_MAX_FAILURES:
            identity.failed_logins, identity.locked_until = 0, now + LOCK_FOR
        db.flush()
        raise Refusal(401, "password_invalid")
    wrong_tries.clear(pair)
    identity.failed_logins, identity.locked_until = 0, None
    if _hasher.check_needs_rehash(identity.password_hash):
        identity.password_hash = hash_password(password)
    db.flush()
    return identity


_dummy_hash()  # made now, not on the first unknown address: that one would take twice as long
