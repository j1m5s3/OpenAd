"""SIWE nonce/verify/logout (ADR-0009)."""

from __future__ import annotations

from eth_account import Account
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.conftest import make_slot
from tests.siwe_helpers import new_nonce, siwe_message, verify


async def test_siwe_roundtrip_and_house_ad(client: AsyncClient, session: AsyncSession) -> None:
    acct = Account.create()
    slot = make_slot(owner=acct.address.lower())
    session.add(slot)
    await session.commit()

    res = await verify(client, acct, siwe_message(acct.address, await new_nonce(client)))
    assert res.status_code == 200
    assert res.json()["address"] == acct.address.lower()

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
    res = await verify(client, acct, siwe_message(acct.address, "notissued"))
    assert res.status_code == 401
    assert res.json() == {"error": "unauthorized", "message": "invalid nonce"}
