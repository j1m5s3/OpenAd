"""Campaign and CampaignSettlement — chain-derived CampaignVault state (PROTOCOL.md §11)."""

from __future__ import annotations

from sqlalchemy import BigInteger, Boolean, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from openad.db.base import Base
from openad.db.types import Address, Bytes32, Uint256


class Campaign(Base):
    __tablename__ = "campaigns"

    campaign_id: Mapped[int] = mapped_column(Uint256, primary_key=True)
    advertiser: Mapped[str] = mapped_column(Address, index=True)
    slot_id: Mapped[int] = mapped_column(Uint256, ForeignKey("slots.slot_id"), index=True)
    creative_id: Mapped[int] = mapped_column(Uint256, index=True)
    max_cpc: Mapped[int] = mapped_column(Uint256)
    remaining: Mapped[int] = mapped_column(Uint256)
    budget: Mapped[int] = mapped_column(Uint256)  # CampaignOpened budget; not updated on top-up
    valid_from: Mapped[int] = mapped_column(BigInteger, default=0)
    valid_until: Mapped[int] = mapped_column(BigInteger, default=0)
    paused: Mapped[bool] = mapped_column(Boolean, default=False)
    close_after: Mapped[int] = mapped_column(BigInteger, default=0)
    closed: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    opened_tx: Mapped[str] = mapped_column(String(66))
    opened_block: Mapped[int] = mapped_column(BigInteger)
    updated_block: Mapped[int] = mapped_column(BigInteger)


class CampaignSettlement(Base):
    """One row per Settled batch_id. Rebuildable; makes settle handler idempotent."""

    __tablename__ = "campaign_settlements"

    batch_id: Mapped[str] = mapped_column(Bytes32, primary_key=True)
    campaign_id: Mapped[int] = mapped_column(
        Uint256, ForeignKey("campaigns.campaign_id"), index=True
    )
    slot_id: Mapped[int] = mapped_column(Uint256)
    publisher: Mapped[str] = mapped_column(Address)
    payable_clicks: Mapped[int] = mapped_column(Integer)
    charged: Mapped[int] = mapped_column(Uint256)
    fee: Mapped[int] = mapped_column(Uint256)
    tx_hash: Mapped[str] = mapped_column(String(66))
    block_number: Mapped[int] = mapped_column(BigInteger)
