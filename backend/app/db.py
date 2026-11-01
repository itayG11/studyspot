"""Database engine, session factory and the declarative base for all models."""

from functools import lru_cache

from sqlalchemy import Engine, MetaData, create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import Settings, get_settings

# Every constraint gets a predictable name, so Alembic migrations can
# refer to it (for example, to drop it later) and error messages say
# exactly which rule was broken.
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_N_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


def make_engine(settings: Settings) -> Engine:
    return create_engine(settings.database_url, pool_pre_ping=True, pool_timeout=settings.db_pool_timeout)


@lru_cache
def get_engine() -> Engine:
    return make_engine(get_settings())


SessionLocal = sessionmaker(expire_on_commit=False)
