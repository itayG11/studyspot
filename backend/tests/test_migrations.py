"""Migrations can be applied, fully reverted and applied again, and they
produce exactly the schema that the models describe."""

from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import Engine, inspect

import app.models  # noqa: F401  (registers every table on Base.metadata)
from app.db import Base
from conftest import alembic_config

TABLES = {
    "institutions",
    "buildings",
    "places",
    "seats",
    "opening_hours",
    "special_periods",
    "special_period_places",
    "users",
    "check_ins",
    "bookings",
    "user_identities",
    "institution_login_rules",
    "sessions",
}


def test_upgrade_downgrade_upgrade(engine: Engine):
    config = alembic_config(engine.url.render_as_string(hide_password=False))
    try:
        command.downgrade(config, "base")
        assert TABLES.isdisjoint(inspect(engine).get_table_names())
    finally:
        # Leave the shared test database at head even if the check fails.
        command.upgrade(config, "head")
    assert TABLES <= set(inspect(engine).get_table_names())


def test_migrations_match_the_models(engine: Engine):
    """Catches a model change that was not written into a migration."""
    with engine.connect() as conn:
        differences = compare_metadata(MigrationContext.configure(conn), Base.metadata)
    assert differences == []
