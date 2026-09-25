from __future__ import annotations

import time
from typing import Any

import pytest
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession

from openad.errors import InvalidWindowError
from openad.models import Lease
from openad.services import periods as periods_service
from openad.services.periods import dutch_price
from tests.conftest import ADVERTISER, PUBLISHER, make_lease, make_slot, make_terms


def test_dutch_and_remainder_prices() -> None:
    terms = make_terms(lead_seconds=100, start_price=100, floor_price=10)
    start, end = 1_000, 2_000
    sellable, reason, price = dutch_price(terms, start, end, now=900)
    assert sellable and reason == "" and price == 100
    sellable, reason, price = dutch_price(terms, start, end, now=1_000)
    assert sellable and reason == "remainder" and price == 10
    sellable, reason, price = dutch_price(terms, start, end, now=1_500)
    assert sellable and reason == "remainder" and price == 5
    sellable, reason, price = dutch_price(terms, start, end, now=2_000)
    assert not sellable and reason == "closed"


# ----------------------------------------------------------------------- range cap (T19)


async def test_list_periods_accepts_exactly_60_periods(session: AsyncSession) -> None:
    slot = make_slot()
    session.add_all([slot, make_terms()])
    await session.commit()

    out = await periods_service.list_periods(
        session, slot.slot_id, from_index=0, to_index=59, now=int(time.time())
    )
    assert len(out.items) == 60


async def test_list_periods_rejects_a_wider_window(session: AsyncSession) -> None:
    slot = make_slot()
    session.add_all([slot, make_terms()])
    await session.commit()

    with pytest.raises(InvalidWindowError):
        await periods_service.list_periods(
            session, slot.slot_id, from_index=0, to_index=60, now=int(time.time())
        )


async def test_list_periods_reports_leases_across_a_wide_window_in_one_query(
    session: AsyncSession,
) -> None:
    """The batched lease read (threat model T19) must not regress into one query per index, and
    each of its three filters — slot_id, calendar_version, the period_index BETWEEN bound — must
    still apply. Three stray leases each slip through if exactly one filter is dropped: a stale
    calendar version, a different slot, and an index just past the window. An ORM ``load``
    listener on ``Lease`` records every row the query actually materializes, so the assertion is
    on what was read from the database, not on the compiled SQL text — a harmless rewrite of the
    same filters (``>=``/``<=`` instead of ``BETWEEN``, a different filter order) still passes.
    """
    slot = make_slot()
    other_slot = make_slot(slot_id=2, domain="other.example")
    stale_calendar_lease = make_lease(slot, 10, user=PUBLISHER, creative_id=90)
    stale_calendar_lease.calendar_version = slot.calendar_version + 1
    session.add_all(
        [
            slot,
            other_slot,
            make_terms(),
            make_lease(slot, 55),  # the one lease that should be reported
            stale_calendar_lease,  # same slot, wrong calendar_version, index inside the window
            make_lease(other_slot, 20, user=PUBLISHER, creative_id=91),  # a different slot
            make_lease(slot, 60, user=PUBLISHER, creative_id=92),  # same slot+calendar, index 60
        ]
    )
    await session.commit()
    session.expunge_all()  # force the service to actually query, not read the identity map

    loaded: list[tuple[int, int, int]] = []

    def on_load(lease: Lease, _context: Any) -> None:
        loaded.append((lease.slot_id, lease.calendar_version, lease.period_index))

    event.listen(Lease, "load", on_load)
    try:
        out = await periods_service.list_periods(
            session, slot.slot_id, from_index=0, to_index=59, now=int(time.time())
        )
    finally:
        event.remove(Lease, "load", on_load)

    assert len(out.items) == 60
    # Only the in-window lease on this slot, in this calendar version, is reported — not the
    # stale-calendar-version lease (index 10) and not the other slot's lease (index 20).
    leased = [item for item in out.items if item.leased]
    assert [item.period_index for item in leased] == ["55"]
    assert leased[0].lessee == ADVERTISER
    assert leased[0].creative_id == "7"

    # And it is never even read from the database in the first place: only the one lease that
    # matches all three filters — this slot, this calendar version, inside 0..59 — is loaded.
    # Unlike the output above, this also catches a dropped BETWEEN (index 60 would load, even
    # though the output loop above would never look it up).
    assert loaded == [(slot.slot_id, slot.calendar_version, 55)]
