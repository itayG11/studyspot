"""Proof of work on the request for an email sign-in code.

Every request for a code sends an email, and the day's email quota is small
(the Brevo free plan), so a script asking for thousands of codes could use
it all up and leave real students without one. Before it sends anything the
server hands out a small puzzle: find a number that, written after a random
salt, makes a SHA-256 hash start with `bits` zero bits. Finding it takes
about 2^bits tries and checking it takes one, so a visitor pays about a
second once, and a script pays that for every request.

It is not a test that the visitor is a person (that is what a CAPTCHA does):
it makes bulk requests cost time. Nothing is stored for the puzzle itself,
like the screen codes (app/codes.py): the salt, expiry and difficulty are
signed with the server's secret, so a visitor cannot make up an easier one.
Only the salts already spent are kept, in memory, so one solution cannot be
used twice. With several servers that table would move to a shared store.
"""

import hashlib
import hmac
import secrets
import threading
from dataclasses import dataclass
from datetime import datetime, timedelta

from app.errors import Refusal

CHALLENGE_LIFETIME = timedelta(minutes=5)
MAX_NONCE = 2**53  # the largest whole number a browser handles exactly


@dataclass(frozen=True)
class Challenge:
    salt: str  # random, hex
    expires: int  # seconds since 1970
    bits: int  # leading zero bits wanted
    signature: str  # HMAC-SHA256 over the three above


def _sign(secret: bytes, salt: str, expires: int, bits: int) -> str:
    message = f"studyspot-pow:{salt}:{expires}:{bits}".encode()
    return hmac.new(secret, message, hashlib.sha256).hexdigest()


def make_challenge(secret: bytes, bits: int, now: datetime) -> Challenge:
    salt = secrets.token_hex(16)
    expires = int((now + CHALLENGE_LIFETIME).timestamp())
    return Challenge(salt, expires, bits, _sign(secret, salt, expires, bits))


def work_hash(salt: str, nonce: int) -> bytes:
    return hashlib.sha256(f"{salt}:{nonce}".encode()).digest()


def leading_zero_bits(digest: bytes) -> int:
    value = int.from_bytes(digest, "big")
    return len(digest) * 8 - value.bit_length()


def solve(salt: str, bits: int) -> int:
    """What the browser does (app code never calls it; the tests do)."""
    nonce = 0
    while leading_zero_bits(work_hash(salt, nonce)) < bits:
        nonce += 1
    return nonce


class UsedSalts:
    """The salts already spent, each kept until its challenge would have
    expired anyway. A full table drops its oldest: spending a salt costs a
    solved puzzle, and refusing everyone would hand a flood the way in."""

    def __init__(self, max_entries: int = 50_000):
        self.max_entries = max_entries
        self._until: dict[str, datetime] = {}  # insertion order: oldest first
        self._lock = threading.Lock()

    def __len__(self) -> int:
        return len(self._until)

    def claim(self, salt: str, expires_at: datetime, now: datetime) -> bool:
        """True the first time a salt is claimed, False after."""
        with self._lock:
            if salt in self._until:
                return False
            if len(self._until) >= self.max_entries:
                for key in [k for k, until in self._until.items() if until <= now]:
                    del self._until[key]
            while len(self._until) >= self.max_entries:
                del self._until[next(iter(self._until))]
            self._until[salt] = expires_at
            return True


USED = UsedSalts()


def verify(
    secret: bytes, challenge: Challenge, nonce: int, now: datetime, used: UsedSalts, minimum_bits: int
) -> None:
    """Raises Refusal(400, ...) unless the challenge is the server's own,
    fresh, hard enough, unused, and solved by this nonce."""
    expected = _sign(secret, challenge.salt, challenge.expires, challenge.bits)
    if not hmac.compare_digest(expected, challenge.signature):
        raise Refusal(400, "pow_invalid")
    expires_at = datetime.fromtimestamp(challenge.expires, tz=now.tzinfo)
    if expires_at < now:
        raise Refusal(400, "pow_expired")
    # Raised since this challenge went out: the visitor asks for a new one
    if challenge.bits < minimum_bits:
        raise Refusal(400, "pow_invalid")
    if leading_zero_bits(work_hash(challenge.salt, nonce)) < challenge.bits:
        raise Refusal(400, "pow_invalid")
    # Last, so a wrong answer does not spend the salt
    if not used.claim(challenge.salt, expires_at, now):
        raise Refusal(400, "pow_used")
