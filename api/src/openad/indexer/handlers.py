"""One idempotent handler per protocol event (docs/PROTOCOL.md section 6).

Rules (docs/CONVENTIONS.md 4): handlers are upserts keyed by on-chain identifiers, take a
session and a ``DecodedEvent``, and never call the chain. Register with ``@on_event``.
Handlers that only mirror config are trivial; the interesting ones are LeaseSet/Purchased
(same tx, either order) and Transfer (publisher changes).

Status: implemented for every event in ``EXPECTED_EVENTS``; end-to-end replay against Anvil is
ROADMAP 2.1.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from openad.indexer.events import DecodedEvent
from openad.logging import get_logger
from openad.models import (
    AllowedAdvertiser,
    Approval,
    Creative,
    CreativeVerification,
    IndexerCursor,
    Lease,
    ProtocolConfig,
    Slot,
    Terms,
)
from openad.models.creative import APPROVAL_REQUESTED, KIND_MEDIA, KIND_NFT_REF
from openad.models.offchain import VERIFY_PENDING
from openad.serve.cache import bump as bump_serve_cache

log = get_logger(__name__)

Handler = Callable[[AsyncSession, DecodedEvent], Awaitable[None]]
_HANDLERS: dict[tuple[str, str], Handler] = {}

ZERO_ADDRESS = "0x" + "00" * 20


def on_event(contract: str, name: str) -> Callable[[Handler], Handler]:
    def register(fn: Handler) -> Handler:
        key = (contract, name)
        if key in _HANDLERS:
            raise RuntimeError(f"duplicate handler for {key}")
        _HANDLERS[key] = fn
        return fn

    return register


def registered_events() -> frozenset[tuple[str, str]]:
    return frozenset(_HANDLERS)


async def dispatch(session: AsyncSession, event: DecodedEvent) -> bool:
    handler = _HANDLERS.get(event.key)
    if handler is None:
        log.warning("indexer.unhandled_event", contract=event.contract, name=event.name)
        return False
    await handler(session, event)
    return True


def _addr(value: str) -> str:
    return value.lower()


def _hex(value: bytes | str) -> str:
    if isinstance(value, bytes):
        return "0x" + value.hex()
    return value.lower()


async def _protocol_config(session: AsyncSession, chain_id: int) -> ProtocolConfig:
    cfg = await session.get(ProtocolConfig, chain_id)
    if cfg is None:
        cfg = ProtocolConfig(chain_id=chain_id)
        session.add(cfg)
    return cfg


# ----------------------------------------------------------------------------- AdSlot


@on_event("AdSlot", "SlotMinted")
async def slot_minted(session: AsyncSession, ev: DecodedEvent) -> None:
    a = ev.args
    slot = await session.get(Slot, int(a["slot_id"]))
    if slot is None:
        slot = Slot(
            slot_id=int(a["slot_id"]),
            owner=_addr(a["owner"]),
            width=int(a["width"]),
            height=int(a["height"]),
            kind=int(a["kind"]),
            domain=str(a["domain"]).lower(),
            calendar_version=0,
            minted_block=ev.block_number,
            minted_tx=ev.tx_hash,
            updated_block=ev.block_number,
        )
        session.add(slot)
    else:  # replay after reorg: refresh immutable fields defensively
        slot.owner = _addr(a["owner"])
        slot.updated_block = ev.block_number


@on_event("AdSlot", "Transfer")
async def slot_transferred(session: AsyncSession, ev: DecodedEvent) -> None:
    """ERC-721 Transfer: current owner == publisher. Mint transfers arrive with SlotMinted."""
    a = ev.args
    slot = await session.get(Slot, int(a["tokenId"]))
    if slot is None:
        # Transfer may be decoded before SlotMinted in the same tx; SlotMinted will create it.
        return
    slot.owner = _addr(a["to"])
    slot.updated_block = ev.block_number


@on_event("AdSlot", "CalendarSet")
async def calendar_set(session: AsyncSession, ev: DecodedEvent) -> None:
    a = ev.args
    slot = await session.get(Slot, int(a["slot_id"]))
    if slot is None:
        log.warning("indexer.calendar_for_unknown_slot", slot_id=a["slot_id"])
        return
    slot.calendar_version = int(a["version"])
    slot.period_seconds = int(a["period_seconds"])
    slot.first_period_start = int(a["first_period_start"])
    slot.updated_block = ev.block_number


@on_event("AdSlot", "LeaseSet")
async def lease_set(session: AsyncSession, ev: DecodedEvent) -> None:
    a = ev.args
    key = (int(a["slot_id"]), int(a["version"]), int(a["period_index"]))
    lease = await session.get(Lease, key)
    if lease is None:
        lease = Lease(
            slot_id=key[0],
            calendar_version=key[1],
            period_index=key[2],
            user=_addr(a["user"]),
            creative_id=int(a["creative_id"]),
            start=int(a["start"]),
            end=int(a["end"]),
            tx_hash=ev.tx_hash,
            block_number=ev.block_number,
        )
        session.add(lease)
    else:
        lease.user = _addr(a["user"])
        lease.creative_id = int(a["creative_id"])
        lease.start, lease.end = int(a["start"]), int(a["end"])
        lease.tx_hash, lease.block_number = ev.tx_hash, ev.block_number
    bump_serve_cache(int(a["slot_id"]))


@on_event("AdSlot", "MarketSet")
async def market_set(session: AsyncSession, ev: DecodedEvent) -> None:
    cfg = await _protocol_config(session, _chain_id_of(session))
    cfg.market = _addr(ev.args["market"])
    cfg.updated_block = ev.block_number


@on_event("AdSlot", "BaseURISet")
async def base_uri_set(session: AsyncSession, ev: DecodedEvent) -> None:
    log.info("indexer.base_uri_set", base_uri=ev.args["base_uri"], block=ev.block_number)


# ----------------------------------------------------------------------------- Marketplace


@on_event("Marketplace", "TermsSet")
async def terms_set(session: AsyncSession, ev: DecodedEvent) -> None:
    a = ev.args
    terms = await session.get(Terms, int(a["slot_id"]))
    if terms is None:
        terms = Terms(slot_id=int(a["slot_id"]), paused=False, updated_block=ev.block_number)
        session.add(terms)
    terms.start_price = int(a["start_price"])
    terms.floor_price = int(a["floor_price"])
    terms.lead_seconds = int(a["lead_seconds"])
    terms.sale_end = int(a["sale_end"])
    terms.approval_mode = int(a["approval_mode"])
    terms.updated_block = ev.block_number


@on_event("Marketplace", "PausedSet")
async def paused_set(session: AsyncSession, ev: DecodedEvent) -> None:
    terms = await session.get(Terms, int(ev.args["slot_id"]))
    if terms is None:
        log.warning("indexer.paused_for_unknown_terms", slot_id=ev.args["slot_id"])
        return
    terms.paused = bool(ev.args["paused"])
    terms.updated_block = ev.block_number


@on_event("Marketplace", "Purchased")
async def purchased(session: AsyncSession, ev: DecodedEvent) -> None:
    """Enrich the lease written by LeaseSet in the same tx. Order within the tx is not assumed:
    if LeaseSet has not been applied yet we create the row and LeaseSet completes it."""
    a = ev.args
    slot = await session.get(Slot, int(a["slot_id"]))
    version = slot.calendar_version if slot else 0
    key = (int(a["slot_id"]), version, int(a["period_index"]))
    lease = await session.get(Lease, key)
    if lease is None:
        lease = Lease(
            slot_id=key[0],
            calendar_version=key[1],
            period_index=key[2],
            user=_addr(a["buyer"]),
            creative_id=int(a["creative_id"]),
            start=int(a["start"]),
            end=int(a["end"]),
            tx_hash=ev.tx_hash,
            block_number=ev.block_number,
        )
        session.add(lease)
    lease.price = int(a["price"])
    lease.fee = int(a["fee"])
    lease.approval_mode = int(a["approval_mode"])


@on_event("Marketplace", "FeeSet")
async def fee_set(session: AsyncSession, ev: DecodedEvent) -> None:
    cfg = await _protocol_config(session, _chain_id_of(session))
    cfg.fee_bps = int(ev.args["fee_bps"])
    cfg.updated_block = ev.block_number


@on_event("Marketplace", "TreasurySet")
async def treasury_set(session: AsyncSession, ev: DecodedEvent) -> None:
    cfg = await _protocol_config(session, _chain_id_of(session))
    cfg.treasury = _addr(ev.args["treasury"])
    cfg.updated_block = ev.block_number


# ----------------------------------------------------------------------------- CreativeRegistry


@on_event("CreativeRegistry", "CreativeRegistered")
async def creative_registered(session: AsyncSession, ev: DecodedEvent) -> None:
    a = ev.args
    cid = int(a["creative_id"])
    creative = await session.get(Creative, cid)
    if creative is None:
        creative = Creative(
            creative_id=cid,
            advertiser=_addr(a["advertiser"]),
            kind=int(a["kind"]),
            registered_block=ev.block_number,
            updated_block=ev.block_number,
        )
        session.add(creative)
    creative.uri = str(a["uri"])
    creative.content_hash = _hex(a["content_hash"]) if int(a["kind"]) == KIND_MEDIA else None
    creative.mime = str(a["mime"])
    creative.width = int(a["width"])
    creative.height = int(a["height"])
    creative.click_url = str(a["click_url"])
    creative.updated_block = ev.block_number

    if await session.get(CreativeVerification, cid) is None:
        session.add(CreativeVerification(creative_id=cid, status=VERIFY_PENDING))


@on_event("CreativeRegistry", "NftCreativeRegistered")
async def nft_creative_registered(session: AsyncSession, ev: DecodedEvent) -> None:
    a = ev.args
    cid = int(a["creative_id"])
    creative = await session.get(Creative, cid)
    if creative is None:
        # Emitted in the same tx as CreativeRegistered; create a shell that it completes.
        creative = Creative(
            creative_id=cid,
            advertiser=ZERO_ADDRESS,
            kind=KIND_NFT_REF,
            registered_block=ev.block_number,
            updated_block=ev.block_number,
        )
        session.add(creative)
    creative.nft_chain_id = int(a["nft_chain_id"])
    creative.nft_contract = _addr(a["nft_contract"])
    creative.nft_token_id = int(a["nft_token_id"])
    creative.nft_standard = int(a["nft_standard"])
    creative.updated_block = ev.block_number


@on_event("CreativeRegistry", "ApprovalRequested")
async def approval_requested(session: AsyncSession, ev: DecodedEvent) -> None:
    a = ev.args
    key = (_addr(a["publisher"]), int(a["creative_id"]))
    approval = await session.get(Approval, key)
    if approval is None:
        approval = Approval(publisher=key[0], creative_id=key[1], updated_block=ev.block_number)
        session.add(approval)
    approval.status = APPROVAL_REQUESTED
    approval.updated_block = ev.block_number


@on_event("CreativeRegistry", "ApprovalSet")
async def approval_set(session: AsyncSession, ev: DecodedEvent) -> None:
    a = ev.args
    key = (_addr(a["publisher"]), int(a["creative_id"]))
    approval = await session.get(Approval, key)
    if approval is None:
        approval = Approval(publisher=key[0], creative_id=key[1], updated_block=ev.block_number)
        session.add(approval)
    approval.status = int(a["status"])
    approval.updated_block = ev.block_number
    bump_serve_cache()


@on_event("CreativeRegistry", "AdvertiserAllowed")
async def advertiser_allowed(session: AsyncSession, ev: DecodedEvent) -> None:
    a = ev.args
    key = (_addr(a["publisher"]), _addr(a["advertiser"]))
    row = await session.get(AllowedAdvertiser, key)
    if row is None:
        row = AllowedAdvertiser(publisher=key[0], advertiser=key[1], updated_block=ev.block_number)
        session.add(row)
    row.allowed = bool(a["allowed"])
    row.updated_block = ev.block_number
    bump_serve_cache()


@on_event("CreativeRegistry", "CreativeRevoked")
async def creative_revoked(session: AsyncSession, ev: DecodedEvent) -> None:
    creative = await session.get(Creative, int(ev.args["creative_id"]))
    if creative is None:
        log.warning("indexer.revoke_unknown_creative", creative_id=ev.args["creative_id"])
        return
    creative.revoked = True
    creative.updated_block = ev.block_number
    bump_serve_cache()


@on_event("CreativeRegistry", "ModeratorSet")
async def moderator_set(session: AsyncSession, ev: DecodedEvent) -> None:
    cfg = await _protocol_config(session, _chain_id_of(session))
    cfg.moderator = _addr(ev.args["moderator"])
    cfg.updated_block = ev.block_number


# ----------------------------------------------------------------------------- cursor


async def save_cursor(
    session: AsyncSession, chain_id: int, contract: str, block_number: int, block_hash: str
) -> None:
    cursor = await session.get(IndexerCursor, (chain_id, contract))
    if cursor is None:
        session.add(
            IndexerCursor(
                chain_id=chain_id,
                contract=contract,
                block_number=block_number,
                block_hash=block_hash,
            )
        )
    else:
        cursor.block_number, cursor.block_hash = block_number, block_hash


def _chain_id_of(session: AsyncSession) -> int:
    """The runner stamps the chain id on the session (``session.info``) before dispatching."""
    return int(session.info.get("chain_id", 0))


def utcnow() -> datetime:
    return datetime.now(UTC)
