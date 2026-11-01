"""Crashes in the browser, reported by the site's own script (wave 16.6).

The site's Content-Security-Policy lets the page talk only to the site
itself, so the browser cannot send a crash to Sentry directly. It sends a
short report here instead, and the server passes it on, scrubbed
(app/monitoring.py). Anyone may call it, so it is small and limited.
"""

from typing import Annotated

import sentry_sdk
from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, ConfigDict, Field

from app.monitoring import browser_error_event
from app.ratelimit import per_ip

router = APIRouter(tags=["monitoring"])

# A page that crashes in a loop must not fill the free quota: a few reports
# a minute per address, and a total over all addresses behind it.
PER_MINUTE = 10
client_error_limit = per_ip("client-errors", limit=PER_MINUTE, window_seconds=60, total_limit=300, evict=True)
# And a ceiling per day, since the free quota is for a month: 500 a day over
# the whole site is about 15,000 a month, under a third of it.
PER_DAY = 200
TOTAL_PER_DAY = 500
client_error_day_limit = per_ip("client-errors-day", limit=PER_DAY, window_seconds=86_400, total_limit=TOTAL_PER_DAY, evict=True)


class ClientError(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: Annotated[str, Field(min_length=1, max_length=500)]
    stack: Annotated[str, Field(max_length=4000)] | None = None
    # The page's path only; the script never sends the query.
    path: Annotated[str, Field(max_length=200)]


@router.post("/client-errors", status_code=204, dependencies=[Depends(client_error_limit), Depends(client_error_day_limit)])
def report_client_error(body: ClientError) -> Response:
    sentry_sdk.capture_event(browser_error_event(body.message, body.stack, body.path))
    return Response(status_code=204)
