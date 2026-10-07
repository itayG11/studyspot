"""Migrations can be applied, fully reverted and applied again."""

from alembic import command
from sqlalchemy import Engine, inspect

from conftest import alembic_config

CAMPUS_TABLES = {
    "institutions",
    "buildings",
    "places",
    "seats",
    "opening_hours",
    "special_periods",
    "special_period_places",
}


def test_upgrade_downgrade_upgrade(engine: Engine):
    config = alembic_config(engine.url.render_as_string(hide_password=False))

    command.downgrade(config, "base")
    assert CAMPUS_TABLES.isdisjoint(inspect(engine).get_table_names())

    command.upgrade(config, "head")
    assert CAMPUS_TABLES <= set(inspect(engine).get_table_names())
