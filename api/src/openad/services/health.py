"""Health payload including indexer lag vs a caller-supplied chain head."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from openad import __version__
from openad.config import Settings
from openad.indexer.runner import CURSOR_NAME
from openad.models import IndexerCursor
from openad.schemas.health import HealthResponse


async def build_health(
    session: AsyncSession, settings: Settings, *, head_block: int | None
) -> HealthResponse:
    lag: int | None = None
    if head_block is not None:
        cursor = await session.get(IndexerCursor, (settings.chain_id, CURSOR_NAME))
        lag = max(0, head_block - int(cursor.block_number)) if cursor is not None else head_block
    return HealthResponse(
        status="ok",
        version=__version__,
        chain_id=settings.chain_id,
        env=settings.env,
        indexer_lag=lag,
    )
