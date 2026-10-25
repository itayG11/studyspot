"""A cap on the size of every request's body (test round, 25 Oct).

FastAPI reads and parses a JSON body whole before anything else runs, the
rate limits included: one 100 MB request could fill the free server's
512 MB. So the body is counted here, before the app: a declared length over
the cap is answered 413 at once, and a body that streams past it (no length
declared, or a false one) is cut off and answered 413 too.

The caps are generous for JSON: the biggest real body, a campus table, is
well under the default. Uploads keep their own, tighter, limits on top
(app/api/deps.py limited_body); here they only get room for their size.
"""

import json

from starlette.types import ASGIApp, Message, Receive, Scope, Send

DEFAULT_LIMIT = 1024 * 1024  # 1 MB
# Uploads: their route checks its own exact limit (2 MB for a photo).
LARGER = {"/me/classes/import-photo": 3 * 1024 * 1024}


class TooBig(Exception):
    pass


class BodyLimit:
    def __init__(self, app: ASGIApp, default: int = DEFAULT_LIMIT, larger: dict[str, int] | None = None):
        self.app = app
        self.default = default
        self.larger = LARGER if larger is None else larger

    def limit_for(self, path: str) -> int:
        for suffix, limit in self.larger.items():
            if path.endswith(suffix):
                return limit
        return self.default

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        limit = self.limit_for(scope.get("path", ""))
        declared = dict(scope.get("headers") or []).get(b"content-length")
        if declared is not None and declared.isdigit() and int(declared) > limit:
            await _too_big(send)
            return

        seen = 0
        over = False  # the body went past the cap while the app read it
        started = False

        async def counted() -> Message:
            nonlocal seen, over
            message = await receive()
            if message["type"] == "http.request":
                seen += len(message.get("body", b""))
                if seen > limit:
                    over = True
                    raise TooBig
            return message

        async def tracked(message: Message) -> None:
            nonlocal started
            if over:
                # FastAPI catches the error while it parses a body and
                # answers 400 itself: answer 413 in its place, once.
                if message["type"] == "http.response.start" and not started:
                    started = True
                    await _too_big(send)
                return
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        try:
            await self.app(scope, counted, tracked)
        except TooBig:
            if started:
                raise
            await _too_big(send)


async def _too_big(send: Send) -> None:
    body = json.dumps({"detail": "body_too_big"}).encode()
    await send(
        {
            "type": "http.response.start",
            "status": 413,
            "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())],
        }
    )
    await send({"type": "http.response.body", "body": body})
