"""Indexer bookkeeping and protocol-level config mirrored from events."""

from __future__ import annotations

from sqlalchemy import BigInteger, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from openad.db.base import Base
from openad.db.types import Address, Uint256


class IndexerCursor(Base):
    __tablename__ = "indexer_cursor"

    chain_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    contract: Mapped[str] = mapped_column(String(64), primary_key=True)  # e.g. "AdSlot"
    block_number: Mapped[int] = mapped_column(BigInteger)  # last fully processed block
    block_hash: Mapped[str] = mapped_column(String(66))


class ProtocolConfig(Base):
    __tablename__ = "protocol_config"

    chain_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    market: Mapped[str | None] = mapped_column(Address, nullable=True)
    fee_bps: Mapped[int | None] = mapped_column(Integer, nullable=True)
    treasury: Mapped[str | None] = mapped_column(Address, nullable=True)
    moderator: Mapped[str | None] = mapped_column(Address, nullable=True)
    campaign_vault: Mapped[str | None] = mapped_column(Address, nullable=True)
    settler: Mapped[str | None] = mapped_column(Address, nullable=True)
    vault_fee_bps: Mapped[int | None] = mapped_column(Integer, nullable=True)
    vault_treasury: Mapped[str | None] = mapped_column(Address, nullable=True)
    close_delay_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_batch_charge: Mapped[int | None] = mapped_column(Uint256, nullable=True)
    updated_block: Mapped[int] = mapped_column(BigInteger, default=0)
