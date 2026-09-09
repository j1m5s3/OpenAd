"""Slot, Terms, Lease — mirrors AdSlot + Marketplace state (PROTOCOL.md sections 3.1, 3.2)."""

from __future__ import annotations

from sqlalchemy import BigInteger, Boolean, ForeignKey, Integer, SmallInteger, String
from sqlalchemy.orm import Mapped, mapped_column

from openad.db.base import Base
from openad.db.types import Address, Uint256


class Slot(Base):
    __tablename__ = "slots"

    slot_id: Mapped[int] = mapped_column(Uint256, primary_key=True)
    owner: Mapped[str] = mapped_column(Address, index=True)  # publisher = current ERC-721 owner
    width: Mapped[int] = mapped_column(Integer)
    height: Mapped[int] = mapped_column(Integer)
    kind: Mapped[int] = mapped_column(SmallInteger)  # SlotKind
    domain: Mapped[str] = mapped_column(String(253), index=True)

    # Calendar (0 = none)
    calendar_version: Mapped[int] = mapped_column(Integer, default=0)
    period_seconds: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    first_period_start: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    minted_block: Mapped[int] = mapped_column(BigInteger)
    minted_tx: Mapped[str] = mapped_column(String(66))
    updated_block: Mapped[int] = mapped_column(BigInteger)

    def current_period_index(self, now: int) -> int | None:
        """PROTOCOL 4.1: index of the period containing ``now`` under the current calendar."""
        if (
            self.calendar_version == 0
            or self.period_seconds is None
            or self.first_period_start is None
            or now < self.first_period_start
        ):
            return None
        return (now - self.first_period_start) // self.period_seconds

    def period_window(self, period_index: int) -> tuple[int, int]:
        assert self.period_seconds is not None and self.first_period_start is not None
        start = self.first_period_start + period_index * self.period_seconds
        return start, start + self.period_seconds


class Terms(Base):
    __tablename__ = "terms"

    slot_id: Mapped[int] = mapped_column(Uint256, ForeignKey("slots.slot_id"), primary_key=True)
    start_price: Mapped[int] = mapped_column(Uint256)
    floor_price: Mapped[int] = mapped_column(Uint256)
    lead_seconds: Mapped[int] = mapped_column(BigInteger)
    sale_end: Mapped[int] = mapped_column(BigInteger, default=0)
    approval_mode: Mapped[int] = mapped_column(SmallInteger)  # 0 REQUIRED, 1 WAIVED
    paused: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_block: Mapped[int] = mapped_column(BigInteger)


class Lease(Base):
    __tablename__ = "leases"

    slot_id: Mapped[int] = mapped_column(Uint256, ForeignKey("slots.slot_id"), primary_key=True)
    calendar_version: Mapped[int] = mapped_column(Integer, primary_key=True)
    period_index: Mapped[int] = mapped_column(Uint256, primary_key=True)

    user: Mapped[str] = mapped_column(Address, index=True)  # advertiser
    creative_id: Mapped[int] = mapped_column(Uint256, index=True)
    start: Mapped[int] = mapped_column(BigInteger, index=True)
    end: Mapped[int] = mapped_column(BigInteger, index=True)

    # From Purchased (same tx as LeaseSet); nullable until that handler runs.
    price: Mapped[int | None] = mapped_column(Uint256, nullable=True)
    fee: Mapped[int | None] = mapped_column(Uint256, nullable=True)
    approval_mode: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)

    tx_hash: Mapped[str] = mapped_column(String(66))
    block_number: Mapped[int] = mapped_column(BigInteger)
