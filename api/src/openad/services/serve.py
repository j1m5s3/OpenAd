"""Creative resolution for a slot — the normative serving rule (docs/PROTOCOL.md section 7).

Reads ONLY indexed state. Never calls the chain.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from openad.models import (
    AllowedAdvertiser,
    Approval,
    Creative,
    CreativeVerification,
    HouseAd,
    Lease,
    ServeEvent,
    Slot,
)
from openad.models.creative import APPROVAL_APPROVED, APPROVAL_REJECTED, APPROVAL_REVOKED
from openad.models.offchain import VERIFY_VERIFIED
from openad.schemas.serve import ServeCreative, ServeLease, ServeResponse

APPROVAL_MODE_REQUIRED = 0
APPROVAL_MODE_WAIVED = 1


@dataclass(frozen=True)
class ServeContext:
    public_url: str
    ttl: int


def _iso(ts: int) -> str:
    return datetime.fromtimestamp(ts, tz=UTC).isoformat().replace("+00:00", "Z")


async def current_lease(session: AsyncSession, slot: Slot, now: int) -> Lease | None:
    idx = slot.current_period_index(now)
    if idx is None:
        return None
    return await session.get(Lease, (slot.slot_id, slot.calendar_version, idx))


async def is_serveable(session: AsyncSession, slot: Slot, lease: Lease) -> bool:
    """PROTOCOL 7.2: verified, active, not blocked for the current owner, approved if REQUIRED."""
    creative = await session.get(Creative, lease.creative_id)
    if creative is None or creative.revoked:
        return False

    verification = await session.get(CreativeVerification, lease.creative_id)
    if verification is None or verification.status != VERIFY_VERIFIED:
        return False

    approval = await session.get(Approval, (slot.owner, lease.creative_id))
    status = approval.status if approval else None
    if status in (APPROVAL_REJECTED, APPROVAL_REVOKED):
        return False

    if lease.approval_mode == APPROVAL_MODE_WAIVED:
        return True

    if status == APPROVAL_APPROVED:
        return True
    allowed = await session.get(AllowedAdvertiser, (slot.owner, creative.advertiser))
    return bool(allowed and allowed.allowed)


@dataclass(frozen=True)
class ServeResult:
    response: ServeResponse
    slot: Slot | None
    lease: Lease | None  # the lease being served (status == "lease"), else None


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


async def resolve(session: AsyncSession, slot_id: int, now: int, ctx: ServeContext) -> ServeResult:
    slot = await session.get(Slot, slot_id)
    if slot is None:
        return ServeResult(
            ServeResponse(slot_id=str(slot_id), status="unknown", ttl=ctx.ttl), None, None
        )

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
) -> None:
    """Append a delivery event. Contains no visitor data by design."""
    if response.status == "unknown":
        return
    session.add(
        ServeEvent(
            slot_id=int(response.slot_id),
            lease_calendar_version=lease.calendar_version if lease else None,
            lease_period_index=lease.period_index if lease else None,
            served_kind=response.status,
            origin_ok=origin_ok,
            at=now,
        )
    )
    await session.commit()
