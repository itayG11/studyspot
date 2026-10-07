"""Signed check-in codes, printed as a QR code at each place.

A code looks like  p42.v1.<signature>  where 42 is the place id, 1 is the
place's code_version, and the signature is HMAC-SHA256 over both, made
with a server-side secret. Without the secret nobody can produce a valid
signature, so codes cannot be guessed or forged. Raising a place's
code_version makes every printed code for it stop working.

Usage (print the codes for the demo):  python -m app.codes braude
"""

import base64
import hashlib
import hmac
import re
from dataclasses import dataclass

MIN_SECRET_BYTES = 32
_SIGNATURE_LENGTH = 43  # 32 bytes in unpadded base64url
_CODE = re.compile(r"p([1-9][0-9]{0,9})\.v([1-9][0-9]{0,5})\.([A-Za-z0-9_-]{43})")


class InvalidCode(Exception):
    """The text is not a code signed by this server."""


@dataclass(frozen=True)
class CodeClaim:
    place_id: int
    version: int


def _signature(place_id: int, version: int, secret: bytes) -> str:
    if len(secret) < MIN_SECRET_BYTES:
        raise ValueError(f"the code secret must be at least {MIN_SECRET_BYTES} bytes")
    message = f"studyspot-check-in:{place_id}:{version}".encode()
    digest = hmac.new(secret, message, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode()


def make_code(place_id: int, version: int, secret: bytes) -> str:
    return f"p{place_id}.v{version}.{_signature(place_id, version, secret)}"


def read_code(text: str, secret: bytes) -> CodeClaim:
    """Return what the code claims, or raise InvalidCode.

    The caller must still check that the version equals the place's
    current code_version.
    """
    match = _CODE.fullmatch(text)
    if match is None:
        raise InvalidCode
    place_id, version, signature = int(match[1]), int(match[2]), match[3]
    # compare_digest takes the same time whether the first or the last
    # character differs, so the signature cannot be guessed byte by byte.
    if not hmac.compare_digest(signature, _signature(place_id, version, secret)):
        raise InvalidCode
    return CodeClaim(place_id=place_id, version=version)


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
