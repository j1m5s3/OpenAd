"""Period calendar + indicative Dutch / remainder price.

Live quote still happens in the browser.
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from openad.errors import NotFoundError
from openad.models import Lease, Slot, Terms
from openad.schemas.slot import PeriodListOut, PeriodOut


def dutch_price(terms: Terms, start: int, end: int, now: int) -> tuple[bool, str, int]:
    open_at = start - terms.lead_seconds if start > terms.lead_seconds else 0
    if now < open_at:
        return False, "not open", 0
    if now >= end:
        return False, "closed", 0
    if now < start:
        duration = start - open_at
        delta = terms.start_price - terms.floor_price
        remaining = start - now
        price = terms.floor_price + delta * remaining // duration
        return True, "", price
    period = end - start
    price = terms.floor_price * (end - now) // period if period else 0
    return True, "remainder", price


async def list_periods(
    session: AsyncSession,
    slot_id: int,
    *,
    from_index: int,
    to_index: int,
    now: int,
) -> PeriodListOut:
    slot = await session.get(Slot, slot_id)
    if slot is None:
        raise NotFoundError(f"slot {slot_id} not found")
    terms = await session.get(Terms, slot_id)
    items: list[PeriodOut] = []
    if slot.calendar_version == 0 or slot.period_seconds is None:
        return PeriodListOut(items=items)
    for idx in range(from_index, to_index + 1):
        start, end = slot.period_window(idx)
        lease = await session.get(Lease, (slot.slot_id, slot.calendar_version, idx))
        sellable, reason, price = (False, "no terms", 0)
        if terms is not None and terms.lead_seconds > 0:
            if terms.paused:
                sellable, reason, price = False, "paused", 0
            elif terms.sale_end != 0 and end > terms.sale_end:
                sellable, reason, price = False, "beyond sale end", 0
            elif lease is not None:
                sellable, reason, price = False, "already leased", 0
            else:
                sellable, reason, price = dutch_price(terms, start, end, now)
        items.append(
            PeriodOut(
                period_index=str(idx),
                start=start,
                end=end,
                leased=lease is not None,
                lessee=lease.user if lease else None,
                creative_id=str(lease.creative_id) if lease else None,
                sellable=sellable,
                reason=reason,
                indicative_price=str(price),
            )
        )
    return PeriodListOut(items=items)
