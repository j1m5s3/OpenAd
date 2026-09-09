"""Creative, Approval, AllowedAdvertiser — mirrors CreativeRegistry (PROTOCOL.md section 3.3)."""

from __future__ import annotations

from sqlalchemy import BigInteger, Boolean, Integer, SmallInteger, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from openad.db.base import Base
from openad.db.types import Address, Bytes32, Uint256

# ApprovalStatus (PROTOCOL 3.3)
APPROVAL_NONE = 0
APPROVAL_REQUESTED = 1
APPROVAL_APPROVED = 2
APPROVAL_REJECTED = 3
APPROVAL_REVOKED = 4

# CreativeKind
KIND_MEDIA = 0
KIND_NFT_REF = 1


class Creative(Base):
    __tablename__ = "creatives"

    creative_id: Mapped[int] = mapped_column(Uint256, primary_key=True)
    advertiser: Mapped[str] = mapped_column(Address, index=True)
    kind: Mapped[int] = mapped_column(SmallInteger)

    uri: Mapped[str] = mapped_column(Text, default="")
    content_hash: Mapped[str | None] = mapped_column(Bytes32, nullable=True)
    mime: Mapped[str] = mapped_column(String(64), default="")
    width: Mapped[int] = mapped_column(Integer, default=0)
    height: Mapped[int] = mapped_column(Integer, default=0)
    click_url: Mapped[str] = mapped_column(Text, default="")

    nft_chain_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    nft_contract: Mapped[str | None] = mapped_column(Address, nullable=True)
    nft_token_id: Mapped[int | None] = mapped_column(Uint256, nullable=True)
    nft_standard: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)

    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    registered_block: Mapped[int] = mapped_column(BigInteger)
    updated_block: Mapped[int] = mapped_column(BigInteger)


class Approval(Base):
    __tablename__ = "approvals"

    publisher: Mapped[str] = mapped_column(Address, primary_key=True)
    creative_id: Mapped[int] = mapped_column(Uint256, primary_key=True)
    status: Mapped[int] = mapped_column(SmallInteger, default=APPROVAL_NONE)
    updated_block: Mapped[int] = mapped_column(BigInteger)


class AllowedAdvertiser(Base):
    __tablename__ = "allowed_advertisers"

    publisher: Mapped[str] = mapped_column(Address, primary_key=True)
    advertiser: Mapped[str] = mapped_column(Address, primary_key=True)
    allowed: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_block: Mapped[int] = mapped_column(BigInteger)
