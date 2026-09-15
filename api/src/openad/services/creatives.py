"""Public creative + dashboard read models."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from openad.errors import ForbiddenError, NotFoundError
from openad.models import (
    Approval,
    Campaign,
    CampaignSettlement,
    Creative,
    CreativeVerification,
    Lease,
    ServeEvent,
    Slot,
    Terms,
)
from openad.schemas.creative import CreativeOut
from openad.schemas.dashboard import (
    AdvertiserOut,
    ApprovalOut,
    CampaignOut,
    CampaignSettleOut,
    PublisherOut,
    ServeCountOut,
)
from openad.services.indexed import protocol_indexed_block


async def get_creative(session: AsyncSession, creative_id: int) -> CreativeOut:
    c = await session.get(Creative, creative_id)
    if c is None:
        raise NotFoundError(f"creative {creative_id} not found")
    v = await session.get(CreativeVerification, creative_id)
    return CreativeOut(
        creative_id=str(c.creative_id),
        advertiser=c.advertiser,
        kind=c.kind,
        uri=c.uri,
        content_hash=c.content_hash,
        mime=c.mime,
        width=c.width,
        height=c.height,
        click_url=c.click_url,
        revoked=c.revoked,
        verification_status=v.status if v else "pending",
        verification_error=v.error if v else None,
    )


async def require_advertiser(session: AsyncSession, creative_id: int, address: str) -> Creative:
    creative = await session.get(Creative, creative_id)
    if creative is None:
        raise NotFoundError(f"creative {creative_id} not found")
    if creative.advertiser != address.lower():
        raise ForbiddenError("wallet is not the creative owner")
    return creative


async def publisher_dashboard(session: AsyncSession, address: str) -> PublisherOut:
    addr = address.lower()
    head = await protocol_indexed_block(session)
    slot_stmt = select(Slot).where(Slot.owner == addr)
    if head is not None:
        slot_stmt = slot_stmt.where(Slot.updated_block <= head)
    slots = (await session.execute(slot_stmt)).scalars().all()
    approvals = (
        (await session.execute(select(Approval).where(Approval.publisher == addr))).scalars().all()
    )
    earnings = 0
    for slot in slots:
        leases = (
            (await session.execute(select(Lease).where(Lease.slot_id == slot.slot_id)))
            .scalars()
            .all()
        )
        earnings += sum(int(row.price or 0) - int(row.fee or 0) for row in leases)
        settles = (
            (
                await session.execute(
                    select(CampaignSettlement).where(CampaignSettlement.slot_id == slot.slot_id)
                )
            )
            .scalars()
            .all()
        )
        earnings += sum(int(row.charged) - int(row.fee) for row in settles)
    return PublisherOut(
        address=addr,
        slot_ids=[str(s.slot_id) for s in slots],
        pending_approvals=sum(1 for a in approvals if a.status == 1),
        earnings_usdc=str(earnings),
    )


async def list_approvals(session: AsyncSession, address: str) -> list[ApprovalOut]:
    addr = address.lower()
    rows = (
        (await session.execute(select(Approval).where(Approval.publisher == addr))).scalars().all()
    )
    items: list[ApprovalOut] = []
    for row in rows:
        creative = await session.get(Creative, row.creative_id)
        items.append(
            ApprovalOut(
                publisher=row.publisher,
                creative_id=str(row.creative_id),
                status=row.status,
                advertiser=creative.advertiser if creative else None,
            )
        )
    return items


async def advertiser_dashboard(session: AsyncSession, address: str) -> AdvertiserOut:
    addr = address.lower()
    head = await protocol_indexed_block(session)
    creative_stmt = select(Creative).where(Creative.advertiser == addr)
    if head is not None:
        creative_stmt = creative_stmt.where(Creative.updated_block <= head)
    creatives = (await session.execute(creative_stmt)).scalars().all()
    lease_stmt = select(Lease).where(Lease.user == addr)
    if head is not None:
        lease_stmt = lease_stmt.where(Lease.block_number <= head)
    leases = (await session.execute(lease_stmt)).scalars().all()
    counts: list[ServeCountOut] = []
    for lease in leases:
        n = (
            await session.execute(
                select(func.count())
                .select_from(ServeEvent)
                .where(
                    ServeEvent.slot_id == lease.slot_id,
                    ServeEvent.lease_period_index == lease.period_index,
                    ServeEvent.served_kind == "lease",
                )
            )
        ).scalar_one()
        counts.append(
            ServeCountOut(
                slot_id=str(lease.slot_id),
                period_index=str(lease.period_index),
                serves=int(n),
            )
        )
    camp_stmt = select(Campaign).where(Campaign.advertiser == addr)
    if head is not None:
        camp_stmt = camp_stmt.where(Campaign.updated_block <= head)
    camps = (await session.execute(camp_stmt)).scalars().all()
    campaign_out: list[CampaignOut] = []
    for camp in camps:
        n = (
            await session.execute(
                select(func.count())
                .select_from(ServeEvent)
                .where(
                    ServeEvent.campaign_id == camp.campaign_id,
                    ServeEvent.served_kind == "campaign",
                )
            )
        ).scalar_one()
        settles = (
            (
                await session.execute(
                    select(CampaignSettlement).where(
                        CampaignSettlement.campaign_id == camp.campaign_id
                    )
                )
            )
            .scalars()
            .all()
        )
        campaign_out.append(
            CampaignOut(
                campaign_id=str(camp.campaign_id),
                slot_id=str(camp.slot_id),
                creative_id=str(camp.creative_id),
                max_cpc=str(camp.max_cpc),
                remaining=str(camp.remaining),
                budget=str(camp.budget),
                paused=camp.paused,
                closed=camp.closed,
                close_after=camp.close_after,
                serves=int(n),
                settlements=[
                    CampaignSettleOut(
                        batch_id=row.batch_id,
                        charged=str(row.charged),
                        fee=str(row.fee),
                        payable_clicks=row.payable_clicks,
                        slot_id=str(row.slot_id),
                    )
                    for row in settles
                ],
            )
        )
    return AdvertiserOut(
        address=addr,
        creative_ids=[str(c.creative_id) for c in creatives],
        lease_count=len(leases),
        delivery=counts,
        campaigns=campaign_out,
    )


async def suggest_prices(session: AsyncSession, slot_id: int, now: int) -> dict[str, str]:
    """Publisher-side autopilot hint (ROADMAP 4.2). Never writes the chain."""
    terms = await session.get(Terms, slot_id)
    if terms is None:
        raise NotFoundError(f"no terms for slot {slot_id}")
    leases = (await session.execute(select(Lease).where(Lease.slot_id == slot_id))).scalars().all()
    sold = [row for row in leases if row.price]
    avg = sum(int(row.price or 0) for row in sold) // len(sold) if sold else terms.start_price
    fill = len(sold)
    suggested_start = max(avg, terms.floor_price)
    suggested_floor = min(terms.floor_price, suggested_start)
    return {
        "suggestedStartPrice": str(suggested_start),
        "suggestedFloorPrice": str(suggested_floor),
        "soldPeriods": str(fill),
        "asOf": str(now),
    }
