"""Poll unpaid payable clicks and submit ``CampaignVault.settle_batch``.

HTTP ``api/`` must never import this module. Entry: ``python -m openad.settler``.
"""

from __future__ import annotations

import asyncio
from typing import Any, cast

from eth_account.signers.local import LocalAccount
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from web3 import AsyncWeb3

from openad.chain.deployments import Deployment
from openad.health import Liveness
from openad.logging import get_logger
from openad.models import Campaign, CampaignSettlement, ProtocolConfig
from openad.models.offchain import ClickEvent
from openad.settler.batches import PlannedBatch, plan_batches
from openad.settler.settings import SettlerSettings

log = get_logger(__name__)

DEFAULT_MAX_BATCH = 10_000_000_000


class SettlerRunner:
    def __init__(
        self,
        settings: SettlerSettings,
        sessions: async_sessionmaker[AsyncSession],
        deployment: Deployment,
        w3: AsyncWeb3[Any],
        account: LocalAccount,
        liveness: Liveness | None = None,
    ) -> None:
        self.settings = settings
        self.sessions = sessions
        self.deployment = deployment
        self.w3 = w3
        self.account = account
        self.liveness = liveness
        vault = deployment.require("CampaignVault")
        self.vault = w3.eth.contract(
            address=AsyncWeb3.to_checksum_address(vault.address), abi=vault.abi
        )

    async def run_forever(self) -> None:
        log.info("settler.start", chain_id=self.settings.chain_id)
        while True:
            try:
                await self.tick()
            except Exception:
                log.exception("settler.tick_failed")
            if self.liveness is not None:
                self.liveness.tick()
            await asyncio.sleep(self.settings.settler_poll_seconds)

    async def tick(self) -> None:
        async with self.sessions() as session:
            unpaid = (
                (
                    await session.execute(
                        select(ClickEvent).where(
                            ClickEvent.payable.is_(True),
                            ClickEvent.settled_batch_id.is_(None),
                        )
                    )
                )
                .scalars()
                .all()
            )
            if not unpaid:
                return
            remaining: dict[int, int] = {}
            camp_ids = {row.campaign_id for row in unpaid}
            for cid in camp_ids:
                camp = await session.get(Campaign, cid)
                if camp is None or camp.closed:
                    continue
                remaining[cid] = camp.remaining
            cfg = await session.get(ProtocolConfig, self.settings.chain_id)
            max_batch = (
                int(cfg.max_batch_charge)
                if cfg is not None and cfg.max_batch_charge
                else DEFAULT_MAX_BATCH
            )
            planned = plan_batches(list(unpaid), remaining_of=remaining, max_batch_charge=max_batch)
            for batch in planned:
                await self._submit(session, batch)

    async def _submit(self, session: AsyncSession, batch: PlannedBatch) -> None:
        hex_id = "0x" + batch.batch_id.hex()
        existing = await session.get(CampaignSettlement, hex_id)
        if existing is not None:
            await session.execute(
                update(ClickEvent)
                .where(ClickEvent.id.in_(batch.click_ids))
                .values(settled_batch_id=hex_id)
            )
            await session.commit()
            return
        nonce = await self.w3.eth.get_transaction_count(self.account.address)
        tx = await self.vault.functions.settle_batch(
            batch.campaign_id,
            batch.payable_clicks,
            batch.charged,
            batch.batch_id,
        ).build_transaction(
            {
                "from": self.account.address,
                "nonce": nonce,
                "chainId": self.settings.chain_id,
            }
        )
        signed = self.account.sign_transaction(cast(Any, tx))
        raw = signed.raw_transaction
        try:
            tx_hash = await self.w3.eth.send_raw_transaction(raw)
            receipt = await self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
        except Exception:
            log.exception(
                "settler.submit_failed", campaign_id=batch.campaign_id, charged=batch.charged
            )
            await session.rollback()
            return
        status = int(receipt.get("status", 0))
        if status != 1:
            log.warning(
                "settler.tx_reverted", tx=tx_hash.to_0x_hex(), campaign_id=batch.campaign_id
            )
            return
        await session.execute(
            update(ClickEvent)
            .where(ClickEvent.id.in_(batch.click_ids))
            .values(settled_batch_id=hex_id)
        )
        await session.commit()
        log.info(
            "settler.settled",
            campaign_id=batch.campaign_id,
            charged=batch.charged,
            clicks=batch.payable_clicks,
            tx=tx_hash.to_0x_hex(),
        )
