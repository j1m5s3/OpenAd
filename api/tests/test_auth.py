"""SIWE nonce/verify/logout (ADR-0009)."""

from __future__ import annotations

from eth_account import Account
from eth_account.datastructures import SignedMessage
from eth_account.messages import encode_defunct
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.conftest import make_slot


def _sig_hex(signed: SignedMessage) -> str:
    return "0x" + bytes(signed.signature).hex()


def _siwe(address: str, nonce: str, chain_id: int = 31337) -> str:
    return (
        f"localhost wants you to sign in with your Ethereum account:\n"
        f"{address}\n\n"
        f"URI: http://localhost:5173\n"
        f"Version: 1\n"
        f"Chain ID: {chain_id}\n"
        f"Nonce: {nonce}\n"
        f"Issued At: 2026-09-11T00:00:00Z"
    )


async def test_siwe_roundtrip_and_house_ad(client: AsyncClient, session: AsyncSession) -> None:
    acct = Account.create()
    slot = make_slot(owner=acct.address.lower())
    session.add(slot)
    await session.commit()

    nonce_res = await client.post("/v1/auth/nonce")
    assert nonce_res.status_code == 200
    nonce = nonce_res.json()["nonce"]
    message = _siwe(acct.address, nonce)
    signed = acct.sign_message(encode_defunct(text=message))
    verify = await client.post(
        "/v1/auth/verify", json={"message": message, "signature": _sig_hex(signed)}
    )
    assert verify.status_code == 200
    assert verify.json()["address"] == acct.address.lower()

    put = await client.put(
        "/v1/slots/1/house-ad",
        json={"mediaUrl": "https://example.com/house.png", "clickUrl": "https://example.com/"},
    )
    assert put.status_code == 200
    assert put.json()["mediaUrl"] == "https://example.com/house.png"

    logout = await client.post("/v1/auth/logout")
    assert logout.status_code == 200
    denied = await client.put(
        "/v1/slots/1/house-ad",
        json={"mediaUrl": "https://example.com/x.png", "clickUrl": ""},
    )
    assert denied.status_code == 401


async def test_siwe_bad_nonce(client: AsyncClient) -> None:
    acct = Account.create()
    message = _siwe(acct.address, "not-issued")
    signed = acct.sign_message(encode_defunct(text=message))
    res = await client.post(
        "/v1/auth/verify", json={"message": message, "signature": _sig_hex(signed)}
    )
    assert res.status_code == 401
