"""SIWE nonce + session cookies (ADR-0009 and its 2026-09-25 amendment). The API never holds
keys that sign chain txs."""

from __future__ import annotations

import secrets
import time
from collections.abc import Callable, Sequence
from typing import Any, cast

from eth_account import Account
from eth_account.messages import encode_defunct
from sqlalchemy import delete, update
from sqlalchemy.engine import CursorResult
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from openad.errors import UnauthorizedError
from openad.logging import get_logger
from openad.models import AuthNonce, Session, Slot
from openad.siwe import check_time_window, is_bound_to_allowed_origin, parse_siwe

log = get_logger(__name__)

COOKIE_NAME = "openad_session"
NONCE_TTL = 600
PRUNE_INTERVAL_SECONDS = 60.0


class PruneThrottle:
    """Allows one prune per ``interval`` seconds per process. It uses a monotonic clock, so a
    wall-clock jump neither stalls pruning nor repeats it; tests inject their own clock."""

    def __init__(
        self,
        interval: float = PRUNE_INTERVAL_SECONDS,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.interval = interval
        self.clock = clock
        self.last: float | None = None

    def due(self) -> bool:
        """True (and the slot is taken) if no prune ran within the last ``interval``."""
        t = self.clock()
        if self.last is not None and t - self.last < self.interval:
            return False
        self.last = t
        return True


# Module-level, so the throttle is per process. Tests replace it with their own instance.
prune_throttle = PruneThrottle()


async def prune_auth(session: AsyncSession, now: int) -> tuple[int, int]:
    """Delete used or expired nonces and expired sessions; return how many of each went.

    Does not commit. The cut-offs match the checks that reject those rows anyway: a nonce is
    usable only while unused and ``created_at >= now - NONCE_TTL``, and a session only while
    ``expires_at >= now``.

    Nonces go in two DELETEs, not one with ``OR``, so the expiry range can use
    ``ix_auth_nonces_created_at`` (migration 0005), as the session DELETE uses
    ``ix_sessions_expires_at``. ``used`` has no index; its DELETE runs second, so it only has
    to look at nonces issued within the last ``NONCE_TTL``.
    """
    expired = await session.execute(
        delete(AuthNonce)
        .where(AuthNonce.created_at < now - NONCE_TTL)
        .execution_options(synchronize_session=False)
    )
    used = await session.execute(
        delete(AuthNonce)
        .where(AuthNonce.used.is_(True))
        .execution_options(synchronize_session=False)
    )
    sessions = await session.execute(
        delete(Session).where(Session.expires_at < now).execution_options(synchronize_session=False)
    )
    return _rowcount(expired) + _rowcount(used), _rowcount(sessions)


async def issue_nonce(session: AsyncSession, *, now: int | None = None) -> str:
    """Store and return a fresh single-use nonce, pruning auth rows first when a prune is due.

    The prune runs in its own transaction and is best-effort: if it fails, the nonce is still
    issued, so pruning can never block sign-in.
    """
    now = int(time.time()) if now is None else now
    if prune_throttle.due():
        try:
            removed_nonces, removed_sessions = await prune_auth(session, now)
            await session.commit()
            log.debug("auth.pruned", nonces=removed_nonces, sessions=removed_sessions)
        except SQLAlchemyError:
            await session.rollback()
            log.warning("auth.prune_failed", exc_info=True)
    nonce = secrets.token_hex(16)
    session.add(AuthNonce(nonce=nonce, created_at=now, used=False))
    await session.commit()
    return nonce


async def consume_nonce(session: AsyncSession, nonce: str, *, now: int) -> int:
    """Mark ``nonce`` used in one conditional UPDATE and return its row count.

    1 means this call used it. 0 means it is unknown, already used or expired. Two concurrent
    calls cannot both get 1: the database serializes the row update and re-checks
    ``used = false``. Does not commit, so the caller can insert the session in the same
    transaction.
    """
    result = await session.execute(
        update(AuthNonce)
        .where(
            AuthNonce.nonce == nonce,
            AuthNonce.used.is_(False),
            AuthNonce.created_at >= now - NONCE_TTL,
        )
        .values(used=True)
        .execution_options(synchronize_session=False)
    )
    return _rowcount(result)


def _rowcount(result: object) -> int:
    # DML through AsyncSession.execute returns a CursorResult; the stubs only say Result.
    return int(cast("CursorResult[Any]", result).rowcount)


async def verify_siwe(
    session: AsyncSession,
    *,
    message: str,
    signature: str,
    chain_id: int,
    ttl_seconds: int,
    allowed_origins: Sequence[str],
    now: int | None = None,
) -> Session:
    """Verify a signed SIWE message and create a session.

    The order is fixed: parse, bind, chain, time, signature, then consume the nonce and insert
    the session in one transaction. Every check runs before the nonce is touched, so a rejected
    message (a relayed one, for example) never burns it.
    """
    msg = parse_siwe(message)
    if not is_bound_to_allowed_origin(msg, allowed_origins):
        raise UnauthorizedError("domain not allowed")
    if msg.chain_id != chain_id:
        raise UnauthorizedError("chain id mismatch")
    now = int(time.time()) if now is None else now
    check_time_window(msg, now=now, max_age=NONCE_TTL)
    try:
        recovered = Account.recover_message(encode_defunct(text=message), signature=signature)
    except Exception as exc:
        raise UnauthorizedError("bad signature") from exc
    if recovered.lower() != msg.address:
        raise UnauthorizedError("address mismatch")
    if await consume_nonce(session, msg.nonce, now=now) != 1:
        raise UnauthorizedError("invalid nonce")
    rec = Session(id=secrets.token_hex(32), address=msg.address, expires_at=now + ttl_seconds)
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
