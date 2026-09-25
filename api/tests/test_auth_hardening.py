"""Auth hardening (JIT step 37, ADR-0009 amendment, threat model T15/T16).

Covers the strict EIP-4361 parser, the domain/URI binding to allowed origins, the validity
window, atomic single-use nonces, auth-table pruning and the per-instance auth rate limit.
The Postgres test at the end runs only when ``OPENAD_TEST_PG_URL`` is set (a disposable
database: it drops every table in it).
"""

from __future__ import annotations

import asyncio
import importlib
import os
import pkgutil
import re
import time
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from eth_account import Account
from fastapi import FastAPI
from fastapi.routing import APIRoute
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request

import openad.routers
from openad.config import Settings
from openad.db.base import Base
from openad.db.session import Database
from openad.errors import UnauthorizedError
from openad.main import create_app
from openad.models import AuthNonce, Session
from openad.ratelimit import DEFAULT_MAX_KEYS, TokenBucketLimiter, auth_rate_limit, client_key
from openad.services import auth as auth_service
from openad.siwe import (
    CLOCK_SKEW_SECONDS,
    MAX_MESSAGE_LENGTH,
    SiweMessage,
    check_time_window,
    is_bound_to_allowed_origin,
    parse_siwe,
)
from tests.siwe_helpers import (
    WEB_DOMAIN,
    WEB_ORIGIN,
    iso,
    new_nonce,
    sign,
    sign_in,
    siwe_message,
    verify,
)

PG_URL = os.environ.get("OPENAD_TEST_PG_URL")

ADDR = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed"  # an EIP-55 test vector
NONCE = "abcdef0123456789"
T0 = datetime(2026, 9, 25, 12, 0, 0, tzinfo=UTC)
DEFAULT_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]
MALFORMED = "malformed SIWE message"


def _message(**kw: Any) -> str:
    kw.setdefault("issued_at", T0)
    return siwe_message(ADDR, NONCE, **kw)


class FakeClock:
    def __init__(self, t: float = 1000.0) -> None:
        self.t = t

    def __call__(self) -> float:
        return self.t


async def _nonce_used(session: AsyncSession, nonce: str) -> bool | None:
    """The stored ``used`` flag, or None if the row is gone (a column query, never cached)."""
    res = await session.execute(select(AuthNonce.used).where(AuthNonce.nonce == nonce))
    return res.scalar_one_or_none()


@asynccontextmanager
async def _app(settings: Settings, db: Database, **overrides: Any) -> AsyncIterator[FastAPI]:
    app = create_app(settings=settings.model_copy(update=overrides), database=db)
    async with app.router.lifespan_context(app):
        yield app


@asynccontextmanager
async def _http(app: FastAPI, peer: str = "127.0.0.1") -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app, client=(peer, 50000))
    async with AsyncClient(transport=transport, base_url="http://api.test") as c:
        yield c


# ------------------------------------------------------------------------------------ parser


def test_parse_reads_every_field_from_its_own_line() -> None:
    msg = parse_siwe(_message())
    assert msg == SiweMessage(
        domain=WEB_DOMAIN,
        address=ADDR.lower(),
        statement=None,
        uri=WEB_ORIGIN,
        version="1",
        chain_id=31337,
        nonce=NONCE,
        issued_at=int(T0.timestamp()),
    )


# viem 2.x createSiweMessage output (what web/src/lib/permit.ts and sim/src/siwe.ts call) for
# these fields, byte for byte. web/src/lib/permit.test.ts asserts the web builds VIEM_MESSAGE.
VIEM_MESSAGE = (
    "localhost:5173 wants you to sign in with your Ethereum account:\n"
    "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed\n"
    "\n"
    "\n"
    "URI: http://localhost:5173\n"
    "Version: 1\n"
    "Chain ID: 31337\n"
    "Nonce: abcdef0123456789\n"
    "Issued At: 2026-09-25T12:00:00.000Z"
)
VIEM_MESSAGE_WITH_STATEMENT = (
    "localhost:5173 wants you to sign in with your Ethereum account:\n"
    "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed\n"
    "\n"
    "Sign in to OpenAd.\n"
    "\n"
    "URI: http://localhost:5173\n"
    "Version: 1\n"
    "Chain ID: 31337\n"
    "Nonce: abcdef0123456789\n"
    "Issued At: 2026-09-25T12:00:00.000Z"
)


@pytest.mark.parametrize(
    ("message", "statement"),
    [(VIEM_MESSAGE, None), (VIEM_MESSAGE_WITH_STATEMENT, "Sign in to OpenAd.")],
    ids=["without a statement", "with a statement"],
)
def test_parse_accepts_viem_messages(message: str, statement: str | None) -> None:
    assert _message(statement=statement) == message  # the test helper writes viem's text
    msg = parse_siwe(message)
    assert msg.statement == statement
    assert (msg.domain, msg.uri, msg.nonce) == (WEB_DOMAIN, WEB_ORIGIN, NONCE)
    assert (msg.address, msg.issued_at) == (ADDR.lower(), int(T0.timestamp()))


def test_parse_ignores_an_address_inside_the_statement() -> None:
    other = Account.create().address
    msg = parse_siwe(_message(statement=f"Acting for {other}"))
    assert msg.address == ADDR.lower()


def test_parse_requires_an_eip55_checksummed_address() -> None:
    assert parse_siwe(siwe_message(ADDR, NONCE)).address == ADDR.lower()  # stored lower-cased
    digits_only = "0x" + "12" * 20  # no letters: its own checksum
    assert parse_siwe(siwe_message(digits_only, NONCE)).address == digits_only
    for address in (ADDR.lower(), ADDR.upper().replace("0X", "0x"), "0x" + ADDR[2:].swapcase()):
        with pytest.raises(UnauthorizedError, match=MALFORMED):
            parse_siwe(siwe_message(address, NONCE))


@pytest.mark.parametrize(("nonce", "ok"), [("a" * 8, True), ("a" * 64, True), ("a" * 65, False)])
def test_parse_nonce_length_bounds(nonce: str, ok: bool) -> None:
    message = siwe_message(ADDR, nonce, issued_at=T0)
    if ok:
        assert parse_siwe(message).nonce == nonce
    else:
        with pytest.raises(UnauthorizedError, match=MALFORMED):
            parse_siwe(message)


def test_parse_optional_fields_and_resources() -> None:
    msg = parse_siwe(
        _message(
            extra=[
                f"Expiration Time: {iso(T0 + timedelta(minutes=5))}",
                "Not Before: 2026-09-25T13:59:00+02:00",
                "Request ID: req-1",
                "Resources:",
                "- ipfs://bafybeiemxf5abjwjbikoz4mc3a3dla6ual3jsgpdr4cjr3oz3evfyavhwq/",
                "- https://example.com/my-web2-claim.json",
            ]
        )
    )
    assert msg.expiration_time == int(T0.timestamp()) + 300
    assert msg.not_before == int(T0.timestamp()) - 60
    assert msg.request_id == "req-1"
    assert msg.resources == (
        "ipfs://bafybeiemxf5abjwjbikoz4mc3a3dla6ual3jsgpdr4cjr3oz3evfyavhwq/",
        "https://example.com/my-web2-claim.json",
    )


def _swap(lines: list[str], a: int, b: int) -> list[str]:
    out = list(lines)
    out[a], out[b] = out[b], out[a]
    return out


# 0 header, 1 address, 2 "", 3 "", 4 URI, 5 Version, 6 Chain ID, 7 Nonce, 8 Issued At
_BASE = _message().split("\n")

REJECTED: dict[str, str] = {
    "reordered fields": "\n".join(_swap(_BASE, 4, 5)),
    "duplicate nonce": _message(extra=[f"Nonce: {NONCE}"]),
    "unknown line at the end": _message(extra=["Foo: bar"]),
    "unknown line in the middle": "\n".join([*_BASE[:5], "Foo: bar", *_BASE[5:]]),
    "version 2": _message().replace("Version: 1", "Version: 2"),
    "CRLF line breaks": _message().replace("\n", "\r\n"),
    "trailing junk": _message(extra=["junk"]),
    "trailing newline": _message() + "\n",
    "scheme on the domain line": _message(domain=f"http://{WEB_DOMAIN}"),
    # Only `address LF LF [statement LF] LF` is EIP-4361.
    "one empty line after the address": "\n".join([*_BASE[:3], *_BASE[4:]]),
    "no empty line after the address": "\n".join([*_BASE[:2], *_BASE[4:]]),
    "three empty lines (an empty statement)": "\n".join([*_BASE[:3], "", *_BASE[3:]]),
    "statement without the empty line after it": "\n".join([*_BASE[:3], "Hello", *_BASE[4:]]),
    "statement without the empty line before it": "\n".join([*_BASE[:2], "Hello", *_BASE[3:]]),
    "statement followed by two empty lines": "\n".join([*_BASE[:3], "Hello", "", *_BASE[3:]]),
    "statement outside EIP-4361's characters": _message(statement='Say "hi"'),
    "lowercase address": siwe_message(ADDR.lower(), NONCE, issued_at=T0),
    "address with a wrong checksum": siwe_message("0x" + ADDR[2:].swapcase(), NONCE, issued_at=T0),
    "URI outside RFC 3986's characters": _message(uri="http://localhost:5173/<x>"),
    "URI with a broken percent-escape": _message(uri="http://localhost:5173/%zz"),
    "Request ID outside RFC 3986's pchar": _message(extra=['Request ID: a"b']),
    "optional fields out of order": _message(
        extra=[f"Not Before: {iso(T0)}", f"Expiration Time: {iso(T0)}"]
    ),
    "unknown line after resources": _message(
        extra=["Resources:", "- https://a.example/", "+ https://b.example/"]
    ),
    "short nonce": siwe_message(ADDR, "abc123", issued_at=T0),
    "nonce over 64 characters": siwe_message(ADDR, "a" * 65, issued_at=T0),
    "nonce with a hyphen": siwe_message(ADDR, "not-issued", issued_at=T0),
    "non-ASCII chain id": _message().replace("Chain ID: 31337", "Chain ID: ٣١٣٣٧"),
    "Issued At with a space": _message().replace(iso(T0), "2026-09-25 12:00:00Z"),
    "Issued At on February 30": _message().replace(iso(T0), "2026-02-30T12:00:00Z"),
    "Issued At without a zone": _message().replace(iso(T0), "2026-09-25T12:00:00"),
    "missing Issued At": "\n".join(_BASE[:-1]),
    "empty message": "",
}


@pytest.mark.parametrize("message", list(REJECTED.values()), ids=list(REJECTED))
def test_parse_rejects(message: str) -> None:
    with pytest.raises(UnauthorizedError) as info:
        parse_siwe(message)
    assert info.value.message == MALFORMED


# ----------------------------------------------------------------------------------- binding


@pytest.mark.parametrize(
    ("domain", "uri", "bound"),
    [
        ("localhost:5173", "http://localhost:5173", True),
        ("localhost:5173", "http://localhost:5173/supply?tab=1", True),
        ("127.0.0.1:5173", "http://127.0.0.1:5173", True),
        ("evil.example", "https://evil.example", False),  # relayed from another site
        ("evil.example", "http://localhost:5173", False),  # URI allowed, domain not
        ("localhost:5173", "https://evil.example", False),  # domain allowed, URI not
        ("localhost:5173", "https://localhost:5173", False),  # scheme mismatch
        ("localhost", "http://localhost:5173", False),  # host without the port
        ("localhost", "http://localhost", False),
        ("127.0.0.1:5173", "http://localhost:5173", False),  # two allowed origins, crossed
        ("localhost:5173", "http://user@localhost:5173", False),
        ("LOCALHOST:5173", "http://LOCALHOST:5173", False),  # browsers send lower case
    ],
)
def test_binding_rule(domain: str, uri: str, bound: bool) -> None:
    msg = parse_siwe(_message(domain=domain, uri=uri))
    assert is_bound_to_allowed_origin(msg, DEFAULT_ORIGINS) is bound


def test_binding_normalizes_configured_origins_and_ignores_wildcards() -> None:
    msg = parse_siwe(_message())
    assert is_bound_to_allowed_origin(msg, [" HTTP://LocalHost:5173/ "])
    assert not is_bound_to_allowed_origin(msg, ["*"])
    assert not is_bound_to_allowed_origin(msg, [])


def test_siwe_origin_list_falls_back_to_cors_origins() -> None:
    def make(**kw: Any) -> Settings:
        kw.setdefault("cors_origins", "http://a.example,http://b.example")
        return Settings(_env_file=None, **kw)  # pydantic-settings init-only kwarg

    cors = ["http://a.example", "http://b.example"]
    assert make().siwe_origin_list == cors
    assert make(siwe_allowed_origins="").siwe_origin_list == cors
    assert make(siwe_allowed_origins=" , ").siwe_origin_list == cors
    assert make(siwe_allowed_origins="https://app.example, https://x.example").siwe_origin_list == [
        "https://app.example",
        "https://x.example",
    ]


async def test_relayed_message_is_rejected_and_the_nonce_stays_unused(
    client: AsyncClient, session: AsyncSession
) -> None:
    acct = Account.create()
    nonce = await new_nonce(client)
    relayed = siwe_message(acct.address, nonce, domain="evil.example", uri="https://evil.example")
    res = await verify(client, acct, relayed)
    assert res.status_code == 401
    assert res.json() == {"error": "unauthorized", "message": "domain not allowed"}
    assert "set-cookie" not in res.headers
    assert await _nonce_used(session, nonce) is False
    # Not burned: the same nonce still signs in from the real web origin.
    ok = await verify(client, acct, siwe_message(acct.address, nonce))
    assert ok.status_code == 200


@pytest.mark.parametrize(
    ("domain", "uri"),
    [
        ("evil.example", "http://localhost:5173"),
        ("localhost:5173", "https://evil.example"),
        ("localhost:5173", "https://localhost:5173"),
        ("localhost", "http://localhost:5173"),
        ("127.0.0.1:5173", "http://localhost:5173"),
    ],
)
async def test_unbound_messages_get_401_over_http(
    client: AsyncClient, session: AsyncSession, domain: str, uri: str
) -> None:
    acct = Account.create()
    nonce = await new_nonce(client)
    res = await verify(client, acct, siwe_message(acct.address, nonce, domain=domain, uri=uri))
    assert res.status_code == 401
    assert res.json()["message"] == "domain not allowed"
    assert await _nonce_used(session, nonce) is False


@pytest.mark.parametrize("origin", DEFAULT_ORIGINS)
async def test_allowed_origin_signs_in_with_the_same_cookie(
    client: AsyncClient, origin: str
) -> None:
    acct = Account.create()
    nonce = await new_nonce(client)
    domain = origin.removeprefix("http://")
    res = await verify(client, acct, siwe_message(acct.address, nonce, domain=domain, uri=origin))
    assert res.status_code == 200
    assert res.json() == {"address": acct.address.lower()}
    cookie = res.headers["set-cookie"]
    assert cookie.startswith(f"{auth_service.COOKIE_NAME}=")
    assert "HttpOnly" in cookie
    assert "SameSite=lax" in cookie
    assert "Path=/" in cookie
    assert "Secure" not in cookie  # env=test is dev-like; staging/prod keep Secure


async def test_siwe_allowed_origins_overrides_cors_origins(
    settings: Settings, db: Database
) -> None:
    acct = Account.create()
    async with (
        _app(settings, db, siwe_allowed_origins="https://app.example") as app,
        _http(app) as c,
    ):
        local = await verify(c, acct, siwe_message(acct.address, await new_nonce(c)))
        assert local.status_code == 401
        assert local.json()["message"] == "domain not allowed"
        message = siwe_message(
            acct.address, await new_nonce(c), domain="app.example", uri="https://app.example"
        )
        assert (await verify(c, acct, message)).status_code == 200


async def test_wrong_chain_is_rejected(client: AsyncClient) -> None:
    acct = Account.create()
    res = await verify(
        client, acct, siwe_message(acct.address, await new_nonce(client), chain_id=1)
    )
    assert res.status_code == 401
    assert res.json()["message"] == "chain id mismatch"


# ------------------------------------------------------------------------------------- time

NOW = 1_800_000_000
MAX_AGE = auth_service.NONCE_TTL


def _at(issued_at: int, **kw: Any) -> SiweMessage:
    return SiweMessage(
        domain=WEB_DOMAIN,
        address=ADDR.lower(),
        statement=None,
        uri=WEB_ORIGIN,
        version="1",
        chain_id=31337,
        nonce=NONCE,
        issued_at=issued_at,
        **kw,
    )


def test_time_window_bounds() -> None:
    assert CLOCK_SKEW_SECONDS == 300  # 5 minutes, as ADR-0009 and ARCHITECTURE.md say
    oldest = NOW - MAX_AGE - CLOCK_SKEW_SECONDS
    check_time_window(_at(oldest), now=NOW, max_age=MAX_AGE)
    check_time_window(_at(NOW + CLOCK_SKEW_SECONDS), now=NOW, max_age=MAX_AGE)
    check_time_window(_at(NOW, expiration_time=NOW + 1), now=NOW, max_age=MAX_AGE)
    check_time_window(_at(NOW, not_before=NOW + CLOCK_SKEW_SECONDS), now=NOW, max_age=MAX_AGE)

    cases: list[tuple[SiweMessage, str]] = [
        (_at(oldest - 1), "SIWE message expired"),
        (_at(NOW + CLOCK_SKEW_SECONDS + 1), "SIWE message not yet valid"),
        (_at(NOW, expiration_time=NOW), "SIWE message expired"),
        (_at(NOW, not_before=NOW + CLOCK_SKEW_SECONDS + 1), "SIWE message not yet valid"),
    ]
    for msg, error in cases:
        with pytest.raises(UnauthorizedError) as info:
            check_time_window(msg, now=NOW, max_age=MAX_AGE)
        assert info.value.message == error


@pytest.mark.parametrize(
    ("issued_delta", "extra", "error"),
    [
        (-(MAX_AGE + CLOCK_SKEW_SECONDS + 30), (), "SIWE message expired"),
        (CLOCK_SKEW_SECONDS + 60, (), "SIWE message not yet valid"),
        (0, ("Expiration Time: {past}",), "SIWE message expired"),
        (0, ("Not Before: {future}",), "SIWE message not yet valid"),
    ],
)
async def test_messages_outside_the_window_get_401_and_keep_the_nonce(
    client: AsyncClient,
    session: AsyncSession,
    issued_delta: int,
    extra: tuple[str, ...],
    error: str,
) -> None:
    acct = Account.create()
    nonce = await new_nonce(client)
    now = datetime.now(UTC)
    lines = [
        line.format(past=iso(now - timedelta(seconds=5)), future=iso(now + timedelta(hours=1)))
        for line in extra
    ]
    message = siwe_message(
        acct.address, nonce, issued_at=now + timedelta(seconds=issued_delta), extra=lines
    )
    res = await verify(client, acct, message)
    assert res.status_code == 401
    assert res.json()["message"] == error
    assert await _nonce_used(session, nonce) is False


# -------------------------------------------------------------------------------- signature


async def test_signature_by_another_wallet_is_rejected_and_keeps_the_nonce(
    client: AsyncClient, session: AsyncSession
) -> None:
    claimed, signer = Account.create(), Account.create()
    nonce = await new_nonce(client)
    message = siwe_message(claimed.address, nonce)
    res = await verify(client, signer, message)
    assert res.status_code == 401
    assert res.json()["message"] == "address mismatch"
    garbage = await client.post("/v1/auth/verify", json={"message": message, "signature": "0x00"})
    assert garbage.status_code == 401
    assert garbage.json()["message"] == "bad signature"
    assert await _nonce_used(session, nonce) is False


# ------------------------------------------------------------------------------------ nonce


async def test_a_nonce_signs_in_once(client: AsyncClient, session: AsyncSession) -> None:
    acct = Account.create()
    nonce = await new_nonce(client)
    message = siwe_message(acct.address, nonce)
    body = {"message": message, "signature": sign(acct, message)}
    assert (await client.post("/v1/auth/verify", json=body)).status_code == 200
    again = await client.post("/v1/auth/verify", json=body)
    assert again.status_code == 401
    assert again.json()["message"] == "invalid nonce"
    assert await _nonce_used(session, nonce) is True


async def test_an_expired_nonce_is_refused(client: AsyncClient, session: AsyncSession) -> None:
    stale = "stalenonce000001"
    created = int(time.time()) - auth_service.NONCE_TTL - 5
    session.add(AuthNonce(nonce=stale, created_at=created, used=False))
    await session.commit()
    acct = Account.create()
    res = await verify(client, acct, siwe_message(acct.address, stale))
    assert res.status_code == 401
    assert res.json()["message"] == "invalid nonce"


async def test_consume_nonce_row_count(session: AsyncSession) -> None:
    now = int(time.time())
    session.add_all(
        [
            AuthNonce(nonce="freshnonce000001", created_at=now, used=False),
            AuthNonce(nonce="oldnonce00000001", created_at=now - 601, used=False),
        ]
    )
    await session.commit()
    assert await auth_service.consume_nonce(session, "freshnonce000001", now=now) == 1
    assert await auth_service.consume_nonce(session, "freshnonce000001", now=now) == 0  # reuse
    assert await auth_service.consume_nonce(session, "oldnonce00000001", now=now) == 0
    assert await auth_service.consume_nonce(session, "neverissued00001", now=now) == 0
    await session.commit()
    assert await _nonce_used(session, "freshnonce000001") is True
    assert await _nonce_used(session, "oldnonce00000001") is False


# SQLite renders `used IS false` as `used IS 0`.
_CONSUME_SQL = re.compile(
    r"UPDATE auth_nonces SET used=\? WHERE auth_nonces\.nonce = \? "
    r"AND auth_nonces\.used IS 0 AND auth_nonces\.created_at >= \?"
)


async def test_consume_nonce_is_one_conditional_update_and_no_read(
    db: Database, session: AsyncSession
) -> None:
    now = int(time.time())
    session.add(AuthNonce(nonce="sqlnonce00000001", created_at=now, used=False))
    await session.commit()
    session.expunge_all()  # nothing cached: a read-then-write would have to SELECT
    executed: list[tuple[str, Any]] = []

    def record(_conn: Any, _cursor: Any, statement: str, parameters: Any, *_: Any) -> None:
        executed.append((" ".join(statement.split()), parameters))

    engine = db.engine.sync_engine
    event.listen(engine, "before_cursor_execute", record)
    try:
        assert await auth_service.consume_nonce(session, "sqlnonce00000001", now=now) == 1
    finally:
        event.remove(engine, "before_cursor_execute", record)
    await session.commit()

    # The check and the write are one statement, so two verifies can't both read
    # `used = false` and then both mark it: no SELECT of the nonce, one conditional UPDATE.
    assert [sql for sql, _ in executed if sql.upper().startswith("SELECT")] == []
    assert len(executed) == 1, executed
    sql, params = executed[0]
    assert _CONSUME_SQL.fullmatch(sql), sql
    assert tuple(params) == (1, "sqlnonce00000001", now - auth_service.NONCE_TTL)
    assert await _nonce_used(session, "sqlnonce00000001") is True


# ----------------------------------------------------------------------------- request body

INVALID_BODY = {"error": "invalid_request", "message": "invalid request body"}


async def test_an_overlong_message_gets_a_house_style_422_and_keeps_the_nonce(
    client: AsyncClient, session: AsyncSession
) -> None:
    assert MAX_MESSAGE_LENGTH == 4096
    acct = Account.create()
    nonce = await new_nonce(client)
    issued = datetime.now(UTC)

    def padded(length: int) -> str:
        """A valid message, its statement padded to make it exactly ``length`` long."""
        short = siwe_message(acct.address, nonce, issued_at=issued, statement="x")
        pad = "x" * (length - len(short) + 1)
        return siwe_message(acct.address, nonce, issued_at=issued, statement=pad)

    too_long = padded(MAX_MESSAGE_LENGTH + 1)
    res = await verify(client, acct, too_long)
    assert res.status_code == 422
    assert res.json() == INVALID_BODY
    assert "set-cookie" not in res.headers
    assert await _nonce_used(session, nonce) is False  # rejected before any check ran

    at_cap = padded(MAX_MESSAGE_LENGTH)
    assert len(at_cap) == MAX_MESSAGE_LENGTH
    assert (await verify(client, acct, at_cap)).status_code == 200


@pytest.mark.parametrize(
    "request_kwargs",
    [
        {"json": {"message": "x" * (MAX_MESSAGE_LENGTH + 1), "signature": "0x00"}},
        {"json": {"message": "x"}},  # no signature
        {"content": b"{not json", "headers": {"content-type": "application/json"}},
    ],
    ids=["overlong message", "missing field", "broken JSON"],
)
async def test_invalid_auth_bodies_get_the_same_house_style_422(
    client: AsyncClient, request_kwargs: dict[str, Any]
) -> None:
    res = await client.post("/v1/auth/verify", **request_kwargs)
    assert res.status_code == 422
    assert res.json() == INVALID_BODY


async def test_other_routes_keep_fastapis_validation_body(client: AsyncClient) -> None:
    res = await client.get("/v1/slots", params={"limit": 0})
    assert res.status_code == 422
    assert list(res.json()) == ["detail"]


# ---------------------------------------------------------------------------------- pruning


async def _seed_auth_rows(session: AsyncSession, now: int) -> None:
    ttl = auth_service.NONCE_TTL
    session.add_all(
        [
            AuthNonce(nonce="usednonce0000001", created_at=now, used=True),
            AuthNonce(nonce="expirednonce0001", created_at=now - ttl - 1, used=False),
            AuthNonce(nonce="edgenonce0000001", created_at=now - ttl, used=False),
            AuthNonce(nonce="livenonce0000001", created_at=now - 10, used=False),
            Session(id="expired-session", address="0x" + "aa" * 20, expires_at=now - 1),
            Session(id="edge-session", address="0x" + "aa" * 20, expires_at=now),
            Session(id="live-session", address="0x" + "aa" * 20, expires_at=now + 3600),
        ]
    )
    await session.commit()


async def _remaining(session: AsyncSession) -> tuple[set[str], set[str]]:
    nonces = set((await session.execute(select(AuthNonce.nonce))).scalars())
    sessions = set((await session.execute(select(Session.id))).scalars())
    return nonces, sessions


async def test_prune_removes_used_and_expired_rows_only(session: AsyncSession) -> None:
    await _seed_auth_rows(session, NOW)
    assert await auth_service.prune_auth(session, NOW) == (2, 1)
    await session.commit()
    assert await _remaining(session) == (
        {"edgenonce0000001", "livenonce0000001"},
        {"edge-session", "live-session"},
    )


async def test_issue_nonce_prunes_at_most_once_per_interval(
    session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    clock = FakeClock()
    monkeypatch.setattr(auth_service, "prune_throttle", auth_service.PruneThrottle(clock=clock))
    await _seed_auth_rows(session, NOW)

    first = await auth_service.issue_nonce(session, now=NOW)
    nonces, sessions = await _remaining(session)
    assert nonces == {"edgenonce0000001", "livenonce0000001", first}
    assert sessions == {"edge-session", "live-session"}

    session.add(AuthNonce(nonce="usedlater0000001", created_at=NOW, used=True))
    await session.commit()
    clock.t += auth_service.PRUNE_INTERVAL_SECONDS - 1
    second = await auth_service.issue_nonce(session, now=NOW)
    assert "usedlater0000001" in (await _remaining(session))[0]  # throttled: no prune

    clock.t += 1
    third = await auth_service.issue_nonce(session, now=NOW)
    nonces, _ = await _remaining(session)
    assert "usedlater0000001" not in nonces
    assert {first, second, third} <= nonces
    for nonce in (first, second, third):
        assert await _nonce_used(session, nonce) is False


async def test_nonce_route_prunes_and_the_new_nonce_still_signs_in(
    client: AsyncClient, session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(auth_service, "prune_throttle", auth_service.PruneThrottle())
    now = int(time.time())
    await _seed_auth_rows(session, now)
    nonce = await new_nonce(client)
    nonces, sessions = await _remaining(session)
    assert "usednonce0000001" not in nonces
    assert "expirednonce0001" not in nonces
    assert "expired-session" not in sessions
    assert await _nonce_used(session, nonce) is False
    acct = Account.create()
    assert (await verify(client, acct, siwe_message(acct.address, nonce))).status_code == 200


async def test_a_failed_prune_never_blocks_nonce_issuance(
    session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def broken_prune(_session: AsyncSession, _now: int) -> tuple[int, int]:
        raise SQLAlchemyError("lock timeout")

    monkeypatch.setattr(auth_service, "prune_throttle", auth_service.PruneThrottle())
    monkeypatch.setattr(auth_service, "prune_auth", broken_prune)
    nonce = await auth_service.issue_nonce(session)
    assert await _nonce_used(session, nonce) is False


# ------------------------------------------------------------------------------- rate limit


def test_limiter_refuses_after_capacity_and_refills() -> None:
    clock = FakeClock()
    limiter = TokenBucketLimiter(3, clock=clock)
    assert [limiter.hit("a") for _ in range(3)] == [None, None, None]
    assert limiter.hit("a") == 20  # one token every 60 / 3 seconds
    clock.t += 20
    assert limiter.hit("a") is None
    assert limiter.hit("a") == 20
    clock.t += 5
    assert limiter.hit("a") == 15


def test_limiter_keys_are_independent() -> None:
    limiter = TokenBucketLimiter(1, clock=FakeClock())
    assert limiter.hit("a") is None
    assert limiter.hit("a") == 60
    assert limiter.hit("b") is None


def test_limiter_lru_cap_holds() -> None:
    limiter = TokenBucketLimiter(1, max_keys=3, clock=FakeClock())
    for key in ("a", "b", "c"):
        assert limiter.hit(key) is None
    assert limiter.hit("a") == 60  # refused, and now the most recently used key
    assert limiter.hit("d") is None  # evicts "b", the least recently used
    assert len(limiter) == 3
    assert limiter.hit("b") is None  # a fresh bucket after eviction; "c" goes
    assert limiter.hit("a") == 60  # "a" survived both evictions

    assert DEFAULT_MAX_KEYS == 10_000
    big = TokenBucketLimiter(1, clock=FakeClock())
    for i in range(DEFAULT_MAX_KEYS + 50):
        big.hit(f"10.0.{i // 256}.{i % 256}")
    assert len(big) == DEFAULT_MAX_KEYS


def test_limiter_rejects_a_zero_rate() -> None:
    with pytest.raises(ValueError):
        TokenBucketLimiter(0)


def _request(headers: list[tuple[bytes, bytes]], peer: str = "10.0.0.1") -> Request:
    return Request({"type": "http", "method": "POST", "headers": headers, "client": (peer, 1)})


def test_client_key_uses_the_peer_or_the_nth_xff_entry_from_the_right() -> None:
    xff = [(b"x-forwarded-for", b"6.6.6.6, 7.7.7.7"), (b"x-forwarded-for", b"9.9.9.9")]
    assert client_key(_request(xff), 0) == "10.0.0.1"  # hops=0 ignores the header
    assert client_key(_request(xff), 1) == "9.9.9.9"  # repeated header lines are joined
    assert client_key(_request(xff), 2) == "7.7.7.7"
    assert client_key(_request(xff), 4) == "10.0.0.1"  # shorter than hops: the peer
    assert client_key(_request([]), 1) == "10.0.0.1"
    assert client_key(_request([(b"x-forwarded-for", b"")]), 1) == "10.0.0.1"
    long_entry = [(b"x-forwarded-for", b"x" * 500)]
    assert len(client_key(_request(long_entry), 1)) == 64


def test_rate_limit_settings_default_to_off() -> None:
    fields = Settings.model_fields
    assert fields["auth_rate_limit_per_minute"].default == 0
    assert fields["trusted_proxy_hops"].default == 0
    assert fields["siwe_allowed_origins"].default is None


async def test_rate_limit_is_disabled_by_default(client: AsyncClient) -> None:
    for _ in range(40):
        assert (await client.post("/v1/auth/nonce")).status_code == 200


async def test_fourth_request_at_three_per_minute_gets_429(
    settings: Settings, db: Database
) -> None:
    async with _app(settings, db, auth_rate_limit_per_minute=3) as app, _http(app) as c:
        for _ in range(3):
            assert (await c.post("/v1/auth/nonce")).status_code == 200
        res = await c.post("/v1/auth/nonce")
        assert res.status_code == 429
        assert res.headers["retry-after"] == "20"
        assert res.json() == {
            "error": "rate_limited",
            "message": "too many sign-in requests; try again later",
        }
        verify_res = await c.post("/v1/auth/verify", json={"message": "x", "signature": "0x"})
        assert verify_res.status_code == 429  # one bucket per client covers both routes


async def test_rate_limit_keys_by_peer_when_hops_is_zero(settings: Settings, db: Database) -> None:
    async with _app(settings, db, auth_rate_limit_per_minute=3) as app:
        async with _http(app, peer="10.0.0.1") as a, _http(app, peer="10.0.0.2") as b:
            for spoof in ("1.1.1.1", "2.2.2.2", "3.3.3.3"):
                res = await a.post("/v1/auth/nonce", headers={"X-Forwarded-For": spoof})
                assert res.status_code == 200
            blocked = await a.post("/v1/auth/nonce", headers={"X-Forwarded-For": "4.4.4.4"})
            assert blocked.status_code == 429  # XFF is ignored: still the same peer
            assert (await b.post("/v1/auth/nonce")).status_code == 200  # another peer


async def test_rate_limit_uses_the_rightmost_xff_entry_with_one_hop(
    settings: Settings, db: Database
) -> None:
    async with (
        _app(settings, db, auth_rate_limit_per_minute=3, trusted_proxy_hops=1) as app,
        _http(app) as c,
    ):
        for spoof in ("6.6.6.6", "7.7.7.7, 8.8.8.8", "evil"):
            res = await c.post("/v1/auth/nonce", headers={"X-Forwarded-For": f"{spoof}, 9.9.9.9"})
            assert res.status_code == 200
        blocked = await c.post("/v1/auth/nonce", headers={"X-Forwarded-For": "5.5.5.5, 9.9.9.9"})
        assert blocked.status_code == 429  # spoofed left entries don't give a new bucket
        other = await c.post("/v1/auth/nonce", headers={"X-Forwarded-For": "9.9.9.9, 8.8.4.4"})
        assert other.status_code == 200  # a different real client


def _api_routes() -> list[APIRoute]:
    """Every route of every router module under ``openad.routers`` (each is mounted at /v1)."""
    routes: list[APIRoute] = []
    for info in pkgutil.iter_modules(openad.routers.__path__):
        router = getattr(importlib.import_module(f"openad.routers.{info.name}"), "router", None)
        routes += [r for r in getattr(router, "routes", []) if isinstance(r, APIRoute)]
    return routes


def _paths_with(dependency: Callable[..., Any]) -> set[str]:
    return {
        route.path
        for route in _api_routes()
        if any(d.call is dependency for d in route.dependant.dependencies)
    }


async def test_rate_limit_applies_only_to_nonce_and_verify(
    settings: Settings, db: Database
) -> None:
    async with _app(settings, db, auth_rate_limit_per_minute=1) as app, _http(app) as c:
        assert len(_api_routes()) > 20  # the walk really sees the whole API
        assert _paths_with(auth_rate_limit) == {"/auth/nonce", "/auth/verify"}
        assert (await c.post("/v1/auth/nonce")).status_code == 200
        assert (await c.post("/v1/auth/nonce")).status_code == 429
        for _ in range(3):
            assert (await c.post("/v1/auth/logout")).status_code == 200
            assert (await c.get("/v1/slots")).status_code == 200


async def test_signing_in_still_works_under_the_limit(settings: Settings, db: Database) -> None:
    async with _app(settings, db, auth_rate_limit_per_minute=30) as app, _http(app) as c:
        await sign_in(c, Account.create())


# --------------------------------------------------------------------- Postgres (optional)


@pytest.mark.skipif(not PG_URL, reason="OPENAD_TEST_PG_URL not set; Postgres test skipped")
async def test_concurrent_consumes_use_a_nonce_once_on_postgres() -> None:
    assert PG_URL is not None
    db = Database(PG_URL)
    try:
        async with db.engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
            await conn.exec_driver_sql("DROP TABLE IF EXISTS alembic_version")
            await conn.run_sync(Base.metadata.create_all)
        now = int(time.time())
        async with db.sessions() as s:
            s.add(AuthNonce(nonce="concurrent000001", created_at=now, used=False))
            await s.commit()

        async def attempt() -> int:
            async with db.sessions() as s:
                count = await auth_service.consume_nonce(s, "concurrent000001", now=now)
                await asyncio.sleep(0.05)  # hold the row lock so the attempts overlap
                await s.commit()
                return count

        assert sorted(await asyncio.gather(*(attempt() for _ in range(5)))) == [0, 0, 0, 0, 1]
    finally:
        async with db.engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
        await db.dispose()
