"""Shared test helpers (EIP-2612 permit signing, unit conversions).

Used by MockUSDC tests today and by Marketplace.buy_with_permit tests in ROADMAP 1.3.
"""

from __future__ import annotations

from eth_account import Account
from eth_account.messages import encode_typed_data

USDC_DECIMALS = 6


def usdc(amount: float | int) -> int:
    """Human USDC -> base units. Test-only convenience; production code never uses floats."""
    return int(round(amount * 10**USDC_DECIMALS))


def sign_permit(
    *,
    token,
    owner_key: str,
    spender: str,
    value: int,
    deadline: int,
    chain_id: int,
) -> tuple[int, bytes, bytes]:
    """Return (v, r, s) for an EIP-2612 permit on a snekmate-style token."""
    owner = Account.from_key(owner_key).address
    typed = {
        "types": {
            "EIP712Domain": [
                {"name": "name", "type": "string"},
                {"name": "version", "type": "string"},
                {"name": "chainId", "type": "uint256"},
                {"name": "verifyingContract", "type": "address"},
            ],
            "Permit": [
                {"name": "owner", "type": "address"},
                {"name": "spender", "type": "address"},
                {"name": "value", "type": "uint256"},
                {"name": "nonce", "type": "uint256"},
                {"name": "deadline", "type": "uint256"},
            ],
        },
        "primaryType": "Permit",
        "domain": {
            "name": token.name(),
            "version": "2",
            "chainId": chain_id,
            "verifyingContract": token.address,
        },
        "message": {
            "owner": owner,
            "spender": spender,
            "value": value,
            "nonce": token.nonces(owner),
            "deadline": deadline,
        },
    }
    signed = Account.sign_message(encode_typed_data(full_message=typed), owner_key)
    return signed.v, signed.r.to_bytes(32, "big"), signed.s.to_bytes(32, "big")
