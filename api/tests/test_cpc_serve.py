"""CPC serve GSP, click tokens, settler batching (PROTOCOL.md §11.3-11.4)."""

from __future__ import annotations

import time

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from openad.models import Approval, ClickEvent, ServeEvent
from openad.models.creative import APPROVAL_APPROVED
from openad.models.offchain import ClickEvent as ClickRow
from openad.services.clicks import ClickToken, mint_click_token, parse_click_token, token_hash
from openad.services.serve import CPC_TICK, ServeContext, gsp_charge, resolve
from openad.settler.batches import plan_batches
from tests.conftest import (
    PUBLISHER,
    make_campaign,
    make_creative,
    make_slot,
    make_terms,
    make_verified,
)

CTX = ServeContext(public_url="http://api.test", ttl=30)
SECRET = "test-click-hmac"
FLOOR = 100_000


def test_gsp_solo_and_runner() -> None:
    assert gsp_charge(1_000_000, FLOOR, None) == FLOOR
    assert gsp_charge(FLOOR, FLOOR, None) == FLOOR
    assert gsp_charge(1_000_000, FLOOR, 200_000) == 200_000 + CPC_TICK
    assert gsp_charge(210_000, FLOOR, 200_000) == 210_000


def test_http_app_does_not_load_settler() -> None:
    from pathlib import Path

    main = Path(__file__).resolve().parents[1] / "src" / "openad" / "main.py"
    text = main.read_text(encoding="utf-8")
    assert "settler" not in text


async def _seed_cpc(session: AsyncSession, *, second: bool = False) -> None:
    slot = make_slot()
    session.add_all(
        [
            slot,
            make_terms(sale_mode=1, floor_cpc=FLOOR, start_price=0, floor_price=0, lead_seconds=0),
            make_creative(),
            make_verified(),
            make_campaign(max_cpc=1_000_000, remaining=10_000_000),
            Approval(publisher=PUBLISHER, creative_id=7, status=APPROVAL_APPROVED, updated_block=2),
        ]
    )
    if second:
        session.add(
            make_campaign(
                campaign_id=2,
                max_cpc=400_000,
                remaining=5_000_000,
            )
        )
    await session.commit()


async def test_cpc_serve_winner_and_gsp(session: AsyncSession) -> None:
    await _seed_cpc(session, second=True)
    result = await resolve(session, 1, int(time.time()), CTX)
    assert result.response.status == "campaign"
    assert result.campaign is not None and result.campaign.campaign_id == 1
    assert result.gsp_cpc == 400_000 + CPC_TICK
    assert result.response.campaign is not None
    assert result.response.lease is None
    assert result.response.creative is not None
    assert result.response.creative.click_url == ""


async def test_cpc_paused_terms_house(session: AsyncSession) -> None:
    slot = make_slot()
    session.add_all(
        [
            slot,
            make_terms(sale_mode=1, floor_cpc=FLOOR, paused=True, lead_seconds=0),
            make_creative(),
            make_verified(),
            make_campaign(),
        ]
    )
    await session.commit()
    result = await resolve(session, 1, int(time.time()), CTX)
    assert result.response.status == "empty"


async def test_http_campaign_click_and_replay(client: AsyncClient, session: AsyncSession) -> None:
    await _seed_cpc(session)
    res = await client.get("/v1/serve/1")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "campaign"
    click = body["creative"]["clickUrl"]
    assert "/v1/c/" in click
    token = click.rsplit("/", 1)[-1]
    landing = await client.get(f"/v1/c/{token}", follow_redirects=False)
    assert landing.status_code == 302
    assert landing.headers["location"] == "https://advertiser.example/"
    again = await client.get(f"/v1/c/{token}", follow_redirects=False)
    assert again.status_code == 404
    events = (await session.execute(select(ServeEvent))).scalars().all()
    assert events[0].served_kind == "campaign" and events[0].gsp_cpc == FLOOR
    clicks = (await session.execute(select(ClickEvent))).scalars().all()
    assert len(clicks) == 1 and clicks[0].payable is True


async def test_invalid_click_token_is_404(client: AsyncClient) -> None:
    res = await client.get("/v1/c/not-a-token", follow_redirects=False)
    assert res.status_code == 404


def test_click_token_roundtrip() -> None:
    now = 1_700_000_000
    tok = ClickToken(slot_id=1, campaign_id=2, creative_id=7, serve_event_id=9, exp=now + 60)
    raw = mint_click_token(secret=SECRET, token=tok)
    parsed = parse_click_token(secret=SECRET, raw=raw, now=now)
    assert parsed == tok
    assert parse_click_token(secret=SECRET, raw=raw, now=tok.exp) is None
    assert len(token_hash(raw)) == 64


def test_plan_batches_caps_remaining() -> None:
    rows = [
        ClickRow(
            id=1,
            token_hash="a" * 64,
            slot_id=1,
            campaign_id=1,
            creative_id=7,
            payable=True,
            gsp_cpc=100,
            at=1,
        ),
        ClickRow(
            id=2,
            token_hash="b" * 64,
            slot_id=1,
            campaign_id=1,
            creative_id=7,
            payable=True,
            gsp_cpc=100,
            at=2,
        ),
        ClickRow(
            id=3,
            token_hash="c" * 64,
            slot_id=1,
            campaign_id=1,
            creative_id=7,
            payable=True,
            gsp_cpc=100,
            at=3,
        ),
    ]
    planned = plan_batches(rows, remaining_of={1: 250}, max_batch_charge=10_000)
    assert len(planned) == 1
    assert planned[0].payable_clicks == 2
    assert planned[0].charged == 200
    assert len(planned[0].batch_id) == 32
