"""CPC click integrity (JIT step 45; ARCHITECTURE §3.4, threat model T13).

- A campaign serve response is ``private, no-store``: it carries a one-time click token and is
  an impression, so no cache may hand it to a second visitor. Lease, house and empty responses
  stay publicly cacheable, and so does media.
- The click burst rule keys on the trusted-hop client key (``ratelimit.client_key``), runs
  only when that key identifies the visitor, and remembers at most 10 000 HMAC'd keys.
"""

from __future__ import annotations

import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from structlog.testing import capture_logs

from openad.config import Settings
from openad.db.session import Database
from openad.main import create_app
from openad.models import Approval, ClickEvent, ServeEvent
from openad.models.creative import APPROVAL_APPROVED
from openad.routers import clicks as clicks_router
from openad.services import clicks as click_service
from tests.conftest import (
    PUBLISHER,
    make_campaign,
    make_creative,
    make_house,
    make_lease,
    make_slot,
    make_terms,
    make_verified,
)

FLOOR = 100_000
# Behind Cloud Run every visitor reaches the api through the same front-end address.
PROXY = "169.254.1.1"
VISITOR_A = "198.51.100.7"
VISITOR_B = "198.51.100.8"
FORGED = "203.0.113.66"
DISABLED = "clicks.burst_rule_disabled"


class _FrozenClock:
    """Stands in for the ``time`` module in the clicks router, so every click in a test lands
    in the same second and the 2-second burst window can't lapse between two of them."""

    def __init__(self, now: int) -> None:
        self.now = now

    def time(self) -> float:
        return float(self.now)


@pytest.fixture(autouse=True)
def burst_map(monkeypatch: pytest.MonkeyPatch) -> click_service.BurstWindow:
    """A fresh burst map per test, with the module's own bound and window, so clicks in one
    test never count as bursts in another."""
    configured = click_service._BURST
    fresh = click_service.BurstWindow(max_keys=configured.max_keys, window=configured.window)
    monkeypatch.setattr(click_service, "_BURST", fresh)
    return fresh


@pytest.fixture(autouse=True)
def frozen_click_clock(monkeypatch: pytest.MonkeyPatch) -> _FrozenClock:
    clock = _FrozenClock(int(time.time()))
    monkeypatch.setattr(clicks_router, "time", clock)
    return clock


async def _seed_cpc(
    session: AsyncSession, *, slot_ids: tuple[int, ...] = (1,), media: Path | None = None
) -> None:
    """CPC slots (domain example.com), each with one open campaign (its id is the slot's) for
    the same approved, verified creative 7."""
    verified = make_verified()
    if media is not None:
        verified.cached_path = str(media)
    rows: list[Any] = [make_slot(slot_id) for slot_id in slot_ids]
    rows += [
        make_terms(
            slot_id, sale_mode=1, floor_cpc=FLOOR, start_price=0, floor_price=0, lead_seconds=0
        )
        for slot_id in slot_ids
    ]
    rows += [make_creative(), verified]
    rows += [
        make_campaign(slot_id, slot_id, max_cpc=1_000_000, remaining=10_000_000)
        for slot_id in slot_ids
    ]
    rows.append(
        Approval(publisher=PUBLISHER, creative_id=7, status=APPROVAL_APPROVED, updated_block=2)
    )
    session.add_all(rows)
    await session.commit()


def _app(settings: Settings, db: Database, **overrides: Any) -> FastAPI:
    """An app with these settings. Build it before ``capture_logs()``: ``create_app``
    reconfigures structlog, which would silently end the capture."""
    return create_app(settings=settings.model_copy(update=overrides), database=db)


@asynccontextmanager
async def _http(app: FastAPI, peer: str = PROXY) -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app, client=(peer, 50000))
    async with AsyncClient(transport=transport, base_url="http://api.test") as c:
        yield c


async def _click(c: AsyncClient, xff: str | None = None, *, slot_id: int = 1) -> None:
    """One visitor's view of a slot and a click on it; ``xff`` goes on both requests."""
    headers = {"X-Forwarded-For": xff} if xff is not None else {}
    served = await c.get(f"/v1/serve/{slot_id}", headers=headers)
    assert served.json()["status"] == "campaign"
    token = served.json()["creative"]["clickUrl"].rsplit("/", 1)[-1]
    landing = await c.get(f"/v1/c/{token}", headers=headers, follow_redirects=False)
    assert landing.status_code == 302


async def _click_reasons(session: AsyncSession) -> list[str | None]:
    """Each click's IVT reason in order: None means payable."""
    rows = (
        await session.execute(
            select(ClickEvent.ivt_reason, ClickEvent.payable).order_by(ClickEvent.id)
        )
    ).all()
    assert all(payable == (reason is None) for reason, payable in rows)
    return [reason for reason, _payable in rows]


def _disabled_logs(logs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """The burst-rule warnings among captured logs; asserts the capture saw the app start, so
    an empty result can't come from a capture that saw nothing."""
    assert any(entry["event"] == "api.start" for entry in logs)
    return [entry for entry in logs if entry["event"] == DISABLED]


# ---------------------------------------------------------------------------- cache headers


async def test_campaign_serve_is_private_no_store_with_a_new_token_each_time(
    client: AsyncClient, session: AsyncSession
) -> None:
    await _seed_cpc(session)
    first = await client.get("/v1/serve/1")
    second = await client.get("/v1/serve/1")
    for res in (first, second):
        assert res.status_code == 200
        assert res.json()["status"] == "campaign"
        assert res.headers["cache-control"] == "private, no-store"
        assert "public" not in res.headers["cache-control"]
        assert "etag" not in res.headers
    tokens = [res.json()["creative"]["clickUrl"] for res in (first, second)]
    assert all(t.startswith("http://api.test/v1/c/") for t in tokens)
    assert tokens[0] != tokens[1]
    served = (await session.execute(select(ServeEvent.served_kind))).scalars().all()
    assert served == ["campaign", "campaign"]  # each response is its own impression


@pytest.mark.parametrize("status", ["lease", "house", "empty", "cpc-house"])
async def test_lease_house_and_empty_stay_public(
    client: AsyncClient, session: AsyncSession, status: str
) -> None:
    slot = make_slot(first_period_start=int(time.time()) - 60, period_seconds=3600)
    rows: list[Any] = [slot]
    if status == "lease":
        rows += [make_creative(), make_verified(), make_lease(slot, 0, approval_mode=1)]
    elif status == "house":
        rows.append(make_house())
    elif status == "cpc-house":  # a CPC slot with no open campaign falls back to its house ad
        rows += [make_terms(sale_mode=1, floor_cpc=FLOOR, lead_seconds=0), make_house()]
    session.add_all(rows)
    await session.commit()

    res = await client.get("/v1/serve/1", headers={"Origin": "https://example.com"})
    expected = "house" if status == "cpc-house" else status
    assert res.status_code == 200
    assert res.json()["status"] == expected
    assert res.headers["cache-control"] == "public, max-age=30"
    assert res.headers["vary"].lower() == "origin"
    assert res.headers["etag"].startswith(f'W/"1-{expected}-')


async def test_unknown_slot_404_stays_public(client: AsyncClient) -> None:
    res = await client.get("/v1/serve/4242")
    assert res.status_code == 404
    assert res.headers["cache-control"] == "public, max-age=60"


async def test_media_of_a_campaign_slot_stays_public(
    client: AsyncClient, session: AsyncSession, settings: Settings
) -> None:
    cache_dir = settings.media_cache_path
    cache_dir.mkdir(parents=True, exist_ok=True)
    media = cache_dir / "7.bin"
    media.write_bytes(b"\x89PNG verified bytes")
    await _seed_cpc(session, media=media)

    assert (await client.get("/v1/serve/1")).headers["cache-control"] == "private, no-store"
    res = await client.get("/v1/serve/1/media")
    assert res.status_code == 200
    assert res.content == b"\x89PNG verified bytes"
    assert res.headers["cache-control"] == "public, max-age=30"
    assert res.headers["etag"] == '"0x' + "11" * 32 + '"'


# ---------------------------------------------------------------------- burst rule: the key


async def test_one_trusted_hop_keys_the_burst_rule_on_the_rightmost_xff_entry(
    settings: Settings, db: Database, session: AsyncSession, burst_map: click_service.BurstWindow
) -> None:
    await _seed_cpc(session, slot_ids=(1, 2))
    app = _app(settings, db, env="staging", trusted_proxy_hops=1)
    with capture_logs() as logs:
        async with app.router.lifespan_context(app), _http(app) as c:
            await _click(c, VISITOR_A)
            await _click(c, VISITOR_B)  # same proxy, same slot, same second: another visitor
            await _click(c, VISITOR_A)  # the same visitor again
            await _click(c, f"{FORGED}, {VISITOR_A}")  # a forged left-hand entry changes nothing
            await _click(c, f"{VISITOR_A}, {VISITOR_B}")  # nor does borrowing A's address
            await _click(c, VISITOR_A, slot_id=2)  # the same visitor on another slot is payable
    assert await _click_reasons(session) == [None, None, "burst", "burst", "burst", None]
    assert _disabled_logs(logs) == []

    def key(client: str, slot_id: int = 1) -> str:
        return click_service.burst_key(
            secret=settings.click_hmac_secret, client=client, slot_id=slot_id
        )

    assert len(burst_map) == 3
    assert key(VISITOR_A) in burst_map and key(VISITOR_B) in burst_map
    assert key(VISITOR_A, slot_id=2) in burst_map
    assert key(PROXY) not in burst_map and key(FORGED) not in burst_map


@pytest.mark.parametrize("env", ["staging", "prod"])
async def test_zero_hops_in_a_hosted_env_skips_the_burst_rule_and_logs_it_once(
    settings: Settings,
    db: Database,
    session: AsyncSession,
    burst_map: click_service.BurstWindow,
    env: str,
) -> None:
    await _seed_cpc(session)
    app = _app(settings, db, env=env, trusted_proxy_hops=0)
    with capture_logs() as logs:
        async with app.router.lifespan_context(app), _http(app) as c:
            await _click(c)
            await _click(c)  # the same peer (every visitor, here) in the same second
    assert await _click_reasons(session) == [None, None]
    assert len(burst_map) == 0
    assert _disabled_logs(logs) == [
        {"event": DISABLED, "log_level": "warning", "env": env, "trusted_proxy_hops": 0}
    ]


@pytest.mark.parametrize("env", ["test", "dev"])
async def test_dev_and_test_key_the_burst_rule_on_the_tcp_peer(
    settings: Settings, db: Database, session: AsyncSession, env: str
) -> None:
    await _seed_cpc(session)
    app = _app(settings, db, env=env, trusted_proxy_hops=0)
    with capture_logs() as logs:
        async with (
            app.router.lifespan_context(app),
            _http(app, peer="10.0.0.1") as a,
            _http(app, peer="10.0.0.2") as b,
        ):
            await _click(a, VISITOR_A)
            await _click(a, VISITOR_B)  # 0 hops: X-Forwarded-For is ignored, the peer repeats
            await _click(b)  # another peer
    assert await _click_reasons(session) == [None, "burst", None]
    assert _disabled_logs(logs) == []


async def test_click_ivt_off_skips_the_burst_rule(
    settings: Settings, db: Database, session: AsyncSession
) -> None:
    await _seed_cpc(session)
    app = _app(settings, db, click_ivt=False)
    async with app.router.lifespan_context(app), _http(app) as c:
        await _click(c)
        await _click(c)
    assert await _click_reasons(session) == [None, None]


@pytest.mark.parametrize(
    ("env", "hops", "active"),
    [
        ("dev", 0, True),
        ("test", 0, True),
        ("staging", 0, False),
        ("prod", 0, False),
        ("staging", 1, True),
        ("prod", 2, True),
    ],
)
def test_burst_rule_active_needs_a_key_that_identifies_the_visitor(
    settings: Settings, env: str, hops: int, active: bool
) -> None:
    configured = settings.model_copy(update={"env": env, "trusted_proxy_hops": hops})
    assert clicks_router.burst_rule_active(configured) is active


# ---------------------------------------------------------------------- burst rule: the map


def test_burst_window_blocks_inside_the_window_and_an_expired_entry_does_not() -> None:
    window = click_service.BurstWindow(window=2)
    assert window.hit("a", 100) is False
    assert window.hit("a", 101) is True  # a repeat inside the window is a burst
    assert window.hit("a", 101) is True  # and a burst doesn't extend the window
    assert window.hit("a", 102) is False  # expired: it doesn't block, and is recorded again
    assert window.hit("a", 103) is True


def test_burst_window_drops_expired_entries_on_insert() -> None:
    window = click_service.BurstWindow(window=2)
    for key in ("a", "b", "c"):
        window.hit(key, 100)
    window.hit("d", 101)
    assert len(window) == 4
    assert window.hit("e", 102) is False  # a, b and c expired at 102; d is still live
    assert len(window) == 2
    assert "a" not in window and "d" in window and "e" in window


def test_burst_window_is_bounded_and_evicts_the_oldest() -> None:
    window = click_service.BurstWindow(max_keys=3)
    for key in ("a", "b", "c"):
        assert window.hit(key, 100) is False
    assert window.hit("d", 100) is False  # full: "a", the oldest, goes
    assert len(window) == 3
    assert "a" not in window
    assert window.hit("b", 100) is True  # still remembered
    assert window.hit("a", 100) is False  # evicted, so it no longer blocks
    assert len(window) == 3
    assert "b" not in window  # "a" came back in and pushed out the next oldest


def test_the_burst_map_keeps_at_most_ten_thousand_hmac_keys(
    burst_map: click_service.BurstWindow,
) -> None:
    assert click_service.BURST_MAX_KEYS == 10_000
    assert burst_map.max_keys == 10_000 and burst_map.window == 2
    now = 1_700_000_000
    clients = [f"10.{i // 65_536}.{i // 256 % 256}.{i % 256}" for i in range(10_050)]
    keys = [click_service.burst_key(secret="s", client=ip, slot_id=1) for ip in clients]
    for key in keys:
        assert click_service.burst_blocked(key, now) is False
    assert len(burst_map) == 10_000
    assert all(key not in burst_map for key in keys[:50])  # the 50 oldest went first
    assert keys[50] in burst_map
    assert click_service.burst_blocked(keys[-1], now) is True
    assert all(len(key) == 32 and "." not in key for key in keys)  # HMACs, not addresses


# ------------------------------------------------------------------- origin enforcement (CPC)


async def test_enforced_origin_serves_campaigns_only_on_the_slot_domain(
    settings: Settings, db: Database, session: AsyncSession
) -> None:
    await _seed_cpc(session)  # slot domain example.com, no house ad
    app = _app(settings, db, serve_enforce_origin=True)
    async with app.router.lifespan_context(app), _http(app) as c:
        own = await c.get("/v1/serve/1", headers={"Origin": "https://www.example.com"})
        foreign = await c.get("/v1/serve/1", headers={"Origin": "https://evil.test"})
    assert own.json()["status"] == "campaign"
    assert own.headers["cache-control"] == "private, no-store"
    assert "/v1/c/" in own.json()["creative"]["clickUrl"]
    assert foreign.json()["status"] == "empty"
    assert foreign.json()["creative"] is None  # a foreign page gets no click token
    assert foreign.headers["cache-control"] == "public, max-age=30"
    served = await session.execute(
        select(ServeEvent.served_kind, ServeEvent.origin_ok).order_by(ServeEvent.id)
    )
    assert [tuple(row) for row in served.all()] == [("campaign", True), ("empty", False)]


@pytest.mark.parametrize("enforce", [True, False])
@pytest.mark.parametrize(
    ("headers", "paid_when_enforced"),
    [
        pytest.param({"Origin": "null"}, False, id="opaque-no-referer"),
        pytest.param(
            {"Origin": "null", "Referer": "https://www.example.com/post"}, True, id="opaque-own"
        ),
        pytest.param(
            {"Origin": "null", "Referer": "https://evil.test/"}, False, id="opaque-foreign"
        ),
        pytest.param({}, True, id="no-headers"),
        pytest.param({"Origin": "http://[::1]:5173"}, True, id="ipv6-loopback-in-test"),
        pytest.param({"Origin": "http://["}, False, id="unparseable-not-500"),
    ],
)
async def test_enforced_origin_refuses_opaque_pages_but_not_headerless_requests(
    settings: Settings,
    db: Database,
    session: AsyncSession,
    headers: dict[str, str],
    paid_when_enforced: bool,
    enforce: bool,
) -> None:
    await _seed_cpc(session)  # slot domain example.com, no house ad; env is test
    app = _app(settings, db, serve_enforce_origin=enforce)
    async with app.router.lifespan_context(app), _http(app) as c:
        res = await c.get("/v1/serve/1", headers=headers)
    paid = paid_when_enforced or not enforce  # enforcement off: always the campaign
    assert res.status_code == 200
    body = res.json()
    if paid:
        assert body["status"] == "campaign"
        assert "/v1/c/" in body["creative"]["clickUrl"]
    else:
        assert body["status"] == "empty"
        assert body["creative"] is None  # no live click token for a page we can't place
    origin_ok = (await session.execute(select(ServeEvent.origin_ok))).scalar_one()
    assert origin_ok is paid


@pytest.mark.parametrize("origin", ["http://localhost:5173", "http://[::1]:5173"])
async def test_loopback_pages_are_not_the_slot_domain_in_prod(
    settings: Settings, db: Database, session: AsyncSession, origin: str
) -> None:
    await _seed_cpc(session)  # slot domain example.com, no house ad
    app = _app(settings, db, env="prod", serve_enforce_origin=True)
    async with app.router.lifespan_context(app), _http(app) as c:
        res = await c.get("/v1/serve/1", headers={"Origin": origin})
    assert res.status_code == 200
    assert res.json()["status"] == "empty"  # loopback counts only in dev and test
    assert res.json()["creative"] is None
    origin_ok = (await session.execute(select(ServeEvent.origin_ok))).scalar_one()
    assert origin_ok is False
