"""Wait for canonical receipts on Flashblocks RPCs (Base, Base Sepolia).

Flashblocks-aware RPCs (Alchemy's Base endpoints among them) answer
``eth_getTransactionReceipt`` with a pre-confirmation as soon as the sequencer includes the
transaction: ``blockHash`` is all zeros and the block isn't sealed yet. titanoboa takes the
first non-null receipt as final and re-forks at its ``blockNumber``; the RPC has no such block
yet, so the broadcast crashes with ``'NoneType' object is not subscriptable`` after the first
transaction. `require_canonical_receipts` makes titanoboa keep polling until the receipt names
the canonical, sealed block at its height. Receipts from non-Flashblocks RPCs (Anvil,
``https://sepolia.base.org``) are canonical at once, so they pass through after one extra
``eth_getBlockByNumber``.
"""

from __future__ import annotations

import time
from typing import Any

import boa

# Base seals a block every 2 s; this only bounds a stuck RPC.
CANONICAL_RECEIPT_TIMEOUT = 180.0
_INSTALLED = "_openad_canonical_receipts"


def is_canonical(rpc: Any, receipt: dict[str, Any] | None) -> bool:
    """True when `receipt` has a non-zero block hash equal to the canonical block at its height."""
    block_hash = (receipt or {}).get("blockHash") or "0x0"
    block_number = (receipt or {}).get("blockNumber")
    if not block_number or int(block_hash, 16) == 0:
        return False
    block = rpc.fetch_uncached("eth_getBlockByNumber", [block_number, False])
    return bool(block) and str(block.get("hash") or "").lower() == block_hash.lower()


def require_canonical_receipts(
    env: Any = None, timeout: float = CANONICAL_RECEIPT_TIMEOUT, poll: float = 1.0
) -> None:
    """Wrap the network env's receipt wait so it returns only canonical receipts.

    A no-op without an RPC (pyevm) and when already installed. A transient RPC error (a 429
    from a rate-limited endpoint, say) after the transaction was sent is retried until the
    deadline rather than ending the broadcast part-way through.
    """
    rpc = getattr(env or boa.env, "_rpc", None)
    if rpc is None or not hasattr(rpc, "fetch_uncached") or getattr(rpc, _INSTALLED, False):
        return
    first_receipt = rpc.wait_for_tx_receipt

    def wait_for_tx_receipt(tx_hash: str, timeout_s: float, poll_latency: float = 0.25) -> Any:
        deadline = time.time() + max(float(timeout_s), timeout)
        receipt = first_receipt(tx_hash, timeout_s, poll_latency)
        while True:
            try:
                if is_canonical(rpc, receipt):
                    return receipt
            except Exception:
                if time.time() + poll > deadline:
                    raise
            if time.time() + poll > deadline:
                raise ValueError(f"Timed out waiting for a canonical receipt ({tx_hash})")
            time.sleep(poll)
            try:
                # A dropped pre-confirmation reads as None: keep the last receipt and poll on.
                receipt = rpc.fetch_uncached("eth_getTransactionReceipt", [tx_hash]) or receipt
            except Exception:
                if time.time() + poll > deadline:
                    raise

    rpc.wait_for_tx_receipt = wait_for_tx_receipt
    setattr(rpc, _INSTALLED, True)
