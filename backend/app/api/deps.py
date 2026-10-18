"""Dependencies shared by the API routes."""

from collections.abc import Iterator

from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import SessionLocal, get_engine


def get_session() -> Iterator[Session]:
    with SessionLocal(bind=get_engine()) as session:
        yield session


def get_code_secret() -> bytes:
    return get_settings().code_secret_bytes()


async def limited_body(request: Request, limit: int, too_big: str = "import_too_big") -> bytes:
    """The body, read only up to just over the limit: a huge upload is cut
    off instead of filling the server's memory."""
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > limit:
        raise HTTPException(422, too_big)
    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > limit:
            raise HTTPException(422, too_big)
    return bytes(data)
