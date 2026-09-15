"""SIWE nonce + session cookies (ADR-0009). The API never holds keys that sign chain txs."""

from __future__ import annotations

import re
import secrets
import time

from eth_account import Account
from eth_account.messages import encode_defunct
from sqlalchemy.ext.asyncio import AsyncSession

from openad.errors import UnauthorizedError
from openad.models import AuthNonce, Session, Slot

COOKIE_NAME = "openad_session"
NONCE_TTL = 600

_ADDR = re.compile(r"0x[a-fA-F0-9]{40}")
_NONCE = re.compile(r"Nonce: ([a-zA-Z0-9]+)")
_CHAIN = re.compile(r"Chain ID: (\d+)")


async def issue_nonce(session: AsyncSession) -> str:
    nonce = secrets.token_hex(16)
    session.add(AuthNonce(nonce=nonce, created_at=int(time.time()), used=False))
    await session.commit()
    return nonce


def _parse_siwe(message: str) -> tuple[str, str, int]:
    addr_m = _ADDR.search(message)
    nonce_m = _NONCE.search(message)
    chain_m = _CHAIN.search(message)
    if not addr_m or not nonce_m or not chain_m:
        raise UnauthorizedError("malformed SIWE message")
    return addr_m.group(0).lower(), nonce_m.group(1), int(chain_m.group(1))


async def verify_siwe(
    session: AsyncSession,
    *,
    message: str,
    signature: str,
    chain_id: int,
    ttl_seconds: int,
) -> Session:
    address, nonce, msg_chain = _parse_siwe(message)
    if msg_chain != chain_id:
        raise UnauthorizedError("chain id mismatch")
    row = await session.get(AuthNonce, nonce)
    now = int(time.time())
    if row is None or row.used or now - row.created_at > NONCE_TTL:
        raise UnauthorizedError("invalid nonce")
    try:
        recovered = Account.recover_message(encode_defunct(text=message), signature=signature)
    except Exception as exc:
        raise UnauthorizedError("bad signature") from exc
    if recovered.lower() != address:
        raise UnauthorizedError("address mismatch")
    row.used = True
    sid = secrets.token_hex(32)
    rec = Session(id=sid, address=address, expires_at=now + ttl_seconds)
    session.add(rec)
    await session.commit()
    return rec


async def get_session(session: AsyncSession, session_id: str | None) -> Session:
    if not session_id:
        raise UnauthorizedError("not signed in")
    rec = await session.get(Session, session_id)
    if rec is None or rec.expires_at < int(time.time()):
        raise UnauthorizedError("session expired")
    return rec


async def logout(session: AsyncSession, session_id: str | None) -> None:
    if not session_id:
        return
    rec = await session.get(Session, session_id)
    if rec is not None:
        await session.delete(rec)
        await session.commit()


async def require_slot_owner(session: AsyncSession, slot_id: int, address: str) -> Slot:
    slot = await session.get(Slot, slot_id)
    if slot is None:
        from openad.errors import NotFoundError

        raise NotFoundError(f"slot {slot_id} not found")
    if slot.owner != address.lower():
        from openad.errors import ForbiddenError

        raise ForbiddenError("wallet is not the slot owner")
    return slot
