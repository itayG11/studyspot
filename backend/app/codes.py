"""Signed check-in codes, printed as a QR code at each place.

A code looks like  p42.v1.<signature>  where 42 is the place id, 1 is the
place's code_version, and the signature is HMAC-SHA256 over both, made
with a server-side secret. Without the secret nobody can produce a valid
signature, so codes cannot be guessed or forged. Raising a place's
code_version makes every printed code for it stop working.

A screen code (wave 13) adds the minute it belongs to:  p42.v1.w29345678.<sig>
The screen by the door shows a new one every minute, and only this minute's
or the last minute's code is accepted, so a photo taken earlier stops
working within two minutes. It works like TOTP: nothing is stored, the
server just signs and checks the minute number.

Usage (print the codes for the demo):  python -m app.codes braude
"""

import base64
import hashlib
import hmac
import re
from dataclasses import dataclass
from datetime import datetime

MIN_SECRET_BYTES = 32
_SIGNATURE_LENGTH = 43  # 32 bytes in unpadded base64url
_CODE = re.compile(r"p([1-9][0-9]{0,9})\.v([1-9][0-9]{0,5})(?:\.w([1-9][0-9]{0,9}))?\.([A-Za-z0-9_-]{43})")
WINDOW_SECONDS = 60


class InvalidCode(Exception):
    """The text is not a code signed by this server."""


@dataclass(frozen=True)
class CodeClaim:
    place_id: int
    version: int
    window: int | None = None  # the minute of a screen code; None on a printed sign


def _signature(place_id: int, version: int, secret: bytes, window: int | None = None) -> str:
    if len(secret) < MIN_SECRET_BYTES:
        raise ValueError(f"the code secret must be at least {MIN_SECRET_BYTES} bytes")
    # A different prefix for each kind, so a printed signature can never
    # be passed off as a screen code, or the other way round.
    if window is None:
        message = f"studyspot-check-in:{place_id}:{version}".encode()
    else:
        message = f"studyspot-screen:{place_id}:{version}:{window}".encode()
    digest = hmac.new(secret, message, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode()


def make_code(place_id: int, version: int, secret: bytes) -> str:
    return f"p{place_id}.v{version}.{_signature(place_id, version, secret)}"


def make_screen_code(place_id: int, version: int, window: int, secret: bytes) -> str:
    return f"p{place_id}.v{version}.w{window}.{_signature(place_id, version, secret, window)}"


def window_at(now: datetime) -> int:
    """The minute number since 1970 (UTC), the same on every server."""
    return int(now.timestamp()) // WINDOW_SECONDS


def seconds_left(now: datetime) -> int:
    """Seconds until the screen shows the next code (1 to 60)."""
    return WINDOW_SECONDS - int(now.timestamp()) % WINDOW_SECONDS


def is_fresh(window: int, now: datetime) -> bool:
    """This minute's code, or the last minute's: a student who scanned at
    second 59 is not refused a moment later."""
    return 0 <= window_at(now) - window <= 1


def read_code(text: str, secret: bytes) -> CodeClaim:
    """Return what the code claims, or raise InvalidCode.

    The caller must still check that the version equals the place's
    current code_version, and that a screen code is fresh (is_fresh).
    """
    match = _CODE.fullmatch(text)
    if match is None:
        raise InvalidCode
    place_id, version, signature = int(match[1]), int(match[2]), match[4]
    window = int(match[3]) if match[3] else None
    # compare_digest takes the same time whether the first or the last
    # character differs, so the signature cannot be guessed byte by byte.
    if not hmac.compare_digest(signature, _signature(place_id, version, secret, window)):
        raise InvalidCode
    return CodeClaim(place_id=place_id, version=version, window=window)


def _print_codes(slug: str) -> None:
    from sqlalchemy import select

    from app.config import get_settings
    from app.db import SessionLocal, get_engine
    from app.models import Building, Institution, Place

    secret = get_settings().code_secret_bytes()
    with SessionLocal(bind=get_engine()) as session:
        rows = session.execute(
            select(Building.code, Place.name, Place.id, Place.code_version)
            .join(Place.building)
            .join(Building.institution)
            .where(Institution.slug == slug)
            .order_by(Building.id, Place.id)
        ).all()
    for building, name, place_id, version in rows:
        print(f"{building}\t{name}\t{make_code(place_id, version, secret)}")


if __name__ == "__main__":
    import sys

    _print_codes(sys.argv[1] if len(sys.argv) > 1 else "braude")
