"""Indexer reorg rewind and optional Anvil replay (ROADMAP 2.1)."""

from __future__ import annotations

from typing import Any, ClassVar

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from openad.chain.deployments import ContractInfo, Deployment
from openad.config import Settings
from openad.db.session import Database
from openad.indexer.runner import CURSOR_NAME, IndexerRunner
from openad.models import IndexerCursor, Slot


class _FakeEth:
    def __init__(self, *, cursor_hash: bytes, latest: int = 100) -> None:
        self._cursor_hash = cursor_hash
        self.block_number = latest

    async def get_block(self, number: int | str) -> dict[str, Any]:
        if number == "safe":
            raise RuntimeError("no safe tag")
        n = int(number)
        if n == 80:
            return {"number": n, "hash": self._cursor_hash}
        return {"number": n, "hash": bytes.fromhex("cc" * 32)}

    async def get_logs(self, _filter: dict[str, Any]) -> list[Any]:
        return []

    def contract(self, **_kwargs: Any) -> Any:
        class _C:
            events: ClassVar[dict[str, Any]] = {}

        return _C()


class _FakeW3:
    def __init__(self, eth: _FakeEth) -> None:
        self.eth = eth


def _empty_deployment() -> Deployment:
    return Deployment(
        chain_id=31337,
        network="anvil",
        contracts={
            "AdSlot": ContractInfo(
                name="AdSlot",
                address="0x" + "11" * 20,
                start_block=0,
                abi=[],
            )
        },
    )


async def test_reorg_rewinds_cursor(
    settings: Settings, db: Database, session: AsyncSession
) -> None:
    session.add(
        IndexerCursor(
            chain_id=31337,
            contract=CURSOR_NAME,
            block_number=80,
            block_hash="0x" + "aa" * 32,
        )
    )
    await session.commit()
    w3 = _FakeW3(_FakeEth(cursor_hash=bytes.fromhex("bb" * 32)))
    runner = IndexerRunner(settings, db.sessions, _empty_deployment(), w3)  # type: ignore[arg-type]
    start = await runner.start_block()
    assert start == 80 - settings.indexer_reorg_depth


async def test_matching_hash_continues(
    settings: Settings, db: Database, session: AsyncSession
) -> None:
    session.add(
        IndexerCursor(
            chain_id=31337,
            contract=CURSOR_NAME,
            block_number=80,
            block_hash="0x" + "aa" * 32,
        )
    )
    await session.commit()
    w3 = _FakeW3(_FakeEth(cursor_hash=bytes.fromhex("aa" * 32)))
    runner = IndexerRunner(settings, db.sessions, _empty_deployment(), w3)  # type: ignore[arg-type]
    start = await runner.start_block()
    assert start == 81


@pytest.mark.integration
async def test_anvil_replay_from_zero(settings: Settings, db: Database) -> None:
    """Replay protocol logs from genesis when a local Anvil artifact is present."""
    from pathlib import Path

    from openad.chain.client import make_web3
    from openad.chain.deployments import DeploymentsError, load_deployment

    artifact = Path(settings.deployments_path) / "31337.json"
    if not artifact.exists():
        pytest.skip("no Anvil deployments artifact")
    try:
        deployment = load_deployment(settings.deployments_path, 31337)
    except DeploymentsError:
        pytest.skip("deployments artifact unreadable")
    if not deployment.protocol_contracts:
        pytest.skip("protocol contracts not deployed")
    w3 = make_web3("http://127.0.0.1:8545", timeout=2.0)
    try:
        await w3.eth.block_number
    except Exception:
        pytest.skip("Anvil RPC not reachable")
    settings.rpc_url = "http://127.0.0.1:8545"
    runner = IndexerRunner(settings, db.sessions, deployment, w3)
    handled = await runner.run_once()
    assert handled >= 1
    async with db.sessions() as session:
        slot = await session.get(Slot, 1)
    assert slot is not None
