"""Async engine / session management and the FastAPI session dependency."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Annotated, Protocol

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

from openad.db.base import Base


class PoolSettings(Protocol):
    """Structural type for the pool fields `Database` needs — matches both
    `openad.config.Settings` and `openad.settler.settings.SettlerSettings`, which are separate
    classes (the settler must not share `OPENAD_SETTLER_KEY` onto the HTTP API's settings)."""

    db_pool_size: int
    db_max_overflow: int
    db_pool_timeout: int
    db_pool_recycle: int


class Database:
    """Owns the engine and session factory. One instance per process, stored on ``app.state``.

    ``settings``, when given, sizes the connection pool (ROADMAP 6.9; docs/deploy-gcp.md
    "Connection budget"). SQLite always uses ``StaticPool`` and ignores it — a fresh in-memory
    database must share its one connection across the async pool.
    """

    def __init__(self, url: str, settings: PoolSettings | None = None) -> None:
        kwargs: dict[str, object] = {}
        if url.startswith("sqlite"):
            kwargs = {"poolclass": StaticPool, "connect_args": {"check_same_thread": False}}
        else:
            kwargs["pool_pre_ping"] = True
            if settings is not None:
                kwargs["pool_size"] = settings.db_pool_size
                kwargs["max_overflow"] = settings.db_max_overflow
                kwargs["pool_timeout"] = settings.db_pool_timeout
                kwargs["pool_recycle"] = settings.db_pool_recycle
        self.engine: AsyncEngine = create_async_engine(url, **kwargs)
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False)

    async def create_all(self) -> None:
        """Test/dev convenience. Production schemas come from Alembic migrations."""
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    async def dispose(self) -> None:
        await self.engine.dispose()


async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    db: Database = request.app.state.db
    async with db.sessions() as session:
        yield session


SessionDep = Annotated[AsyncSession, Depends(get_session)]
