"""Settler sends against a Flashblocks RPC (Alchemy on Base Sepolia): chain/receipts.py.

Fakes only, no chain: `FlashblocksRpc` answers the way a Flashblocks-aware endpoint does, behind
a real ``AsyncWeb3``, so web3's own receipt wait, nonce read and transaction building run.
"""

from __future__ import annotations

from typing import Any

import pytest
from eth_account import Account
from eth_account.typed_transactions import TypedTransaction
from eth_hash.auto import keccak
from hexbytes import HexBytes
from sqlalchemy import select
from web3 import AsyncWeb3
from web3.providers.async_base import AsyncBaseProvider
from web3.types import RPCEndpoint, RPCResponse

from openad.chain.deployments import ContractInfo, Deployment
from openad.chain.receipts import is_preconfirmation, wait_canonical_receipt
from openad.db.session import Database
from openad.models.offchain import ClickEvent
from openad.settler.runner import SettlerRunner
from openad.settler.settings import SettlerSettings
from tests.conftest import make_campaign, make_creative, make_slot

KEY = "0x" + "44" * 32  # a test-only key
VAULT = "0x" + "ab" * 20
BASE_SEPOLIA = 84532
ZERO = "0x" + "00" * 32
SETTLE_ABI: list[dict[str, Any]] = [
    {
        "type": "function",
        "name": "settle_batch",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "campaign_id", "type": "uint256"},
            {"name": "payable_clicks", "type": "uint256"},
            {"name": "charged_usdc", "type": "uint256"},
            {"name": "batch_id", "type": "bytes32"},
        ],
        "outputs": [],
    }
]
DEPLOYMENT = Deployment(
    chain_id=BASE_SEPOLIA,
    network="test",
    contracts={"CampaignVault": ContractInfo("CampaignVault", VAULT, 0, SETTLE_ABI)},
)


def _block_hash(number: int) -> str:
    return "0x" + number.to_bytes(32, "big").hex()


class FlashblocksRpc(AsyncBaseProvider):
    """A Base-like chain behind a Flashblocks RPC.

    A sent transaction joins the block being built. The first read of its receipt is a
    pre-confirmation (zero ``blockHash``, the unsealed block's number); the block seals on the
    second read, or never when `seal` is False. ``latest`` reads see sealed blocks only, and a
    raw transaction whose nonce isn't the sender's next one is refused, as a node does.
    """

    def __init__(self, *, seal: bool = True, reorged: bool = False) -> None:
        super().__init__()
        self.seal = seal
        self.reorged = reorged  # the canonical block at the receipt's height has another hash
        self.head = 100
        self.building: list[str] = []
        self.sealed: dict[str, int] = {}
        self.reads: dict[str, int] = {}
        self.nonces: list[int] = []
        self.refused: list[int] = []
        self.calls: list[str] = []

    def add(self, tx_hash: str) -> None:
        self.building.append(tx_hash)

    def _seal(self) -> None:
        self.head += 1
        for tx_hash in self.building:
            self.sealed[tx_hash] = self.head
        self.building.clear()

    def _receipt(self, tx_hash: str, block_hash: str, number: int) -> dict[str, Any]:
        return {
            "transactionHash": tx_hash,
            "transactionIndex": "0x0",
            "blockHash": block_hash,
            "blockNumber": hex(number),
            "status": "0x1",
            "gasUsed": "0x5208",
            "cumulativeGasUsed": "0x5208",
            "effectiveGasPrice": "0x2",
            "logs": [],
            "type": "0x2",
        }

    def _result(self, method: str, params: Any) -> Any:
        if method == "eth_chainId":
            return hex(BASE_SEPOLIA)
        if method == "eth_estimateGas":
            return hex(100_000)
        if method == "eth_maxPriorityFeePerGas":
            return hex(1)
        if method == "eth_getTransactionCount":
            pending = len(self.building) if params[1] == "pending" else 0
            return hex(len(self.sealed) + pending)
        if method == "eth_getBlockByNumber":
            number = self.head if params[0] == "latest" else int(params[0], 16)
            if number > self.head:
                return None  # not sealed yet
            block_hash = _block_hash(number + 1 if self.reorged else number)
            return {"number": hex(number), "hash": block_hash, "baseFeePerGas": hex(1)}
        if method == "eth_sendRawTransaction":
            raw = HexBytes(params[0])
            nonce = int(TypedTransaction.from_bytes(raw).as_dict()["nonce"])
            if nonce != len(self.sealed) + len(self.building):
                self.refused.append(nonce)
                raise ValueError("nonce too low")
            self.nonces.append(nonce)
            tx_hash = "0x" + keccak(bytes(raw)).hex()
            self.add(tx_hash)
            return tx_hash
        if method == "eth_getTransactionReceipt":
            tx_hash = str(params[0]).lower()
            if tx_hash in self.building:
                self.reads[tx_hash] = self.reads.get(tx_hash, 0) + 1
                if self.seal and self.reads[tx_hash] >= 2:
                    self._seal()
            if tx_hash in self.sealed:
                number = self.sealed[tx_hash]
                return self._receipt(tx_hash, _block_hash(number), number)
            if tx_hash in self.building:
                return self._receipt(tx_hash, ZERO, self.head + 1)
            return None
        raise AssertionError(f"unexpected RPC {method}")

    async def make_request(self, method: RPCEndpoint, params: Any) -> RPCResponse:
        self.calls.append(str(method))
        try:
            result = self._result(str(method), params)
        except ValueError as exc:
            return {"jsonrpc": "2.0", "id": 1, "error": {"code": -32000, "message": str(exc)}}
        return {"jsonrpc": "2.0", "id": 1, "result": result}


TX_HASH = "0x" + "cd" * 32


async def test_a_pre_confirmation_is_waited_out() -> None:
    rpc = FlashblocksRpc()
    rpc.add(TX_HASH)
    receipt = await wait_canonical_receipt(AsyncWeb3(rpc), HexBytes(TX_HASH), timeout_s=5, poll=0)
    assert not is_preconfirmation(receipt)
    assert receipt["blockNumber"] == 101
    assert rpc.reads[TX_HASH] == 2


async def test_a_sealed_receipt_returns_after_one_block_read() -> None:
    rpc = FlashblocksRpc()
    rpc.add(TX_HASH)
    rpc._seal()
    receipt = await wait_canonical_receipt(AsyncWeb3(rpc), HexBytes(TX_HASH), timeout_s=5, poll=0)
    assert receipt["blockNumber"] == 101
    assert rpc.calls == ["eth_getTransactionReceipt", "eth_getBlockByNumber"]


async def test_a_block_that_never_seals_times_out() -> None:
    rpc = FlashblocksRpc(seal=False)
    rpc.add(TX_HASH)
    with pytest.raises(TimeoutError, match="not canonical"):
        await wait_canonical_receipt(AsyncWeb3(rpc), HexBytes(TX_HASH), timeout_s=0.2, poll=0.01)


async def test_a_receipt_off_the_canonical_chain_times_out() -> None:
    rpc = FlashblocksRpc(reorged=True)
    rpc.add(TX_HASH)
    with pytest.raises(TimeoutError, match="not canonical"):
        await wait_canonical_receipt(AsyncWeb3(rpc), HexBytes(TX_HASH), timeout_s=0.2, poll=0.01)


def _click(click_id: int, campaign_id: int) -> ClickEvent:
    return ClickEvent(
        id=click_id,
        token_hash=f"{click_id:064x}",
        slot_id=1,
        campaign_id=campaign_id,
        creative_id=7,
        payable=True,
        gsp_cpc=100_000,
        at=1_700_000_000,
    )


async def test_back_to_back_batches_each_get_the_next_nonce(db: Database) -> None:
    """Two campaigns settle in one tick. With web3's own wait the second batch read its nonce
    while the first was only pre-confirmed, reused it, and was refused."""
    async with db.sessions() as session:
        session.add_all(
            [
                make_slot(),
                make_creative(),
                make_campaign(campaign_id=1),
                make_campaign(campaign_id=2),
                _click(1, campaign_id=1),
                _click(2, campaign_id=2),
            ]
        )
        await session.commit()
    rpc = FlashblocksRpc()
    settings = SettlerSettings(chain_id=BASE_SEPOLIA, _env_file=None)  # type: ignore[call-arg]
    runner = SettlerRunner(settings, db.sessions, DEPLOYMENT, AsyncWeb3(rpc), Account.from_key(KEY))

    await runner.tick()

    assert rpc.refused == []
    assert rpc.nonces == [0, 1]
    async with db.sessions() as session:
        clicks = (await session.execute(select(ClickEvent))).scalars().all()
    assert [c.settled_batch_id is not None for c in clicks] == [True, True]
