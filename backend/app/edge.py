"""The outermost layer of the production server: security headers, a
request id, and one log line per request.

It wraps the whole app at the ASGI level, outside Starlette's own error
handler, so that a 500 answer from a crash gets the headers too; a
middleware inside the app never sees that answer.
"""

import logging
import re
import sys
import time
import uuid
from collections.abc import Awaitable, Callable, MutableMapping
from typing import Any

Scope = MutableMapping[str, Any]
Message = MutableMapping[str, Any]
Receive = Callable[[], Awaitable[Message]]
Send = Callable[[Message], Awaitable[None]]
ASGIApp = Callable[[Scope, Receive, Send], Awaitable[None]]

logger = logging.getLogger("studyspot.requests")
# A request slower than this is logged as a warning, to find in Render's log.
SLOW_SECONDS = 1.0
# The uptime monitor and the container's health check ask every half minute:
# logged only when slow or failing, not thousands of lines a day.
QUIET_PATHS = {"/api/health", "/health"}


def configure_logging() -> None:
    """Our loggers (app.*, studyspot.*) write INFO and up to stdout, which
    Render keeps. Without a handler Python prints only warnings and errors,
    so the sweeper's and the daily reset's notes were lost."""
    for name in ("app", "studyspot"):
        named = logging.getLogger(name)
        named.setLevel(logging.INFO)
        if not named.handlers:
            handler = logging.StreamHandler(sys.stdout)
            handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
            named.addHandler(handler)
            # Not again through the root logger (uvicorn's), which would print it twice.
            named.propagate = False


class Edge:
    def __init__(
        self,
        app: ASGIApp,
        headers: dict[str, str],
        framed: re.Pattern[str] | None = None,
        framed_headers: dict[str, str] | None = None,
    ):
        """framed: the exact paths other sites may show in a frame (the
        occupancy widget, wave 14.4) get framed_headers instead. A full
        match, not a prefix: /embed/x/y falls through to the web app, and
        must not take the widget's freedom with it (wave 14 review)."""
        self.app = app
        self._headers = [(k.lower().encode(), v.encode()) for k, v in headers.items()]
        self._framed = framed
        self._framed_headers = [(k.lower().encode(), v.encode()) for k, v in (framed_headers or headers).items()]

    @property
    def site(self) -> Any:
        """The wrapped app, to add routes or overrides to (tests)."""
        return self.app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)  # the lifespan
            return
        request_id = uuid.uuid4().hex[:12]
        started = time.perf_counter()
        status: int | str = "-"  # no answer started: the visitor left, or the app crashed first

        path = scope.get("path", "")
        framed = self._framed is not None and self._framed.fullmatch(path) is not None
        security = self._framed_headers if framed else self._headers

        async def send_with_headers(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                message["headers"] = [*message.get("headers", []), *security, (b"x-request-id", request_id.encode())]
            await send(message)

        try:
            await self.app(scope, receive, send_with_headers)
        finally:
            took = time.perf_counter() - started
            # The path only: the query can carry a sign-in code, or what an
            # admin searched for on the map.
            args = (request_id, scope.get("method", ""), scope.get("path", ""), status, took * 1000)
            line = "%s %s %s %s %.0fms"
            failed = isinstance(status, int) and status >= 500
            if took >= SLOW_SECONDS or failed:
                logger.warning(line, *args)
            elif scope.get("path") not in QUIET_PATHS:
                logger.info(line, *args)
