"""Creative resolution for a slot — the normative serving rule (docs/PROTOCOL.md §7, §11.4).

Reads ONLY indexed state. Never calls the chain.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from openad.models import (
    AllowedAdvertiser,
    Approval,
    Campaign,
    Creative,
    CreativeVerification,
    HouseAd,
    Lease,
    ServeEvent,
    Slot,
    Terms,
)
from openad.models.creative import APPROVAL_APPROVED, APPROVAL_REJECTED, APPROVAL_REVOKED
from openad.models.offchain import VERIFY_VERIFIED
from openad.schemas.serve import ServeCampaign, ServeCreative, ServeLease, ServeResponse

APPROVAL_MODE_REQUIRED = 0
APPROVAL_MODE_WAIVED = 1
SALE_CPC = 1
CPC_TICK = 10_000


@dataclass(frozen=True)
class ServeContext:
    public_url: str
    ttl: int


def _iso(ts: int) -> str:
    return datetime.fromtimestamp(ts, tz=UTC).isoformat().replace("+00:00", "Z")


def gsp_charge(winner_max_cpc: int, floor_cpc: int, runner_max_cpc: int | None) -> int:
    """PROTOCOL §11.3 with q = Q_DENOM for every campaign."""
    if runner_max_cpc is None:
        return min(winner_max_cpc, floor_cpc)
    return min(winner_max_cpc, max(floor_cpc, runner_max_cpc + CPC_TICK))


async def current_lease(session: AsyncSession, slot: Slot, now: int) -> Lease | None:
    idx = slot.current_period_index(now)
    if idx is None:
        return None
    return await session.get(Lease, (slot.slot_id, slot.calendar_version, idx))


async def is_creative_serveable(
    session: AsyncSession, slot: Slot, creative_id: int, approval_mode: int
) -> bool:
    """PROTOCOL 7.2 against indexed state (LEASE lease and CPC campaign)."""
    creative = await session.get(Creative, creative_id)
    if creative is None or creative.revoked:
        return False

    verification = await session.get(CreativeVerification, creative_id)
    if verification is None or verification.status != VERIFY_VERIFIED:
        return False

    approval = await session.get(Approval, (slot.owner, creative_id))
    status = approval.status if approval else None
    if status in (APPROVAL_REJECTED, APPROVAL_REVOKED):
        return False

    if approval_mode == APPROVAL_MODE_WAIVED:
        return True

    if status == APPROVAL_APPROVED:
        return True
    allowed = await session.get(AllowedAdvertiser, (slot.owner, creative.advertiser))
    return bool(allowed and allowed.allowed)


async def is_serveable(session: AsyncSession, slot: Slot, lease: Lease) -> bool:
    mode = lease.approval_mode if lease.approval_mode is not None else APPROVAL_MODE_REQUIRED
    return await is_creative_serveable(session, slot, lease.creative_id, mode)


@dataclass
class ServeResult:
    response: ServeResponse
    slot: Slot | None
    lease: Lease | None  # served lease, else None
    campaign: Campaign | None = None
    gsp_cpc: int | None = None


async def house_or_empty(session: AsyncSession, slot: Slot, ctx: ServeContext) -> ServeResult:
    """PROTOCOL 7.3 fallback: the publisher's house ad if configured, else "empty"."""
    house = await session.get(HouseAd, slot.slot_id)
    if house is not None:
        response = ServeResponse(
            slot_id=str(slot.slot_id),
            status="house",
            creative=ServeCreative(
                media_url=house.media_url,
                click_url=house.click_url,
                width=slot.width,
                height=slot.height,
                alt="",
            ),
            ttl=ctx.ttl,
        )
        return ServeResult(response, slot, None)
    return ServeResult(
        ServeResponse(slot_id=str(slot.slot_id), status="empty", ttl=ctx.ttl), slot, None
    )


async def _eligible_campaigns(
    session: AsyncSession, slot: Slot, terms: Terms, now: int
) -> list[Campaign]:
    floor = terms.floor_cpc
    rows = (
        (
            await session.execute(
                select(Campaign).where(
                    Campaign.slot_id == slot.slot_id,
                    Campaign.closed.is_(False),
                    Campaign.paused.is_(False),
                    Campaign.close_after == 0,
                    Campaign.remaining >= floor,
                )
            )
        )
        .scalars()
        .all()
    )
    out: list[Campaign] = []
    for camp in rows:
        if camp.valid_from != 0 and camp.valid_from > now:
            continue
        if camp.valid_until != 0 and camp.valid_until <= now:
            continue
        if await is_creative_serveable(session, slot, camp.creative_id, terms.approval_mode):
            out.append(camp)
    out.sort(key=lambda c: (-c.max_cpc, c.campaign_id))
    return out


async def resolve_cpc(
    session: AsyncSession, slot: Slot, terms: Terms, now: int, ctx: ServeContext
) -> ServeResult:
    """PROTOCOL §11.4. clickUrl is filled by the HTTP layer after the serve_event id exists."""
    if terms.paused:
        return await house_or_empty(session, slot, ctx)
    eligible = await _eligible_campaigns(session, slot, terms, now)
    winner: Campaign | None = None
    gsp = 0
    while eligible:
        cand = eligible[0]
        runner = eligible[1] if len(eligible) > 1 else None
        charge = gsp_charge(cand.max_cpc, terms.floor_cpc, runner.max_cpc if runner else None)
        if cand.remaining >= charge:
            winner = cand
            gsp = charge
            break
        eligible = eligible[1:]
    if winner is None:
        return await house_or_empty(session, slot, ctx)
    creative = await session.get(Creative, winner.creative_id)
    assert creative is not None
    version = creative.content_hash or str(creative.creative_id)
    response = ServeResponse(
        slot_id=str(slot.slot_id),
        status="campaign",
        creative=ServeCreative(
            media_url=f"{ctx.public_url}/v1/serve/{slot.slot_id}/media?v={version}",
            click_url="",
            width=slot.width,
            height=slot.height,
        ),
        campaign=ServeCampaign(advertiser=creative.advertiser, campaign_id=str(winner.campaign_id)),
        ttl=ctx.ttl,
    )
    return ServeResult(response, slot, None, campaign=winner, gsp_cpc=gsp)


async def resolve(session: AsyncSession, slot_id: int, now: int, ctx: ServeContext) -> ServeResult:
    slot = await session.get(Slot, slot_id)
    if slot is None:
        return ServeResult(
            ServeResponse(slot_id=str(slot_id), status="unknown", ttl=ctx.ttl), None, None
        )

    terms = await session.get(Terms, slot_id)
    if terms is not None and terms.sale_mode == SALE_CPC:
        return await resolve_cpc(session, slot, terms, now, ctx)

    lease = await current_lease(session, slot, now)
    if lease is not None and await is_serveable(session, slot, lease):
        creative = await session.get(Creative, lease.creative_id)
        assert creative is not None
        version = creative.content_hash or str(creative.creative_id)
        response = ServeResponse(
            slot_id=str(slot_id),
            status="lease",
            creative=ServeCreative(
                media_url=f"{ctx.public_url}/v1/serve/{slot_id}/media?v={version}",
                click_url=creative.click_url,
                width=slot.width,
                height=slot.height,
            ),
            lease=ServeLease(advertiser=creative.advertiser, expires_at=_iso(lease.end)),
            ttl=ctx.ttl,
        )
        return ServeResult(response, slot, lease)

    return await house_or_empty(session, slot, ctx)


async def record_serve(
    session: AsyncSession,
    response: ServeResponse,
    *,
    now: int,
    origin_ok: bool,
    lease: Lease | None = None,
    campaign: Campaign | None = None,
    gsp_cpc: int | None = None,
) -> ServeEvent | None:
    """Append a delivery event. Contains no visitor data by design."""
    if response.status == "unknown":
        return None
    row = ServeEvent(
        slot_id=int(response.slot_id),
        lease_calendar_version=lease.calendar_version if lease else None,
        lease_period_index=lease.period_index if lease else None,
        campaign_id=campaign.campaign_id if campaign else None,
        served_kind=response.status,
        origin_ok=origin_ok,
        gsp_cpc=gsp_cpc,
        at=now,
    )
    session.add(row)
    await session.flush()
    await session.commit()
    return row
