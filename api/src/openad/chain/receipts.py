"""Canonical transaction receipts on Flashblocks RPCs (Base, Base Sepolia). Settler only.

Flashblocks-aware RPCs (Alchemy's Base endpoints among them) answer
``eth_getTransactionReceipt`` with a pre-confirmation as soon as the sequencer includes the
transaction: ``blockHash`` is all zeros and the block isn't sealed yet, while reads at
``latest`` (``eth_call``, ``eth_getTransactionCount``) still see the previous sealed block.
web3's ``wait_for_transaction_receipt`` returns that receipt at once, so a sender that treats
it as final, or builds its next transaction's nonce from ``latest``, acts on a block that
doesn't exist yet. `wait_canonical_receipt` returns only once the receipt names the canonical,
sealed block at its height. RPCs without Flashblocks return sealed receipts, which pass after
one extra ``eth_getBlockByNumber``.
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import Mapping
from typing import Any

from hexbytes import HexBytes
from web3 import AsyncWeb3
from web3.exceptions import BlockNotFound, TransactionNotFound
from web3.types import TxReceipt

ZERO_HASH = bytes(32)
POLL_SECONDS = 0.25


def _hash_bytes(value: Any) -> bytes:
    if value is None:
        return b""
    if isinstance(value, str):
        try:
            return bytes(HexBytes(value))
        except ValueError:
            return b""
    try:
        return bytes(value)
    except TypeError:
        return b""


def is_preconfirmation(receipt: Mapping[str, Any]) -> bool:
    """A Flashblocks pre-confirmation, or any receipt without a real block hash yet."""
    block_hash = _hash_bytes(receipt.get("blockHash"))
    return len(block_hash) != 32 or block_hash == ZERO_HASH or receipt.get("blockNumber") is None


async def is_canonical(w3: AsyncWeb3[Any], receipt: Mapping[str, Any]) -> bool:
    """True when the receipt's block is sealed and is the canonical block at its number."""
    if is_preconfirmation(receipt):
        return False
    try:
        block = await w3.eth.get_block(int(receipt["blockNumber"]))
    except BlockNotFound:
        return False
    return _hash_bytes(block.get("hash")) == _hash_bytes(receipt.get("blockHash"))


async def wait_canonical_receipt(
    w3: AsyncWeb3[Any], tx_hash: HexBytes, *, timeout_s: float, poll: float = POLL_SECONDS
) -> TxReceipt:
    """The transaction's receipt once its block is canonical, within `timeout_s` in total.

    web3's ``TimeExhausted`` propagates when no receipt appears at all; ``TimeoutError`` is
    raised when one appears but its block doesn't become canonical in time. A pre-confirmation
    that is dropped reads as no receipt, and polling continues until the deadline.
    """
    deadline = time.monotonic() + timeout_s
    receipt: TxReceipt | None = await w3.eth.wait_for_transaction_receipt(
        tx_hash, timeout=timeout_s
    )
    while True:
        if receipt is not None and await is_canonical(w3, receipt):
            return receipt
        left = deadline - time.monotonic()
        if left <= 0:
            raise TimeoutError(f"{tx_hash.to_0x_hex()} not canonical after {timeout_s:g}s")
        await asyncio.sleep(min(poll, left))
        try:
            receipt = await w3.eth.get_transaction_receipt(tx_hash)
        except TransactionNotFound:
            receipt = None
