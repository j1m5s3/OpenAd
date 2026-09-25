from __future__ import annotations

import time
from typing import Any

import pytest
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession

from openad.db.session import Database
from openad.errors import InvalidWindowError
from openad.services import periods as periods_service
from openad.services.periods import dutch_price
from tests.conftest import ADVERTISER, make_lease, make_slot, make_terms


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
    db: Database, session: AsyncSession
) -> None:
    """The batched lease read (item 2) must not regress into one query per index."""
    slot = make_slot()
    session.add_all([slot, make_terms(), make_lease(slot, 55)])
    await session.commit()
    session.expunge_all()  # force the service to actually query, not read the identity map

    executed: list[str] = []

    def record(_conn: Any, _cursor: Any, statement: str, _parameters: Any, *_: Any) -> None:
        executed.append(" ".join(statement.split()))

    engine = db.engine.sync_engine
    event.listen(engine, "before_cursor_execute", record)
    try:
        out = await periods_service.list_periods(
            session, slot.slot_id, from_index=0, to_index=59, now=int(time.time())
        )
    finally:
        event.remove(engine, "before_cursor_execute", record)

    assert len(out.items) == 60
    leased = [item for item in out.items if item.leased]
    assert [item.period_index for item in leased] == ["55"]
    assert leased[0].lessee == ADVERTISER
    assert leased[0].creative_id == "7"

    # One SELECT over the whole range, not one `session.get(Lease, ...)` per index.
    lease_queries = [sql for sql in executed if "leases" in sql.lower()]
    assert len(lease_queries) == 1, executed
