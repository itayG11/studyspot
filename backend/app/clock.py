"""The current time, as a FastAPI dependency so tests can choose it."""

from datetime import UTC, datetime


def get_now() -> datetime:
    return datetime.now(UTC)
