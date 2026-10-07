"""Dependencies shared by the API routes."""

from collections.abc import Iterator

from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import SessionLocal, get_engine


def get_session() -> Iterator[Session]:
    with SessionLocal(bind=get_engine()) as session:
        yield session


def get_code_secret() -> bytes:
    return get_settings().code_secret_bytes()
