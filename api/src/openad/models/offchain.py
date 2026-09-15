"""Off-chain-only tables. NOT rebuildable from chain events; back these up.

See docs/ARCHITECTURE.md sections 3.2, 3.5, 3.6.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from openad.db.base import Base
from openad.db.types import Uint256

# CreativeVerification.status values
VERIFY_PENDING = "pending"
VERIFY_VERIFIED = "verified"
VERIFY_FAILED_HASH = "failed:hash_mismatch"
VERIFY_FAILED_MIME = "failed:mime"
VERIFY_FAILED_DIMENSIONS = "failed:dimensions"
VERIFY_FAILED_SIZE = "failed:size"
VERIFY_FAILED_FETCH = "failed:fetch"
VERIFY_FAILED_NOT_OWNER = "failed:not_owner"
VERIFY_FAILED_TIMEOUT = "failed:timeout"
VERIFY_FAILED_CLICK_URL = "failed:click_url"


class HouseAd(Base):
    __tablename__ = "house_ads"

    slot_id: Mapped[int] = mapped_column(Uint256, ForeignKey("slots.slot_id"), primary_key=True)
    media_url: Mapped[str] = mapped_column(Text)
    click_url: Mapped[str] = mapped_column(Text, default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class DomainVerification(Base):
    __tablename__ = "domain_verifications"

    slot_id: Mapped[int] = mapped_column(Uint256, ForeignKey("slots.slot_id"), primary_key=True)
    method: Mapped[str] = mapped_column(String(16))  # "dns_txt" | "meta_tag"
    token: Mapped[str] = mapped_column(String(64))
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class CreativeVerification(Base):
    __tablename__ = "creative_verifications"

    creative_id: Mapped[int] = mapped_column(
        Uint256, ForeignKey("creatives.creative_id"), primary_key=True
    )
    status: Mapped[str] = mapped_column(String(32), default=VERIFY_PENDING)
    checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cached_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolved_image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)


class ServeEvent(Base):
    """Append-only delivery log. Contains no visitor data by design."""

    __tablename__ = "serve_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    slot_id: Mapped[int] = mapped_column(Uint256, index=True)
    lease_calendar_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    lease_period_index: Mapped[int | None] = mapped_column(Uint256, nullable=True)
    campaign_id: Mapped[int | None] = mapped_column(Uint256, nullable=True, index=True)
    served_kind: Mapped[str] = mapped_column(String(8))  # lease | campaign | house | empty
    origin_ok: Mapped[bool] = mapped_column(Boolean, default=True)
    gsp_cpc: Mapped[int | None] = mapped_column(Uint256, nullable=True)
    at: Mapped[int] = mapped_column(BigInteger, index=True)  # unix seconds


class ClickEvent(Base):
    """Off-chain payable-click log. Not rebuildable from chain. No visitor IPs."""

    __tablename__ = "click_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    slot_id: Mapped[int] = mapped_column(Uint256, index=True)
    campaign_id: Mapped[int] = mapped_column(Uint256, index=True)
    creative_id: Mapped[int] = mapped_column(Uint256)
    serve_event_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    payable: Mapped[bool] = mapped_column(Boolean, default=False)
    ivt_reason: Mapped[str | None] = mapped_column(String(32), nullable=True)
    gsp_cpc: Mapped[int] = mapped_column(Uint256, default=0)
    settled_batch_id: Mapped[str | None] = mapped_column(String(66), nullable=True, index=True)
    at: Mapped[int] = mapped_column(BigInteger, index=True)
