"""Rate limiting: at most `limit` requests per `window` seconds per key.

A sliding window kept in memory: for each key, the times of its recent
requests. It is per process, which is enough for one server; with several
servers the counters would move to a shared store such as Redis.
"""

import hashlib
import threading
import time
from collections import defaultdict, deque
from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status

from app.auth import get_current_user
from app.models import User


class SlidingWindow:
    def __init__(self, limit: int, window_seconds: float, max_keys: int = 10_000):
        self.limit, self.window, self.max_keys = limit, window_seconds, max_keys
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        with self._lock:
            if key not in self._hits:
                self._prune(now)
                # Full even after forgetting old keys: a flood of new keys
                # (say, faked addresses) is refused instead of growing memory.
                if len(self._hits) >= self.max_keys:
                    return False
            hits = self._hits[key]
            while hits and hits[0] <= now - self.window:
                hits.popleft()
            if len(hits) >= self.limit:
                return False
            hits.append(now)
            return True

    def _prune(self, now: float) -> None:
        """Forget keys with no recent requests, so memory does not grow forever."""
        if len(self._hits) < self.max_keys:
            return
        for key in [k for k, h in self._hits.items() if not h or h[-1] <= now - self.window]:
            del self._hits[key]

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


def per_ip(name: str, limit: int, window_seconds: float, total_limit: int | None = None) -> Callable:
    """For endpoints without a user, such as sign-in.

    The address comes from the host's proxy (X-Forwarded-For, see
    deploy/start.sh), and a client can put anything in that header. So a
    total limit over all addresses backs it up: faking a new address on
    every request still runs into it.
    """
    window = LIMITERS.setdefault(name, SlidingWindow(limit, window_seconds))
    total = LIMITERS.setdefault(f"{name}:total", SlidingWindow(total_limit, window_seconds)) if total_limit else None

    def dependency(request: Request) -> None:
        client = request.client.host if request.client else "unknown"
        if total is not None and not total.allow("all"):
            raise _too_many(total)
        if not window.allow(client):
            raise _too_many(window)

    return dependency


def per_cookie(name: str, cookie: str, limit: int, window_seconds: float) -> Callable:
    """Per session, not per IP: a whole campus may share one public address."""
    window = LIMITERS.setdefault(name, SlidingWindow(limit, window_seconds))

    def dependency(request: Request) -> None:
        value = request.cookies.get(cookie)
        key = hashlib.sha256(value.encode()).hexdigest() if value else "no-cookie"
        if not window.allow(key):
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


# The limits used by the routes. Sign-in is per IP and generous, because a
# campus network can put many students behind one address. The total is a
# backstop for the whole site (one small server): 600 sign-ins a minute is
# far above a campus at its busiest hour.
sign_in_limit = per_ip("sign-in", limit=120, window_seconds=60, total_limit=600)
refresh_limit = per_cookie("refresh", "studyspot_refresh", limit=10, window_seconds=60)
write_limit = per_user("writes", limit=30, window_seconds=60)
