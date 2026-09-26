"""script/receipts.py: canonical receipts on Flashblocks RPCs (Alchemy on Base Sepolia)."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest
from boa.rpc import RPC

from script import deploy as deploy_script
from script import receipts
from script import set_settler as set_settler_script

TX = "0x" + "ab" * 32
BLOCK = "0x2d1ea08"
SEALED = "0x" + "cd" * 32
PRECONF = {"status": "0x1", "blockHash": "0x" + "00" * 32, "blockNumber": BLOCK}
CANONICAL = {
    "status": "0x1",
    "blockHash": SEALED,
    "blockNumber": BLOCK,
    "contractAddress": "0x" + "11" * 20,
}


class FlashblocksRPC(RPC):
    """titanoboa's own receipt wait over an RPC that answers like Alchemy's Base endpoints.

    Each ``eth_getTransactionReceipt`` pops the next scripted receipt (the last one repeats);
    ``eth_getBlockByNumber`` is ``None`` until a canonical receipt has been served, as for a
    block that isn't sealed yet, then returns the block with hash `block_hash`.
    """

    def __init__(self, receipts_: list[dict[str, Any] | None], block_hash: str = SEALED):
        self.receipts = list(receipts_)
        self.block_hash = block_hash
        self.sealed = False
        self.calls: list[str] = []

    def fetch(self, method: str, params: Any) -> Any:
        self.calls.append(method)
        if method == "eth_getTransactionReceipt":
            receipt = self.receipts.pop(0) if len(self.receipts) > 1 else self.receipts[0]
            if receipt is not None and int(receipt["blockHash"], 16) != 0:
                self.sealed = True
            return receipt
        if method == "eth_getBlockByNumber":
            return {"hash": self.block_hash} if self.sealed else None
        raise AssertionError(method)


def _env(rpc: RPC) -> SimpleNamespace:
    return SimpleNamespace(_rpc=rpc)


@pytest.fixture
def no_sleep(monkeypatch) -> None:
    monkeypatch.setattr(receipts.time, "sleep", lambda _s: None)


def test_unguarded_titanoboa_returns_the_pre_confirmation() -> None:
    """The failure this module exists for: titanoboa's wait returns the zero-hash receipt,
    and the RPC can't serve the block it names, which is what re-forking then reads."""
    rpc = FlashblocksRPC([PRECONF, CANONICAL])
    receipt = rpc.wait_for_tx_receipt(TX, 30)
    assert int(receipt["blockHash"], 16) == 0
    assert rpc.fetch("eth_getBlockByNumber", [receipt["blockNumber"], False]) is None


def test_waits_past_pre_confirmations(no_sleep) -> None:
    rpc = FlashblocksRPC([PRECONF, PRECONF, CANONICAL])
    receipts.require_canonical_receipts(_env(rpc))
    receipt = rpc.wait_for_tx_receipt(TX, 30)
    assert receipt["blockHash"] == SEALED
    assert receipt["contractAddress"] == CANONICAL["contractAddress"]
    assert rpc.calls.count("eth_getTransactionReceipt") == 3


def test_a_canonical_receipt_returns_at_once() -> None:
    rpc = FlashblocksRPC([CANONICAL])
    receipts.require_canonical_receipts(_env(rpc))
    assert rpc.wait_for_tx_receipt(TX, 30) is CANONICAL
    assert rpc.calls == ["eth_getTransactionReceipt", "eth_getBlockByNumber"]


def test_a_dropped_pre_confirmation_keeps_polling(no_sleep) -> None:
    rpc = FlashblocksRPC([PRECONF, None, CANONICAL])
    receipts.require_canonical_receipts(_env(rpc))
    assert rpc.wait_for_tx_receipt(TX, 30)["blockHash"] == SEALED


def test_a_receipt_from_a_reorged_block_times_out(monkeypatch, no_sleep) -> None:
    clock = iter(range(0, 10_000, 50))
    monkeypatch.setattr(receipts.time, "time", lambda: next(clock))
    rpc = FlashblocksRPC([CANONICAL], block_hash="0x" + "ee" * 32)
    receipts.require_canonical_receipts(_env(rpc), timeout=120)
    with pytest.raises(ValueError, match="canonical receipt"):
        rpc.wait_for_tx_receipt(TX, 30)


def test_a_transient_rpc_error_is_retried(no_sleep) -> None:
    class RateLimited(FlashblocksRPC):
        failed = False

        def fetch(self, method: str, params: Any) -> Any:
            if method == "eth_getBlockByNumber" and not self.failed:
                self.failed = True
                raise RuntimeError("429 Too Many Requests")
            return super().fetch(method, params)

    rpc = RateLimited([CANONICAL])
    receipts.require_canonical_receipts(_env(rpc))
    assert rpc.wait_for_tx_receipt(TX, 30)["blockHash"] == SEALED
    assert rpc.failed


def test_installing_twice_wraps_once() -> None:
    rpc = FlashblocksRPC([CANONICAL])
    env = _env(rpc)
    receipts.require_canonical_receipts(env)
    wrapped = rpc.wait_for_tx_receipt
    receipts.require_canonical_receipts(env)
    assert rpc.wait_for_tx_receipt is wrapped


def test_pyevm_has_no_rpc_to_wrap() -> None:
    receipts.require_canonical_receipts(SimpleNamespace())  # no _rpc: nothing to do


def test_titanoboa_still_exposes_the_hooked_rpc() -> None:
    # The guard silently no-ops if titanoboa renames these; fail loudly on an upgrade instead.
    from boa.network import NetworkEnv
    from boa.rpc import EthereumRPC

    assert hasattr(EthereumRPC, "wait_for_tx_receipt")
    assert hasattr(EthereumRPC, "fetch_uncached")
    assert "_rpc" in NetworkEnv.__init__.__code__.co_names


def test_deploy_installs_the_guard_before_any_transaction(monkeypatch) -> None:
    calls: list[str] = []
    monkeypatch.setattr(
        deploy_script, "require_canonical_receipts", lambda _env: calls.append("guard")
    )

    def first_transaction() -> None:
        calls.append("usdc")
        raise RuntimeError("stop after the first transaction")

    monkeypatch.setattr(deploy_script, "deploy_usdc", first_transaction)
    with pytest.raises(RuntimeError, match="stop after"):
        deploy_script.deploy()
    assert calls == ["guard", "usdc"]


def test_set_settler_installs_the_guard_before_loading(monkeypatch) -> None:
    calls: list[str] = []
    monkeypatch.setattr(
        set_settler_script,
        "get_active_network",
        lambda: SimpleNamespace(name="base-sepolia", chain_id=84532),
    )
    monkeypatch.setattr(
        set_settler_script, "require_canonical_receipts", lambda _env: calls.append("guard")
    )

    def load(_chain_id: int) -> None:
        calls.append("load")
        raise RuntimeError("stop after loading")

    monkeypatch.setattr(set_settler_script, "load_vault", load)
    with pytest.raises(RuntimeError, match="stop after"):
        set_settler_script.moccasin_main()
    assert calls == ["guard", "load"]
