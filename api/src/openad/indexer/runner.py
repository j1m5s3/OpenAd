"""Poll loop: fetch logs up to the safe head, decode, dispatch, persist cursor.

docs/ARCHITECTURE.md section 3.7.

Design points
- ONE cursor for all protocol contracts (``IndexerCursor.contract == "protocol"``) and one
  multi-address ``eth_getLogs`` per range, so events are applied in global
  ``(blockNumber, logIndex)`` order. This guarantees cross-contract ordering inside a
  transaction (e.g. ``AdSlot.LeaseSet`` before ``Marketplace.Purchased``) and across a replay.
- Reorg handling: we remember ``(block_number, block_hash)``; before extending we re-read the
  hash of the cursor block and rewind ``indexer_reorg_depth`` blocks when it changed. Handlers
  are idempotent, so re-processing is safe.
"""

from __future__ import annotations

import asyncio
from typing import Any, cast

from eth_typing import ABIEvent
from eth_utils.abi import event_abi_to_log_topic
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from web3 import AsyncWeb3
from web3.types import LogReceipt

from openad.chain.deployments import ContractInfo, Deployment
from openad.config import Settings
from openad.indexer import handlers
from openad.indexer.events import DecodedEvent
from openad.logging import get_logger
from openad.models import (
    AllowedAdvertiser,
    Approval,
    Campaign,
    CampaignSettlement,
    Creative,
    CreativeVerification,
    IndexerCursor,
    Lease,
    ProtocolConfig,
    Slot,
    Terms,
)
from openad.models.offchain import ClickEvent, DomainVerification, HouseAd, ServeEvent

log = get_logger(__name__)

CURSOR_NAME = "protocol"

# Chain-derived rows plus FK dependents. Off-chain sessions/nonces are kept.
# Order is children-first so Postgres FKs succeed on Anvil chain reset.
_ANVIL_RESET_MODELS: tuple[type[Any], ...] = (
    ClickEvent,
    CampaignSettlement,
    Campaign,
    ServeEvent,
    HouseAd,
    DomainVerification,
    Lease,
    Terms,
    CreativeVerification,
    Approval,
    AllowedAdvertiser,
    Creative,
    Slot,
    ProtocolConfig,
    IndexerCursor,
)


class IndexerRunner:
    def __init__(
        self,
        settings: Settings,
        sessions: async_sessionmaker[AsyncSession],
        deployment: Deployment,
        w3: AsyncWeb3[Any],
    ) -> None:
        self.settings = settings
        self.sessions = sessions
        self.deployment = deployment
        self.w3 = w3
        self.contracts: list[ContractInfo] = deployment.protocol_contracts
        # address (lowercase) -> (contract name, topic0 -> web3 event decoder)
        self._decoders: dict[str, tuple[str, dict[bytes, Any]]] = {
            info.address.lower(): (info.name, self._build_decoder(info)) for info in self.contracts
        }

    def _build_decoder(self, info: ContractInfo) -> dict[bytes, Any]:
        contract = self.w3.eth.contract(
            address=AsyncWeb3.to_checksum_address(info.address), abi=info.abi
        )
        decoder: dict[bytes, Any] = {}
        for item in info.abi:
            if item.get("type") == "event" and not item.get("anonymous", False):
                topic = event_abi_to_log_topic(cast(ABIEvent, item))
                decoder[bytes(topic)] = contract.events[item["name"]]()
        return decoder

    @property
    def genesis_block(self) -> int:
        return min((c.start_block for c in self.contracts), default=0)

    # ------------------------------------------------------------------ head / cursor

    async def _latest_block(self) -> int:
        latest_raw: Any = self.w3.eth.block_number
        if callable(latest_raw) and not hasattr(latest_raw, "__await__"):
            latest_raw = latest_raw()
        if hasattr(latest_raw, "__await__"):
            return int(await latest_raw)
        return int(latest_raw)

    async def safe_head(self) -> int:
        """Block number safe to index.

        Anvil implements the ``safe`` tag ~32 blocks behind ``latest`` and does not
        mine empty blocks, so local leases would never index. Chain 31337 uses
        ``latest - OPENAD_INDEXER_CONFIRMATIONS`` (ARCHITECTURE §3.7).
        """
        latest = await self._latest_block()
        if self.deployment.chain_id == 31337:
            return max(0, int(latest) - self.settings.indexer_confirmations)
        try:
            block = await self.w3.eth.get_block("safe")
            return int(block["number"])
        except Exception:
            return max(0, int(latest) - self.settings.indexer_confirmations)

    async def start_block(self) -> int:
        if self.deployment.chain_id == 31337:
            latest = await self._latest_block()
            if await self._anvil_has_future_rows(latest):
                log.warning("indexer.anvil_future_rows", latest=latest)
                await self._wipe_anvil_derived()
                return self.genesis_block
        async with self.sessions() as session:
            cursor = await session.get(IndexerCursor, (self.deployment.chain_id, CURSOR_NAME))
        if cursor is None:
            return self.genesis_block
        try:
            block = await self.w3.eth.get_block(cursor.block_number)
        except Exception:
            log.warning(
                "indexer.cursor_block_missing",
                cursor=cursor.block_number,
                hint="local Anvil has no volume; compose down resets the chain",
            )
            if self.deployment.chain_id == 31337:
                await self._wipe_anvil_derived()
            return self.genesis_block
        if _hex(block["hash"]) != cursor.block_hash.lower():
            rewind = max(
                self.genesis_block, cursor.block_number - self.settings.indexer_reorg_depth
            )
            log.warning("indexer.reorg_detected", cursor=cursor.block_number, rewind_to=rewind)
            return rewind
        return cursor.block_number + 1

    async def _anvil_has_future_rows(self, latest: int) -> bool:
        async with self.sessions() as session:
            slot = (
                await session.execute(
                    select(Slot.slot_id).where(Slot.updated_block > latest).limit(1)
                )
            ).first()
            if slot is not None:
                return True
            creative = (
                await session.execute(
                    select(Creative.creative_id).where(Creative.updated_block > latest).limit(1)
                )
            ).first()
            return creative is not None

    async def _wipe_anvil_derived(self) -> None:
        """Drop derived cache so a new Anvil life cannot mix with the previous one."""
        async with self.sessions() as session:
            for model in _ANVIL_RESET_MODELS:
                await session.execute(delete(model))
            await session.commit()
        log.warning("indexer.anvil_cache_wiped")

    # ------------------------------------------------------------------ processing

    async def run_once(self) -> int:
        """Index up to the safe head. Returns the number of logs handled."""
        if not self.contracts:
            return 0
        head = await self.safe_head()
        start = await self.start_block()
        handled = 0
        while start <= head:
            end = min(start + self.settings.indexer_batch_blocks - 1, head)
            handled += await self.process_range(start, end)
            start = end + 1
        return handled

    async def process_range(self, start: int, end: int) -> int:
        logs: list[LogReceipt] = await self.w3.eth.get_logs(
            {
                "address": [AsyncWeb3.to_checksum_address(c.address) for c in self.contracts],
                "fromBlock": start,
                "toBlock": end,
            }
        )
        end_block = await self.w3.eth.get_block(end)
        events = [e for e in map(self.decode, logs) if e is not None]
        events.sort(key=lambda e: (e.block_number, e.log_index))

        async with self.sessions() as session:
            session.info["chain_id"] = self.deployment.chain_id
            for event in events:
                await handlers.dispatch(session, event)
            await handlers.save_cursor(
                session, self.deployment.chain_id, CURSOR_NAME, end, _hex(end_block["hash"])
            )
            await session.commit()
        if events:
            log.info("indexer.range", start=start, end=end, events=len(events))
        await self._verify_pending()
        return len(events)

    async def _verify_pending(self) -> None:
        from openad.services import media as media_service

        try:
            async with self.sessions() as session:
                await media_service.verify_pending(session, self.settings)
        except Exception:
            log.exception("indexer.verify_failed")

    def decode(self, raw: LogReceipt) -> DecodedEvent | None:
        entry = self._decoders.get(str(raw["address"]).lower())
        if entry is None or not raw["topics"]:
            return None
        name, decoder = entry
        event = decoder.get(bytes(raw["topics"][0]))
        if event is None:
            return None
        decoded = event.process_log(raw)
        return DecodedEvent(
            contract=name,
            name=str(decoded["event"]),
            args=dict(decoded["args"]),
            block_number=int(raw["blockNumber"]),
            block_hash=_hex(raw["blockHash"]),
            tx_hash=_hex(raw["transactionHash"]),
            log_index=int(raw["logIndex"]),
        )

    async def run_forever(self) -> None:
        log.info(
            "indexer.start",
            chain_id=self.deployment.chain_id,
            contracts=[c.name for c in self.contracts],
            genesis_block=self.genesis_block,
        )
        while True:
            try:
                await self.run_once()
            except Exception:
                log.exception("indexer.iteration_failed")
            await asyncio.sleep(self.settings.indexer_poll_seconds)


def _hex(value: bytes | str | Any) -> str:
    if isinstance(value, bytes | bytearray):
        return "0x" + bytes(value).hex()
    text = str(value)
    return text.lower() if text.startswith("0x") else "0x" + text.lower()
