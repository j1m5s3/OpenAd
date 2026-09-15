"""Helpers for reads that must not outrun the indexer cursor (ARCHITECTURE §3.7)."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from openad.indexer.runner import CURSOR_NAME
from openad.models import IndexerCursor


async def protocol_indexed_block(session: AsyncSession) -> int | None:
    """Highest block the indexer has fully applied, or None if it has not started."""
    row = (
        await session.execute(select(IndexerCursor).where(IndexerCursor.contract == CURSOR_NAME))
    ).scalar_one_or_none()
    return None if row is None else int(row.block_number)
