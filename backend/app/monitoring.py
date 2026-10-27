"""Crash reports to Sentry (wave 16.6).

Off unless SENTRY_DSN is set, so development and the tests send nothing.
When it is on, only the kind of error, where it happened and which version
leaves the server. Everything that could name a person is dropped here,
twice over: the SDK is told not to collect it, and scrub_event removes
what is left, because a setting can change between releases of the SDK
and an email address in an error message is not a setting.
"""

import re
from typing import Any

import sentry_sdk

from app.config import Settings

EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
# The only headers worth a look when reading a crash: the rest carry the
# session, the access token and the visitor's address.
SAFE_HEADERS = {"user-agent", "content-type"}
# Parts of an event that can hold what a visitor typed or what a function held.
DROPPED = ("user", "server_name", "breadcrumbs", "extra")
DROPPED_FROM_REQUEST = ("data", "cookies", "query_string", "env")


# What the SDK's own integrations may collect: nothing about the visitor.
# (data_collection replaces the older send_default_pii flag.)
DATA_COLLECTION = {
    "user_info": False,
    "cookies": {"mode": "off"},
    "http_headers": {"request": {"mode": "allowlist", "terms": sorted(SAFE_HEADERS)}},
    "http_bodies": [],
    "url_query_params": {"mode": "off"},
    "database_query_data": False,
    "queues": False,
    "stack_frame_variables": False,
}


def hide_emails(text: str) -> str:
    return EMAIL.sub("[email]", text)


def scrub_event(event: dict[str, Any], hint: Any) -> dict[str, Any]:
    """Sentry's before_send: returns the event with nothing personal in it."""
    for key in DROPPED:
        event.pop(key, None)
    request = event.get("request")
    if isinstance(request, dict):
        for key in DROPPED_FROM_REQUEST:
            request.pop(key, None)
        if isinstance(request.get("url"), str):
            request["url"] = request["url"].split("?", 1)[0]
        if isinstance(request.get("headers"), dict):
            request["headers"] = {k: v for k, v in request["headers"].items() if k.lower() in SAFE_HEADERS}
    if isinstance(event.get("message"), str):
        event["message"] = hide_emails(event["message"])
    entry = event.get("logentry")
    if isinstance(entry, dict):
        entry.pop("params", None)  # the values that fill the %s of the message
        if isinstance(entry.get("message"), str):
            entry["message"] = hide_emails(entry["message"])
    for error in (event.get("exception") or {}).get("values") or []:
        if isinstance(error.get("value"), str):
            error["value"] = hide_emails(error["value"])
        for frame in (error.get("stacktrace") or {}).get("frames") or []:
            frame.pop("vars", None)
    return event


def init_monitoring(settings: Settings) -> bool:
    """Start reporting if there is an address to report to; says whether it did."""
    dsn = settings.sentry_dsn.get_secret_value().strip() if settings.sentry_dsn else ""
    if not dsn:
        return False
    sentry_sdk.init(
        dsn=dsn,
        release=settings.git_commit,
        environment="production",
        data_collection=DATA_COLLECTION,
        max_breadcrumbs=0,
        # Errors only: no performance traces, so the free quota is never at risk.
        traces_sample_rate=0,
        before_send=scrub_event,
    )
    return True


def browser_error_event(message: str, stack: str | None, path: str) -> dict[str, Any]:
    """An event for a crash the browser reported (app/api/client_errors.py).
    The page's own script wrote the text, so it is cleaned here too: no
    address, and no query, which is where a sign-in code can sit."""

    def clean(text: str) -> str:
        # Cut a query or fragment from any address in the text: from the
        # first ? or # to the next space or closing bracket.
        return hide_emails(re.sub(r"[?#][^\s)]*", "", text))

    event: dict[str, Any] = {
        "level": "error",
        "logentry": {"message": clean(message)},
        "tags": {"source": "browser", "page": re.sub(r"[?#].*", "", path)},
    }
    if stack:
        event["contexts"] = {"browser_error": {"stack": clean(stack)}}
    return event
