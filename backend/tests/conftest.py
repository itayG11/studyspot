"""Shared pytest fixtures for tests that need PostgreSQL.

The tests run against a separate database (TEST_DATABASE_URL). At the
start of the run its schema is rebuilt with the real Alembic migrations,
and every test runs inside a transaction that is rolled back at the end,
so tests never see each other's data.
"""

from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest
from alembic import command
from alembic.config import Config
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.api.deps import get_code_secret, get_session
from app.auth import get_current_user
from app.clock import get_now
from app.codes import make_code
from app.config import get_settings
from app.main import app
from app.models import Institution, Place, User
from app.seed import seed_braude

BACKEND_DIR = Path(__file__).resolve().parents[1]


def _test_database_url() -> str:
    settings = get_settings()
    url = settings.test_database_url
    if not url:
        pytest.fail("TEST_DATABASE_URL is not set. Copy it from .env.example into .env.")
    # Safety net: the test suite wipes its database, so it must never be
    # pointed at the development database.
    if make_url(url).database == make_url(settings.database_url).database:
        pytest.fail("TEST_DATABASE_URL must use a different database than DATABASE_URL.")
    return url


def _create_database_if_missing(url: str) -> None:
    target = make_url(url)
    admin = create_engine(target.set(database="postgres"), isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        exists = conn.scalar(
            text("SELECT 1 FROM pg_database WHERE datname = :name"), {"name": target.database}
        )
        if not exists:
            # The name comes from our own config, not from user input.
            conn.execute(text(f'CREATE DATABASE "{target.database}"'))
    admin.dispose()


def alembic_config(url: str) -> Config:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    config.attributes["database_url"] = url
    config.attributes["configure_logger"] = False  # keep pytest's logging setup
    return config


def reset_schema(engine: Engine) -> None:
    """Drop everything in the test database, whatever state a previous run left."""
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))


@pytest.fixture(scope="session")
def engine() -> Iterator[Engine]:
    url = _test_database_url()
    _create_database_if_missing(url)
    engine = create_engine(url)
    reset_schema(engine)
    command.upgrade(alembic_config(url), "head")
    yield engine
    engine.dispose()


@pytest.fixture(autouse=True)
def fresh_rate_limits() -> Iterator[None]:
    """Each test starts with empty rate-limit counters."""
    from app.ratelimit import LIMITERS

    for limiter in LIMITERS.values():
        limiter.reset()
    yield


@pytest.fixture
def session(engine: Engine) -> Iterator[Session]:
    """A Session whose work, including commit(), is rolled back after the test."""
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint")
    yield session
    session.close()
    transaction.rollback()
    connection.close()


# --- API fixtures ---------------------------------------------------------------

# A Sunday morning in Karmiel: every Braude place is open.
SUNDAY_10AM = datetime(2026, 10, 11, 10, 0, tzinfo=ZoneInfo("Asia/Jerusalem")).astimezone(UTC)
TEST_CODE_SECRET = b"test-code-secret-that-is-long-enough-0123456789"


class Clock:
    """A clock the tests can move: client.clock.now = ..."""

    def __init__(self, now: datetime):
        self.now = now


@pytest.fixture
def braude(session: Session) -> Institution:
    return seed_braude(session)


@pytest.fixture
def student(session: Session, braude: Institution) -> User:
    user = User(institution_id=braude.id, email="student@braude.example", display_name="Student")
    session.add(user)
    session.flush()
    return user


@pytest.fixture
def client(session: Session, braude: Institution, student: User) -> Iterator[TestClient]:
    """An API client on the test session, signed in as `student` at SUNDAY_10AM.

    Set client.user = None to act as an anonymous visitor, or to another
    User to act as someone else.
    """
    clock = Clock(SUNDAY_10AM)
    test_client = TestClient(app)
    test_client.clock = clock
    test_client.user = student

    def current_user() -> User:
        if test_client.user is None:
            raise HTTPException(401, "not_authenticated")
        return test_client.user

    app.dependency_overrides[get_session] = lambda: session
    app.dependency_overrides[get_now] = lambda: clock.now
    app.dependency_overrides[get_code_secret] = lambda: TEST_CODE_SECRET
    app.dependency_overrides[get_current_user] = current_user
    yield test_client
    app.dependency_overrides.clear()


def place_named(institution: Institution, building_code: str, name: str) -> Place:
    building = next(b for b in institution.buildings if b.code == building_code)
    return next(p for p in building.places if p.name == name)


def code_for(place: Place) -> str:
    return make_code(place.id, place.code_version, TEST_CODE_SECRET)
