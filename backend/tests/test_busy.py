"""Too many requests at once: answer "busy" at once, not after half a minute.

The database pool is small and fixed. When every connection is taken, a
request used to wait 30 seconds for one and then fail with a 500, while the
visitor had long given up and the server kept working on stale requests
(measured with docs/load/loadtest.py: it stopped for minutes). Now it waits
a few seconds and answers 503 with Retry-After, so the browser asks again.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.exc import TimeoutError as PoolTimeout

from app.api.deps import get_session
from app.config import Settings
from app.main import app


def _no_connection():
    raise PoolTimeout("QueuePool limit reached")
    yield  # pragma: no cover  (makes this a generator, like get_session)


@pytest.fixture
def busy_client():
    app.dependency_overrides[get_session] = _no_connection
    yield TestClient(app, base_url="https://testserver", raise_server_exceptions=False)
    app.dependency_overrides.clear()


def test_a_full_pool_answers_busy_with_a_time_to_retry(busy_client):
    response = busy_client.get("/institutions/braude/places")
    assert response.status_code == 503
    assert response.json() == {"detail": "server_busy"}
    assert response.headers["Retry-After"] == "2"


def test_the_wait_for_a_connection_is_short_and_can_be_set():
    from app.db import make_engine

    settings = Settings(
        database_url="postgresql+psycopg://u:p@localhost/x", jwt_secret="j" * 40, db_pool_timeout=3, _env_file=None
    )
    assert make_engine(settings).pool.timeout() == 3
    assert Settings(database_url="postgresql+psycopg://u:p@localhost/x", _env_file=None).db_pool_timeout == 5


def test_a_busy_pool_really_times_out_soon():
    # A pool of one, one connection held: the second asker gives up after the timeout
    import time

    engine = create_engine("postgresql+psycopg://studyspot:studyspot@localhost/studyspot", pool_size=1, max_overflow=0, pool_timeout=0.3)
    held = engine.connect()
    started = time.monotonic()
    with pytest.raises(PoolTimeout):
        engine.connect()
    assert time.monotonic() - started < 2
    held.close()
    engine.dispose()
