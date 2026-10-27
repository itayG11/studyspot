"""Crashes in the browser reach Sentry through our own route (wave 16.6,
app/api/client_errors.py), so the site's policy can stay connect-src 'self'."""

import pytest

from app import monitoring
from app.api import client_errors
from app.monitoring import browser_error_event


@pytest.fixture
def sent(monkeypatch):
    events = []
    monkeypatch.setattr(client_errors.sentry_sdk, "capture_event", lambda event: events.append(event))
    return events


GOOD = {"message": "x is not a function", "stack": "TypeError: x is not a function\n    at https://getstudyspot.me/assets/app-1a2b.js:1:2", "path": "/places/7"}


def test_a_crash_in_the_browser_is_passed_on_without_signing_in(client, sent):
    client.user = None
    response = client.post("/client-errors", json=GOOD)
    assert response.status_code == 204 and response.content == b""
    (event,) = sent
    assert event["level"] == "error"
    assert event["tags"] == {"source": "browser", "page": "/places/7"}
    assert event["logentry"]["message"] == "x is not a function"
    assert "app-1a2b.js" in event["contexts"]["browser_error"]["stack"]


def test_the_query_and_any_address_in_the_text_are_cut(client, sent):
    body = {
        "message": "no account for dana@braude.example",
        "stack": "at https://getstudyspot.me/login?code=123456&email=dana@braude.example:1:1",
        "path": "/login?code=123456#top",
    }
    assert client.post("/client-errors", json=body).status_code == 204
    text = repr(sent)
    assert "dana@braude.example" not in text and "123456" not in text
    assert sent[0]["tags"]["page"] == "/login"


def test_the_pure_function_cuts_the_same_things():
    event = browser_error_event("a@b.example", "s?x=1 a@b.example", "/p?q=1")
    assert "a@b.example" not in repr(event) and "x=1" not in repr(event) and event["tags"]["page"] == "/p"


def test_a_report_without_a_stack_is_fine(client, sent):
    assert client.post("/client-errors", json={"message": "boom", "path": "/"}).status_code == 204
    assert "browser_error" not in sent[0].get("contexts", {})


@pytest.mark.parametrize(
    "body",
    [
        {"message": "", "path": "/"},
        {"message": "m" * 501, "path": "/"},
        {"message": "m", "stack": "s" * 4001, "path": "/"},
        {"message": "m", "path": "p" * 201},
        {"message": "m", "path": "/", "user": "dana"},  # nothing else is accepted
        {"path": "/"},
    ],
)
def test_a_report_that_is_too_big_or_wrong_is_refused(client, sent, body):
    assert client.post("/client-errors", json=body).status_code == 422
    assert sent == []


def test_a_flood_from_one_address_is_cut_off(client, sent):
    codes = [client.post("/client-errors", json=GOOD).status_code for _ in range(client_errors.PER_MINUTE + 3)]
    assert codes[: client_errors.PER_MINUTE] == [204] * client_errors.PER_MINUTE
    assert codes[client_errors.PER_MINUTE :] == [429] * 3
    assert len(sent) == client_errors.PER_MINUTE


def test_without_monitoring_the_route_still_answers(client):
    # No SENTRY_DSN in tests: capture_event has nowhere to go, and that is fine.
    assert monitoring.init_monitoring is not None
    assert client.post("/client-errors", json=GOOD).status_code == 204
