"""Slot read models (public API). ROADMAP 2.6 extends with periods and quotes."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from openad.errors import NotFoundError
from openad.models import Slot, Terms
from openad.schemas.slot import SlotListOut, SlotOut, TermsOut


def _to_out(slot: Slot, terms: Terms | None) -> SlotOut:
    return SlotOut(
        slot_id=str(slot.slot_id),
        owner=slot.owner,
        width=slot.width,
        height=slot.height,
        kind=slot.kind,
        domain=slot.domain,
        calendar_version=slot.calendar_version,
        period_seconds=slot.period_seconds,
        first_period_start=slot.first_period_start,
        terms=(
            TermsOut(
                start_price=str(terms.start_price),
                floor_price=str(terms.floor_price),
                lead_seconds=terms.lead_seconds,
                sale_end=terms.sale_end,
                approval_mode=terms.approval_mode,
                paused=terms.paused,
            )
            if terms
            else None
        ),
    )


async def get_slot(session: AsyncSession, slot_id: int) -> SlotOut:
    slot = await session.get(Slot, slot_id)
    if slot is None:
        raise NotFoundError(f"slot {slot_id} not found")
    terms = await session.get(Terms, slot_id)
    return _to_out(slot, terms)


async def list_slots(
    session: AsyncSession,
    *,
    domain: str | None = None,
    kind: int | None = None,
    limit: int = 50,
    offset: int = 0,
) -> SlotListOut:
    stmt = select(Slot, Terms).outerjoin(Terms, Terms.slot_id == Slot.slot_id)
    count_stmt = select(func.count()).select_from(Slot)
    if domain:
        stmt = stmt.where(Slot.domain == domain.lower())
        count_stmt = count_stmt.where(Slot.domain == domain.lower())
    if kind is not None:
        stmt = stmt.where(Slot.kind == kind)
        count_stmt = count_stmt.where(Slot.kind == kind)
    stmt = stmt.order_by(Slot.slot_id).limit(limit).offset(offset)

    rows = (await session.execute(stmt)).all()
    total = (await session.execute(count_stmt)).scalar_one()
    return SlotListOut(items=[_to_out(s, t) for s, t in rows], total=total)
