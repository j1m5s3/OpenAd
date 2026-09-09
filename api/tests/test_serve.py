"""Serving rule (PROTOCOL.md section 7) against indexed state, plus the HTTP contract."""

from __future__ import annotations

import time

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from openad.models import Approval, ServeEvent
from openad.models.creative import APPROVAL_APPROVED, APPROVAL_REVOKED
from openad.services.serve import ServeContext, resolve
from tests.conftest import (
    PUBLISHER,
    make_creative,
    make_house,
    make_lease,
    make_slot,
    make_verified,
)

CTX = ServeContext(public_url="http://api.test", ttl=30)


def _now_in_period(slot, period_index: int) -> int:
    start, _ = slot.period_window(period_index)
    return start + 10


async def _seed_lease(session: AsyncSession, *, approval_mode: int = 0, approved: bool = True):
    slot = make_slot()
    session.add_all([slot, make_creative(), make_verified()])
    now = _now_in_period(slot, 3)
    session.add(make_lease(slot, 3, approval_mode=approval_mode))
    if approved:
        session.add(
            Approval(publisher=PUBLISHER, creative_id=7, status=APPROVAL_APPROVED, updated_block=2)
        )
    await session.commit()
    return slot, now


async def test_unknown_slot(session: AsyncSession) -> None:
    result = await resolve(session, 999, int(time.time()), CTX)
    assert result.response.status == "unknown"
    assert result.slot is None


async def test_empty_without_lease_or_house(session: AsyncSession) -> None:
    slot = make_slot()
    session.add(slot)
    await session.commit()
    result = await resolve(session, 1, _now_in_period(slot, 0), CTX)
    assert result.response.status == "empty"
    assert result.response.creative is None


async def test_lease_served_when_approved_and_verified(session: AsyncSession) -> None:
    _slot, now = await _seed_lease(session)
    result = await resolve(session, 1, now, CTX)
    r = result.response
    assert r.status == "lease"
    assert r.creative is not None
    assert r.creative.media_url == "http://api.test/v1/serve/1/media?v=0x" + "11" * 32
    assert r.creative.click_url == "https://advertiser.example/"
    assert (r.creative.width, r.creative.height) == (300, 250)
    assert r.lease is not None and r.lease.expires_at.endswith("Z")
    assert result.lease is not None and result.lease.period_index == 3


async def test_lease_not_served_outside_its_period(session: AsyncSession) -> None:
    slot, now = await _seed_lease(session)
    result = await resolve(
        session, 1, now + slot.period_window(0)[1] - slot.period_window(0)[0], CTX
    )
    assert result.response.status == "empty"


async def test_required_mode_needs_approval(session: AsyncSession) -> None:
    _, now = await _seed_lease(session, approval_mode=0, approved=False)
    result = await resolve(session, 1, now, CTX)
    assert result.response.status == "empty"


async def test_waived_mode_serves_without_approval(session: AsyncSession) -> None:
    _, now = await _seed_lease(session, approval_mode=1, approved=False)
    result = await resolve(session, 1, now, CTX)
    assert result.response.status == "lease"


async def test_revoked_approval_blocks_even_when_waived(session: AsyncSession) -> None:
    _, now = await _seed_lease(session, approval_mode=1, approved=False)
    session.add(
        Approval(publisher=PUBLISHER, creative_id=7, status=APPROVAL_REVOKED, updated_block=3)
    )
    await session.commit()
    result = await resolve(session, 1, now, CTX)
    assert result.response.status == "empty"


async def test_unverified_creative_falls_back_to_house(session: AsyncSession) -> None:
    slot = make_slot()
    session.add_all([slot, make_creative(), make_house()])  # no CreativeVerification row
    now = _now_in_period(slot, 1)
    session.add(make_lease(slot, 1, approval_mode=1))
    await session.commit()
    result = await resolve(session, 1, now, CTX)
    assert result.response.status == "house"
    assert result.response.creative is not None
    assert result.response.creative.media_url == "https://example.com/house.png"


async def test_http_contract_and_serve_event(client: AsyncClient, session: AsyncSession) -> None:
    slot = make_slot(first_period_start=int(time.time()) - 60, period_seconds=3600)
    session.add_all([slot, make_creative(), make_verified(), make_lease(slot, 0, approval_mode=1)])
    await session.commit()

    res = await client.get("/v1/serve/1", headers={"Origin": "https://example.com"})
    assert res.status_code == 200
    assert res.headers["cache-control"] == "public, max-age=30"
    body = res.json()
    assert set(body) == {"slotId", "status", "creative", "lease", "ttl"}
    assert body["status"] == "lease"
    assert set(body["creative"]) == {"kind", "mediaUrl", "clickUrl", "width", "height", "alt"}
    assert set(body["lease"]) == {"advertiser", "expiresAt"}

    events = (await session.execute(select(ServeEvent))).scalars().all()
    assert len(events) == 1
    assert events[0].served_kind == "lease" and events[0].lease_period_index == 0


async def test_http_unknown_is_404(client: AsyncClient) -> None:
    res = await client.get("/v1/serve/4242")
    assert res.status_code == 404
    assert res.json()["status"] == "unknown"


async def test_media_route_pending(client: AsyncClient) -> None:
    res = await client.get("/v1/serve/1/media")
    assert res.status_code == 404
    assert res.json()["roadmap"] == "2.3"
