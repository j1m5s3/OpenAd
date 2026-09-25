"""SIWE nonce and session tables (ADR-0009). Off-chain only."""

from __future__ import annotations

from sqlalchemy import BigInteger, Boolean, String
from sqlalchemy.orm import Mapped, mapped_column

from openad.db.base import Base
from openad.db.types import Address


class AuthNonce(Base):
    __tablename__ = "auth_nonces"

    nonce: Mapped[str] = mapped_column(String(64), primary_key=True)
    # Indexed for pruning (migration 0005).
    created_at: Mapped[int] = mapped_column(BigInteger, index=True)
    used: Mapped[bool] = mapped_column(Boolean, default=False)


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    address: Mapped[str] = mapped_column(Address, index=True)
    # Indexed for pruning (migration 0005).
    expires_at: Mapped[int] = mapped_column(BigInteger, index=True)
