"""Shared SIWE helpers for the API tests (EIP-4361 messages signed with throwaway keys).

Messages default to the web origin the default ``OPENAD_CORS_ORIGINS`` allows, so they pass
the domain/URI binding (ADR-0009 amendment), with a fresh ``Issued At``. Keys come from
``Account.create()``; no key is ever stored.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime

from eth_account.messages import encode_defunct
from eth_account.signers.local import LocalAccount
from httpx import AsyncClient, Response

WEB_ORIGIN = "http://localhost:5173"  # the first default OPENAD_CORS_ORIGINS entry
WEB_DOMAIN = "localhost:5173"  # its authority: host and port, like `window.location.host`
CHAIN_ID = 31337


def iso(moment: datetime) -> str:
    """RFC 3339 in UTC with milliseconds, like JavaScript's ``Date.toISOString()``."""
    return moment.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def siwe_message(
    address: str,
    nonce: str,
    *,
    domain: str = WEB_DOMAIN,
    uri: str = WEB_ORIGIN,
    chain_id: int = CHAIN_ID,
    issued_at: datetime | None = None,
    statement: str | None = None,
    extra: Sequence[str] = (),
) -> str:
    """The message the web app's ``buildSiweMessage`` (viem's ``createSiweMessage``) produces,
    in EIP-4361's ``address LF LF [statement LF] LF "URI: "…`` layout. Pass ``address`` EIP-55
    checksummed, as ``Account.create().address`` is. ``extra`` lines are appended after
    ``Issued At`` (optional fields, or junk for negative tests)."""
    lines = [f"{domain} wants you to sign in with your Ethereum account:", address, ""]
    if statement is not None:
        lines.append(statement)
    lines += [
        "",
        f"URI: {uri}",
        "Version: 1",
        f"Chain ID: {chain_id}",
        f"Nonce: {nonce}",
        f"Issued At: {iso(issued_at or datetime.now(UTC))}",
        *extra,
    ]
    return "\n".join(lines)


def sign(acct: LocalAccount, message: str) -> str:
    """Hex personal_sign signature of ``message`` by ``acct``."""
    return "0x" + bytes(acct.sign_message(encode_defunct(text=message)).signature).hex()


async def new_nonce(client: AsyncClient) -> str:
    res = await client.post("/v1/auth/nonce")
    assert res.status_code == 200, res.text
    nonce: str = res.json()["nonce"]
    return nonce


async def verify(client: AsyncClient, acct: LocalAccount, message: str) -> Response:
    return await client.post(
        "/v1/auth/verify", json={"message": message, "signature": sign(acct, message)}
    )


async def sign_in(client: AsyncClient, acct: LocalAccount) -> Response:
    """Full nonce → sign → verify round trip from the default web origin; asserts success."""
    res = await verify(client, acct, siwe_message(acct.address, await new_nonce(client)))
    assert res.status_code == 200, res.text
    return res
