"""Error reporting to Sentry (wave 16.6, app/monitoring.py): off without an
address, and what leaves the server is scrubbed of anything personal."""

import sentry_sdk

from app import monitoring
from app.config import Settings
from app.monitoring import init_monitoring, scrub_event


def settings(**values) -> Settings:
    return Settings(_env_file=None, **{"database_url": "postgresql+psycopg://u@h/db", **values})


def a_crash() -> dict:
    """The shape of an event Sentry builds for an unhandled error on a login."""
    return {
        "message": "failed for dana@braude.example",
        "server_name": "srv-d123-abc",
        "user": {"id": "7", "email": "dana@braude.example", "ip_address": "83.130.6.63"},
        "request": {
            "url": "https://getstudyspot.me/api/auth/email/verify?code=123456&email=dana@braude.example",
            "method": "POST",
            "query_string": "code=123456&email=dana@braude.example",
            "data": {"email": "dana@braude.example", "password": "hunter2-hunter2"},
            "cookies": {"studyspot_session": "abc"},
            "headers": {
                "Authorization": "Bearer secret-token",
                "Cookie": "studyspot_session=abc",
                "X-Forwarded-For": "83.130.6.63, 172.69.150.147",
                "User-Agent": "Mozilla/5.0",
                "Content-Type": "application/json",
            },
            "env": {"REMOTE_ADDR": "10.31.71.2"},
        },
        "breadcrumbs": {"values": [{"message": "login for dana@braude.example"}]},
        "extra": {"email": "dana@braude.example"},
        "logentry": {"message": "bad code %s for dana@braude.example", "params": ["123456"], "formatted": "bad code 123456 for dana@braude.example"},
        "exception": {
            "values": [
                {
                    "type": "ValueError",
                    "value": "no account for dana@braude.example",
                    "stacktrace": {"frames": [{"function": "verify", "vars": {"email": "dana@braude.example", "code": "123456"}}]},
                }
            ]
        },
    }


def test_the_address_and_the_session_never_leave_the_server():
    event = scrub_event(a_crash(), {})
    request = event["request"]
    assert "data" not in request and "cookies" not in request and "query_string" not in request
    assert "env" not in request
    assert "user" not in event
    assert "server_name" not in event


def test_the_url_loses_its_query_but_keeps_the_path():
    assert scrub_event(a_crash(), {})["request"]["url"] == "https://getstudyspot.me/api/auth/email/verify"


def test_only_harmless_headers_stay():
    headers = scrub_event(a_crash(), {})["request"]["headers"]
    assert {k.lower() for k in headers} == {"user-agent", "content-type"}


def test_an_email_in_any_text_is_hidden_and_the_rest_of_the_text_stays():
    event = scrub_event(a_crash(), {})
    assert event["message"] == "failed for [email]"
    assert event["exception"]["values"][0]["value"] == "no account for [email]"
    assert event["logentry"]["message"] == "bad code %s for [email]"


def test_local_variables_breadcrumbs_and_extras_are_dropped():
    event = scrub_event(a_crash(), {})
    assert "vars" not in event["exception"]["values"][0]["stacktrace"]["frames"][0]
    assert "breadcrumbs" not in event
    assert "extra" not in event
    assert "params" not in event["logentry"]
    assert "formatted" not in event["logentry"]  # the message with the values already filled in (logging integration)


def test_the_secret_in_a_share_link_is_hidden_wherever_it_shows():
    event = scrub_event(
        {
            "message": "failed at /shares/abc.def-ghi",
            "transaction": "/api/shares/abc.def-ghi",
            "request": {"url": "https://getstudyspot.me/api/shares/abc.def-ghi?x=1"},
        },
        {},
    )
    assert event["request"]["url"] == "https://getstudyspot.me/api/shares/:token"
    assert event["transaction"] == "/api/shares/:token"
    assert event["message"] == "failed at /shares/:token"
    assert "abc.def-ghi" not in repr(event)


def test_a_database_error_loses_its_statement_and_values():
    text = "(psycopg.errors.DataError) bad value\n[SQL: INSERT INTO bookings (note) VALUES (%(note)s)]\n[parameters: {'note': 'dana@braude.example'}]"
    event = scrub_event({"exception": {"values": [{"value": text}]}}, {})
    assert event["exception"]["values"][0]["value"] == "(psycopg.errors.DataError) bad value"


def test_an_event_with_nothing_to_scrub_passes_through():
    assert scrub_event({"level": "error"}, {}) == {"level": "error"}


def test_without_an_address_nothing_starts(monkeypatch):
    started = []
    monkeypatch.setattr(sentry_sdk, "init", lambda **options: started.append(options))
    assert init_monitoring(settings()) is False
    assert init_monitoring(settings(sentry_dsn="   ")) is False
    assert started == []


def test_with_an_address_it_starts_with_the_privacy_options(monkeypatch):
    started = []
    monkeypatch.setattr(sentry_sdk, "init", lambda **options: started.append(options))
    dsn = "https://key@o1.ingest.de.sentry.io/2"
    assert init_monitoring(settings(sentry_dsn=dsn, git_commit="482d0a9")) is True
    (options,) = started
    assert options["dsn"] == dsn
    assert options["release"] == "482d0a9"
    assert options["environment"] == "production"
    collected = options["data_collection"]
    assert collected["user_info"] is False and collected["http_bodies"] == []
    assert collected["cookies"] == {"mode": "off"} and collected["url_query_params"] == {"mode": "off"}
    assert collected["stack_frame_variables"] is False and collected["database_query_data"] is False
    assert options["max_breadcrumbs"] == 0
    assert options["traces_sample_rate"] == 0
    assert options["before_send"] is monitoring.scrub_event


def test_the_address_is_a_secret_in_the_settings_repr():
    assert "ingest" not in repr(settings(sentry_dsn="https://key@o1.ingest.de.sentry.io/2"))


def test_a_real_crash_is_reported_scrubbed_and_a_404_is_not(monkeypatch):
    """End to end with the real SDK and a transport that keeps what would be sent."""
    from fastapi import FastAPI, HTTPException
    from fastapi.testclient import TestClient
    from sentry_sdk.transport import Transport

    sent = []

    class Keep(Transport):
        def capture_envelope(self, envelope):
            if envelope.get_event() is not None:
                sent.append(envelope.get_event())

    real_init = sentry_sdk.init
    monkeypatch.setattr(sentry_sdk, "init", lambda **options: real_init(transport=Keep, **options))
    assert init_monitoring(settings(sentry_dsn="https://key@o1.ingest.de.sentry.io/2")) is True
    try:
        app = FastAPI()
        who = "dana" + "@braude.example"  # not written out, so the test's own source lines do not contain it

        @app.get("/crash")
        def crash():
            raise ValueError("no account for " + who)

        @app.get("/missing")
        def missing():
            raise HTTPException(404)

        client = TestClient(app, raise_server_exceptions=False)
        assert client.get("/missing").status_code == 404
        assert client.get("/crash?code=123456", headers={"Authorization": "Bearer t"}).status_code == 500
        sentry_sdk.flush()
    finally:
        sentry_sdk.get_client().close()
    assert len(sent) == 1
    text = repr(sent[0])
    assert "dana@braude.example" not in text and "123456" not in text and "Bearer" not in text
    error = sent[0]["exception"]["values"][0]
    assert error["type"] == "ValueError" and error["value"] == "no account for [email]"
