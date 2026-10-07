"""Rate limiting: at most `limit` requests per `window` seconds per key.

A sliding window kept in memory: for each key, the times of its recent
requests. It is per process, which is enough for one server; with several
servers (stage 7) the counters move to a shared store such as Redis.
"""

import threading
import time
from collections import defaultdict, deque
from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status

from app.auth import get_current_user
from app.models import User


class SlidingWindow:
    def __init__(self, limit: int, window_seconds: float):
        self.limit, self.window = limit, window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        with self._lock:
            hits = self._hits[key]
            while hits and hits[0] <= now - self.window:
                hits.popleft()
            if len(hits) >= self.limit:
                return False
            hits.append(now)
            return True

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


LIMITERS: dict[str, SlidingWindow] = {}


def _too_many(window: SlidingWindow) -> HTTPException:
    return HTTPException(
        status.HTTP_429_TOO_MANY_REQUESTS,
        "too_many_requests",
        headers={"Retry-After": str(int(window.window))},
    )


def per_ip(name: str, limit: int, window_seconds: float) -> Callable:
    """For endpoints without a user, such as sign-in."""
    window = LIMITERS.setdefault(name, SlidingWindow(limit, window_seconds))

    def dependency(request: Request) -> None:
        client = request.client.host if request.client else "unknown"
        if not window.allow(client):
            raise _too_many(window)

    return dependency


def per_user(name: str, limit: int, window_seconds: float) -> Callable:
    """For signed-in actions. FastAPI resolves get_current_user once per
    request, so this adds no second token check."""
    window = LIMITERS.setdefault(name, SlidingWindow(limit, window_seconds))

    def dependency(user: Annotated[User, Depends(get_current_user)]) -> None:
        if not window.allow(f"user:{user.id}"):
            raise _too_many(window)

    return dependency


# The limits used by the routes.
sign_in_limit = per_ip("sign-in", limit=20, window_seconds=60)
write_limit = per_user("writes", limit=30, window_seconds=60)
