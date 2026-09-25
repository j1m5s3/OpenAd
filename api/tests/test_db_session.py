"""Connection pool wiring (ROADMAP 6.9; docs/deploy-gcp.md "Connection budget").

`create_async_engine` never opens a real connection at construction time, so these tests
introspect the configured pool without a running Postgres.
"""

from __future__ import annotations

from sqlalchemy.pool import StaticPool

from openad.config import Settings
from openad.db.session import Database


def _settings(**overrides: object) -> Settings:
    kwargs: dict[str, object] = {
        "database_url": "postgresql+asyncpg://openad:openad@127.0.0.1:15432/openad",
        "_env_file": None,
    }
    kwargs.update(overrides)
    return Settings(**kwargs)


async def test_postgres_url_gets_configured_pool() -> None:
    settings = _settings(db_pool_size=7, db_max_overflow=3, db_pool_timeout=45, db_pool_recycle=900)
    db = Database(settings.database_url, settings)
    try:
        # `size()`/`_max_overflow`/`_timeout`/`_recycle`/`_pre_ping` are the only way to read
        # back what `create_async_engine` was actually configured with; it never connects.
        pool = db.engine.pool
        assert pool.size() == 7
        assert pool._max_overflow == 3
        assert pool._timeout == 45
        assert pool._recycle == 900
        assert pool._pre_ping is True
    finally:
        await db.dispose()


async def test_postgres_url_defaults_without_settings() -> None:
    """No settings object: falls back to SQLAlchemy's own defaults, but pre-pings."""
    db = Database("postgresql+asyncpg://openad:openad@127.0.0.1:15432/openad")
    try:
        assert db.engine.pool._pre_ping is True
    finally:
        await db.dispose()


async def test_sqlite_ignores_pool_settings() -> None:
    settings = _settings(
        database_url="sqlite+aiosqlite:///:memory:",
        db_pool_size=99,
        db_max_overflow=99,
    )
    db = Database(settings.database_url, settings)
    try:
        assert isinstance(db.engine.pool, StaticPool)
    finally:
        await db.dispose()
