"""The Alembic chain against the models: fresh upgrade, parity, and a downgrade round trip.

Every revision must build the schema from explicit DDL (docs/CONVENTIONS.md, api section).
The parity test fails when a model changes (table, column, index, foreign key, type or
nullability) without a new revision.

SQLite always runs. Postgres runs only when ``OPENAD_TEST_PG_URL`` is set to an async URL
(``postgresql+asyncpg://…``) of a disposable database: the tests drop everything in it.
"""

from __future__ import annotations

import asyncio
import os
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import inspect
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import create_async_engine

import openad.models  # noqa: F401  - registers every table on Base.metadata
from openad.db.base import Base

API_DIR = Path(__file__).resolve().parents[1]
PG_URL = os.environ.get("OPENAD_TEST_PG_URL")

# Diffs that are known noise and may be ignored, as (kind, table, column) triples. Keep it
# empty unless a dialect reflects a type loosely; add each entry with a comment saying why.
# Adding an entry to hide a real model change defeats the test.
_IGNORED: set[tuple[str, str, str]] = set()


def _alembic_config(url: str) -> Config:
    # No ini file: fileConfig() would reset logging for the rest of the test session.
    cfg = Config()
    cfg.set_main_option("script_location", str(API_DIR / "alembic"))
    cfg.set_main_option("sqlalchemy.url", url)
    return cfg


def _run(url: str, fn: Any) -> Any:
    async def go() -> Any:
        engine = create_async_engine(url)
        try:
            async with engine.connect() as conn:
                return await conn.run_sync(fn)
        finally:
            await engine.dispose()

    return asyncio.run(go())


def _diffs(conn: Connection) -> list[Any]:
    """Every difference between the migrated schema and ``Base.metadata``, minus ``_IGNORED``."""
    ctx = MigrationContext.configure(conn, opts={"compare_type": True})
    out: list[Any] = []
    for diff in compare_metadata(ctx, Base.metadata):
        # Column modifications arrive as a list of tuples: (kind, schema, table, column, ...).
        if isinstance(diff, list):
            kept = [d for d in diff if (d[0], d[2], d[3]) not in _IGNORED]
            if kept:
                out.append(kept)
        else:
            out.append(diff)
    return out


def _tables(conn: Connection) -> set[str]:
    return set(inspect(conn).get_table_names()) - {"alembic_version"}


def _drop_everything(conn: Connection) -> None:
    Base.metadata.drop_all(conn)
    conn.exec_driver_sql("DROP TABLE IF EXISTS alembic_version")
    conn.commit()


@pytest.fixture(params=["sqlite", "postgres"])
def db_url(request: pytest.FixtureRequest, tmp_path: Path) -> Iterator[str]:
    if request.param == "sqlite":
        yield f"sqlite+aiosqlite:///{tmp_path / 'migrations.db'}"
        return
    if not PG_URL:
        pytest.skip("OPENAD_TEST_PG_URL not set; Postgres migration tests skipped")
    _run(PG_URL, _drop_everything)
    try:
        yield PG_URL
    finally:
        _run(PG_URL, _drop_everything)


def test_fresh_database_upgrades_to_head(db_url: str) -> None:
    command.upgrade(_alembic_config(db_url), "head")
    assert _run(db_url, _tables) == set(Base.metadata.tables)


def test_head_matches_models(db_url: str) -> None:
    command.upgrade(_alembic_config(db_url), "head")
    assert _run(db_url, _diffs) == []


def test_downgrade_base_then_upgrade_head_round_trips(db_url: str) -> None:
    cfg = _alembic_config(db_url)
    command.upgrade(cfg, "head")
    command.downgrade(cfg, "base")
    assert _run(db_url, _tables) == set()
    command.upgrade(cfg, "head")
    assert _run(db_url, _diffs) == []
