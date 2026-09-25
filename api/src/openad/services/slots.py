"""Slot read models (public API). ROADMAP 2.6 extends with periods and quotes."""

from __future__ import annotations

from sqlalchemy import func, literal, select
from sqlalchemy.ext.asyncio import AsyncSession

from openad.errors import NotFoundError
from openad.listing_taxonomy import Category
from openad.models import Slot, SlotListing, Terms
from openad.schemas.slot import SlotListingOut, SlotListOut, SlotOut, TermsOut
from openad.services.indexed import protocol_indexed_block


def listing_to_out(listing: SlotListing | None) -> SlotListingOut | None:
    if listing is None:
        return None
    categories = listing.categories.split(",") if listing.categories else []
    return SlotListingOut(
        slot_id=str(listing.slot_id),
        summary=listing.summary,
        audience=listing.audience,
        categories=categories,
        updated_at=int(listing.updated_at.timestamp()),
    )


def _to_out(slot: Slot, terms: Terms | None, listing: SlotListing | None = None) -> SlotOut:
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
                sale_mode=terms.sale_mode,
                floor_cpc=str(terms.floor_cpc),
                paused=terms.paused,
            )
            if terms
            else None
        ),
        listing=listing_to_out(listing),
    )


async def get_slot(session: AsyncSession, slot_id: int) -> SlotOut:
    slot = await session.get(Slot, slot_id)
    if slot is None:
        raise NotFoundError(f"slot {slot_id} not found")
    terms = await session.get(Terms, slot_id)
    listing = await session.get(SlotListing, slot_id)
    return _to_out(slot, terms, listing)


async def list_slots(
    session: AsyncSession,
    *,
    domain: str | None = None,
    kind: int | None = None,
    category: Category | None = None,
    limit: int = 50,
    offset: int = 0,
) -> SlotListOut:
    stmt = (
        select(Slot, Terms, SlotListing)
        .outerjoin(Terms, Terms.slot_id == Slot.slot_id)
        .outerjoin(SlotListing, SlotListing.slot_id == Slot.slot_id)
    )
    count_stmt = select(func.count()).select_from(Slot)
    if category is not None:
        # Portable across SQLite and Postgres (both support `||`). Wrapping in commas before the
        # LIKE keeps a prefix like "defi" from matching "defi-x" (see SlotListing.categories).
        wrapped = literal(",").concat(SlotListing.categories).concat(literal(","))
        category_filter = wrapped.like(f"%,{category},%")
        stmt = stmt.where(category_filter)
        count_stmt = count_stmt.outerjoin(SlotListing, SlotListing.slot_id == Slot.slot_id)
        count_stmt = count_stmt.where(category_filter)
    head = await protocol_indexed_block(session)
    if head is not None:
        stmt = stmt.where(Slot.updated_block <= head)
        count_stmt = count_stmt.where(Slot.updated_block <= head)
    if domain:
        stmt = stmt.where(Slot.domain == domain.lower())
        count_stmt = count_stmt.where(Slot.domain == domain.lower())
    if kind is not None:
        stmt = stmt.where(Slot.kind == kind)
        count_stmt = count_stmt.where(Slot.kind == kind)
    stmt = stmt.order_by(Slot.slot_id).limit(limit).offset(offset)

    rows = (await session.execute(stmt)).all()
    total = (await session.execute(count_stmt)).scalar_one()
    return SlotListOut(items=[_to_out(s, t, listing) for s, t, listing in rows], total=total)
