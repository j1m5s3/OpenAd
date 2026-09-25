"""Domain verification's on-demand network check (ROADMAP 6.9 step 39; docs/threat-model.md
T18): the atomic per-slot cooldown, the DB connection being released before the network call,
the token guard on the write-back, and `_check_meta`'s bounded fetch (hop/host checks reused
from `services.media`, identity-only body, incremental body cap).

The Postgres concurrency test at the end runs only when ``OPENAD_TEST_PG_URL`` is set (a
disposable database: it drops every table in it), mirroring ``test_auth_hardening``'s.
"""

from __future__ import annotations

import asyncio
import gzip
import os
import re
import time
from collections.abc import AsyncIterator, Callable
from datetime import UTC, datetime
from typing import Any

import httpx
import pytest
from eth_account import Account
from httpx import AsyncClient
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession

from openad.config import Settings
from openad.db.base import Base
from openad.db.session import Database
from openad.models import DomainVerification
from openad.services import offchain as offchain_service
from tests.conftest import make_slot
from tests.siwe_helpers import sign_in

PG_URL = os.environ.get("OPENAD_TEST_PG_URL")


def _mock_client(handler: Callable[[httpx.Request], httpx.Response]) -> type[httpx.AsyncClient]:
    """An `httpx.AsyncClient` subclass wired to a `MockTransport`, for monkeypatching
    `offchain.httpx.AsyncClient` — `_check_meta` builds its own client internally, so tests
    inject the transport this way rather than passing one in (mirrors `tests.test_media`)."""
    transport = httpx.MockTransport(handler)

    class _Client(httpx.AsyncClient):
        def __init__(self, *args: object, **kwargs: object) -> None:
            kwargs["transport"] = transport
            super().__init__(*args, **kwargs)

    return _Client


class _BytesStream(httpx.AsyncByteStream):
    """Wraps fixed bytes as a genuine, not-yet-consumed stream — see `tests.test_media`'s
    identical helper for why `httpx.Response(200, content=...)` doesn't work once the code
    under test reads with `aiter_raw()` (fix round 1)."""

    def __init__(self, data: bytes) -> None:
        self._data = data

    async def __aiter__(self) -> AsyncIterator[bytes]:
        yield self._data


def _content_response(
    status_code: int, content: bytes, *, headers: dict[str, str] | None = None
) -> httpx.Response:
    return httpx.Response(status_code, headers=headers, stream=_BytesStream(content))


async def _seed_and_start(
    session: AsyncSession, *, owner: str, domain: str = "pub.example"
) -> None:
    session.add(make_slot(slot_id=1, owner=owner, domain=domain))
    await session.commit()
    await offchain_service.start_domain_verification(session, 1, method="meta_tag")


# --------------------------------------------------------------------------- cooldown (429)


async def test_check_cooldown_returns_429_with_retry_after(
    client: AsyncClient, session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    owner = Account.create()
    await _seed_and_start(session, owner=owner.address.lower())
    await sign_in(client, owner)

    async def fake_check_meta(domain: str, token: str, *, is_dev: bool) -> bool:
        return True

    monkeypatch.setattr(offchain_service, "_check_meta", fake_check_meta)

    first = await client.post("/v1/slots/1/domain-verification", params={"check": "true"})
    assert first.status_code == 200
    assert first.json()["verified"] is True

    second = await client.post("/v1/slots/1/domain-verification", params={"check": "true"})
    assert second.status_code == 429
    assert second.json()["error"] == "rate_limited"
    assert int(second.headers["retry-after"]) > 0


async def test_check_forbidden_for_non_owner_even_during_an_active_cooldown(
    client: AsyncClient, session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Ownership is checked before the cooldown claim: a non-owner gets 403, never a 429 — even
    while the cooldown the owner's own check just claimed is still active, so this can't pass
    merely because no cooldown happened to be in effect yet."""
    owner = Account.create()
    other = Account.create()
    await _seed_and_start(session, owner=owner.address.lower())

    async def fake_check_meta(domain: str, token: str, *, is_dev: bool) -> bool:
        return True

    monkeypatch.setattr(offchain_service, "_check_meta", fake_check_meta)

    await sign_in(client, owner)
    owner_check = await client.post("/v1/slots/1/domain-verification", params={"check": "true"})
    assert owner_check.status_code == 200  # claims the cooldown window

    await client.post("/v1/auth/logout")
    await sign_in(client, other)
    res = await client.post("/v1/slots/1/domain-verification", params={"check": "true"})
    assert res.status_code == 403


# --------------------------------------------------------------- no pooled connection held


async def test_check_releases_connection_before_network_call(
    session: AsyncSession, settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The domain check must not hold a DB transaction (and so a pooled connection) while the
    network call is in flight — minting a slot is permissionless, so a slow verification host
    could otherwise let one wallet pin the api's whole connection pool (ROADMAP 6.9 step 39)."""
    owner = "0x" + "aa" * 20
    await _seed_and_start(session, owner=owner)
    assert session.in_transaction() is False  # commits inside start_domain_verification

    async def fake_check_meta(domain: str, token: str, *, is_dev: bool) -> bool:
        assert session.in_transaction() is False
        return True

    monkeypatch.setattr(offchain_service, "_check_meta", fake_check_meta)
    row = await offchain_service.check_domain_verification(session, 1, settings)
    assert row.verified_at is not None


async def test_stale_check_does_not_verify_a_reissued_token(
    session: AsyncSession, settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    """If `start_domain_verification` re-issues a new token while a check for the OLD token is
    still in flight, that (now stale) check's result must not mark the slot verified under the
    new token (fix round 1): the write-back is guarded by `WHERE token = <the token read before
    the fetch>`, so it simply can't match the row once the token has moved on."""
    owner = "0x" + "aa" * 20
    await _seed_and_start(session, owner=owner)

    async def fake_check_meta_reissues_then_succeeds(
        domain: str, token: str, *, is_dev: bool
    ) -> bool:
        # Simulate the owner clicking "restart verification" while this check (for the token
        # captured above, before this call) is still running.
        await offchain_service.start_domain_verification(session, 1, method="meta_tag")
        return True

    monkeypatch.setattr(offchain_service, "_check_meta", fake_check_meta_reissues_then_succeeds)
    row = await offchain_service.check_domain_verification(session, 1, settings)
    assert row.verified_at is None


# ------------------------------------------------------------------------- atomic claim (L2)


# Captured empirically against SQLite (see `test_claim_...`): `Uint256` columns render as a
# zero-padded 78-digit string, so `slot_id` is bound as one even though it's declared `int`.
_CLAIM_SQL = re.compile(
    r"UPDATE domain_verifications SET last_checked_at=\? "
    r"WHERE domain_verifications\.slot_id = \? "
    r"AND \(domain_verifications\.last_checked_at IS NULL "
    r"OR domain_verifications\.last_checked_at <= \?\)"
)


async def test_claim_check_window_is_one_conditional_update_and_no_read(
    db: Database, session: AsyncSession
) -> None:
    """A read-then-write cooldown let 8 concurrent `check=true` calls on Postgres get 2x200
    instead of 1 (fix round 1, L2): the claim must be one conditional UPDATE, with no preceding
    SELECT of the row, so the database — not this process — decides who wins."""
    session.add(make_slot(slot_id=1))
    session.add(DomainVerification(slot_id=1, method="meta_tag", token="tok"))
    await session.commit()
    session.expunge_all()  # nothing cached: a read-then-write would have to SELECT
    executed: list[tuple[str, Any]] = []

    def record(_conn: Any, _cursor: Any, statement: str, parameters: Any, *_: Any) -> None:
        executed.append((" ".join(statement.split()), parameters))

    engine = db.engine.sync_engine
    event.listen(engine, "before_cursor_execute", record)
    now = datetime.now(UTC)
    try:
        claimed = await offchain_service._claim_check_window(session, 1, now=now)
    finally:
        event.remove(engine, "before_cursor_execute", record)
    await session.commit()

    assert claimed == 1
    assert [sql for sql, _ in executed if sql.upper().startswith("SELECT")] == []
    assert len(executed) == 1, executed
    sql, _params = executed[0]
    assert _CLAIM_SQL.fullmatch(sql), sql


async def test_claim_check_window_rejects_within_cooldown(session: AsyncSession) -> None:
    session.add(make_slot(slot_id=1))
    session.add(DomainVerification(slot_id=1, method="meta_tag", token="tok"))
    await session.commit()

    now = datetime.now(UTC)
    assert await offchain_service._claim_check_window(session, 1, now=now) == 1
    await session.commit()
    assert await offchain_service._claim_check_window(session, 1, now=now) == 0
    await session.commit()


@pytest.mark.skipif(not PG_URL, reason="OPENAD_TEST_PG_URL not set; Postgres test skipped")
async def test_concurrent_domain_checks_claim_the_window_once_on_postgres() -> None:
    assert PG_URL is not None
    db = Database(PG_URL)
    try:
        async with db.engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
            await conn.exec_driver_sql("DROP TABLE IF EXISTS alembic_version")
            await conn.run_sync(Base.metadata.create_all)
        now = datetime.now(UTC)
        async with db.sessions() as s:
            s.add(make_slot(slot_id=1))
            await s.commit()  # slot row must be visible before the FK-dependent row is inserted
            s.add(DomainVerification(slot_id=1, method="meta_tag", token="tok"))
            await s.commit()

        async def attempt() -> int:
            async with db.sessions() as s:
                claimed = await offchain_service._claim_check_window(s, 1, now=now)
                await asyncio.sleep(0.05)  # hold the row lock so the attempts overlap
                await s.commit()
                return claimed

        results = await asyncio.gather(*(attempt() for _ in range(8)))
        assert sorted(results) == [0] * 7 + [1]
    finally:
        async with db.engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
        await db.dispose()


# ------------------------------------------------------------------------------ _check_meta


async def test_check_meta_refuses_http_redirect_outside_dev(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Same SSRF guard as media fetch (`_hop_allowed`, T17): a redirect that downgrades to
    plain http is refused outside dev, and the forbidden hop is never requested."""
    requested: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requested.append(str(request.url))
        if str(request.url) == "https://pub.example/":
            return httpx.Response(302, headers={"location": "http://pub.example/"})
        raise AssertionError("the http hop must never be requested")

    monkeypatch.setattr(offchain_service.httpx, "AsyncClient", _mock_client(handler))
    ok = await offchain_service._check_meta("pub.example", "tok123", is_dev=False)
    assert ok is False
    assert requested == ["https://pub.example/"]


async def test_check_meta_refuses_private_ip_redirect_outside_dev(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    requested: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requested.append(str(request.url))
        if str(request.url) == "https://pub.example/":
            return httpx.Response(302, headers={"location": "https://10.0.0.1/"})
        raise AssertionError("the private-IP hop must never be requested")

    monkeypatch.setattr(offchain_service.httpx, "AsyncClient", _mock_client(handler))
    ok = await offchain_service._check_meta("pub.example", "tok123", is_dev=False)
    assert ok is False
    assert requested == ["https://pub.example/"]


async def test_check_meta_refuses_non_identity_content_encoding(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A response declaring `Content-Encoding: gzip` is refused outright, unread — even though
    decompressing it would reveal the correct tag — because a compressed body can decode to far
    more bytes than the wire size, defeating the byte cap below (fix round 1, decompression-bomb
    guard, same as `fetch_media`; ROADMAP 6.9 step 39, docs/threat-model.md T18).

    The body here decompresses to a page with the correct tag, so a broken (always-True)
    encoding check wouldn't just leave `ok` accidentally `False` (raw gzip bytes decoded as text
    essentially never match `META_RE`) — it would make `ok` come back `True`, and the stream
    below would be consumed. Both are checked so this test fails for the right reason.
    """
    token = "tok123"
    meta = f'<meta name="openad-site-verification" content="{token}">'.encode()
    page = b"<html><head>" + meta + b"</head></html>"
    compressed = gzip.compress(page)
    consumed = {"read": False}

    class _FlaggingStream(httpx.AsyncByteStream):
        async def __aiter__(self) -> AsyncIterator[bytes]:
            consumed["read"] = True
            yield compressed

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, headers={"content-encoding": "gzip"}, stream=_FlaggingStream())

    monkeypatch.setattr(offchain_service.httpx, "AsyncClient", _mock_client(handler))
    ok = await offchain_service._check_meta("pub.example", token, is_dev=False)
    assert ok is False
    assert consumed["read"] is False, "body must never be read when Content-Encoding isn't identity"


async def test_check_meta_stops_at_body_cap(monkeypatch: pytest.MonkeyPatch) -> None:
    """The body is read only up to `DOMAIN_CHECK_BODY_CAP_BYTES` (or `</head>`); a page with no
    closing `</head>` at all must not be read to completion. The verification tag is placed
    just past the cap, so finding it would prove the cap was NOT enforced."""
    token = "tok123"
    meta = f'<meta name="openad-site-verification" content="{token}">'.encode()
    cap = offchain_service.DOMAIN_CHECK_BODY_CAP_BYTES
    padded = b"<html><head>" + (b"x" * (cap + 4096)) + meta  # no </head> at all

    class _Stream(httpx.AsyncByteStream):
        async def __aiter__(self) -> AsyncIterator[bytes]:
            for i in range(0, len(padded), 4096):
                yield padded[i : i + 4096]

    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, stream=_Stream())

    monkeypatch.setattr(offchain_service.httpx, "AsyncClient", _mock_client(handler))
    ok = await offchain_service._check_meta("pub.example", token, is_dev=False)
    assert ok is False


async def test_check_meta_body_scan_is_incremental_not_quadratic(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A page with no closing `</head>` at all, delivered as one big first chunk followed by
    many 1-byte chunks up to the cap, must not make the per-chunk `</head>` search rescan the
    whole accumulated buffer every time (O(bytes²)) — the reviewer measured 9.89s CPU that way
    in a 10s check. Bounding wall time generously (well under what O(n²) would take, and well
    over what the fixed O(n) scan needs) catches a regression without depending on exact
    timings (fix round 1, ROADMAP 6.9 step 39)."""
    cap = offchain_service.DOMAIN_CHECK_BODY_CAP_BYTES
    first = b"<html><head>" + b"x" * (128 * 1024)
    tail_len = cap - len(first) + 4096  # push a good way past the cap in 1-byte chunks

    class _DripStream(httpx.AsyncByteStream):
        async def __aiter__(self) -> AsyncIterator[bytes]:
            yield first
            for _ in range(tail_len):
                yield b"x"

    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, stream=_DripStream())

    monkeypatch.setattr(offchain_service.httpx, "AsyncClient", _mock_client(handler))
    start = time.monotonic()
    ok = await offchain_service._check_meta("pub.example", "tok123", is_dev=False)
    elapsed = time.monotonic() - start
    assert ok is False
    assert elapsed < 5.0, f"body scan took {elapsed:.2f}s — looks quadratic again"


async def test_check_meta_slow_drip_times_out(monkeypatch: pytest.MonkeyPatch) -> None:
    """The domain check's own deadline (`DOMAIN_CHECK_DEADLINE_SECONDS`) must actually bound the
    fetch — this was untested before this round, so `asyncio.timeout(None)` could silently
    regress in. A small monkeypatched deadline plus a finite, fast slow-drip stream keeps this
    fast and deterministic (fix round 1, ROADMAP 6.9 step 39)."""

    class _SlowDripStream(httpx.AsyncByteStream):
        async def __aiter__(self) -> AsyncIterator[bytes]:
            for _ in range(10):
                await asyncio.sleep(0.08)  # 0.8s total, several times the deadline below
                yield b"a"

    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, stream=_SlowDripStream())

    monkeypatch.setattr(offchain_service.httpx, "AsyncClient", _mock_client(handler))
    monkeypatch.setattr(offchain_service, "DOMAIN_CHECK_DEADLINE_SECONDS", 0.3)
    ok = await offchain_service._check_meta("pub.example", "tok123", is_dev=False)
    assert ok is False


async def test_check_meta_stops_reading_at_head_close(monkeypatch: pytest.MonkeyPatch) -> None:
    """Reading really stops as soon as `</head>` is seen, instead of waiting for the rest of the
    response: proven by a stream that hangs right after yielding `</head>`. If the stop-at-
    `</head>` check were ever removed (leaving only the byte cap, which this small page never
    reaches), the loop would wait on that never-arriving next chunk until the deadline — so this
    would both time out AND return the wrong answer (fix round 1, ROADMAP 6.9 step 39)."""
    token = "tok123"
    meta = f'<meta name="openad-site-verification" content="{token}">'.encode()
    page = b"<html><head>" + meta + b"</head>"

    class _HangsAfterHeadClose(httpx.AsyncByteStream):
        async def __aiter__(self) -> AsyncIterator[bytes]:
            yield page
            await asyncio.Event().wait()  # never resolves: proves reading really stopped

    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, stream=_HangsAfterHeadClose())

    monkeypatch.setattr(offchain_service.httpx, "AsyncClient", _mock_client(handler))
    monkeypatch.setattr(offchain_service, "DOMAIN_CHECK_DEADLINE_SECONDS", 0.3)
    start = time.monotonic()
    ok = await offchain_service._check_meta("pub.example", token, is_dev=False)
    elapsed = time.monotonic() - start
    assert ok is True
    assert elapsed < 0.3, f"took {elapsed:.2f}s — looks like it waited past </head>"


async def test_check_meta_finds_tag_before_head_close(monkeypatch: pytest.MonkeyPatch) -> None:
    """The happy path: a small page with the tag inside `<head>` verifies."""
    token = "tok123"
    meta = f'<meta name="openad-site-verification" content="{token}">'.encode()
    page = b"<html><head>" + meta + b"</head><body></body></html>"

    def handler(request: httpx.Request) -> httpx.Response:
        return _content_response(200, page)

    monkeypatch.setattr(offchain_service.httpx, "AsyncClient", _mock_client(handler))
    ok = await offchain_service._check_meta("pub.example", token, is_dev=False)
    assert ok is True
