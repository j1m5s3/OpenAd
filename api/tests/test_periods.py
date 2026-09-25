from __future__ import annotations

import re
import time
from typing import Any

import pytest
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession

from openad.db.session import Database
from openad.errors import InvalidWindowError
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
    db: Database, session: AsyncSession
) -> None:
    """The batched lease read (threat model T19) must not regress into one query per index, and
    each of its three filters — slot_id, calendar_version, the period_index BETWEEN bound — must
    still apply. Three stray leases each slip through if exactly one filter is dropped: a stale
    calendar version, a different slot, and an index just past the window.

    Dropping the slot_id or calendar_version filter surfaces as a wrong lease in the output
    below. Dropping BETWEEN does not: the output loop only ever looks up keys 0..59 regardless of
    what the query fetched, so the index-60 lease can never appear there even unfiltered. (The
    session's identity map can't help either — it holds only weak references, and nothing
    outside this function keeps the loaded ``Lease`` rows alive once ``list_periods`` returns, so
    by the time a test could inspect it the rows are already gone.) So the compiled query itself
    is pinned instead: its WHERE clause text and its four bound values.
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

    executed: list[tuple[str, Any]] = []

    def record(_conn: Any, _cursor: Any, statement: str, parameters: Any, *_: Any) -> None:
        executed.append((" ".join(statement.split()), parameters))

    engine = db.engine.sync_engine
    event.listen(engine, "before_cursor_execute", record)
    try:
        out = await periods_service.list_periods(
            session, slot.slot_id, from_index=0, to_index=59, now=int(time.time())
        )
    finally:
        event.remove(engine, "before_cursor_execute", record)

    assert len(out.items) == 60
    # Only the in-window lease on this slot, in this calendar version, is reported — not the
    # stale-calendar-version lease (index 10) and not the other slot's lease (index 20). This
    # alone fails if the slot_id or the calendar_version filter is dropped.
    leased = [item for item in out.items if item.leased]
    assert [item.period_index for item in leased] == ["55"]
    assert leased[0].lessee == ADVERTISER
    assert leased[0].creative_id == "7"

    # Exactly one query touches `leases` — not one `session.get(Lease, ...)` per index — and its
    # WHERE clause carries all three filters, bound to the actual slot, calendar version and
    # window. This is what fails if BETWEEN is dropped (the output assertions above would not).
    lease_queries = [(sql, params) for sql, params in executed if "leases" in sql.lower()]
    assert len(lease_queries) == 1, executed
    sql, params = lease_queries[0]
    assert re.search(
        r"WHERE leases\.slot_id = \? AND leases\.calendar_version = \? "
        r"AND leases\.period_index BETWEEN \? AND \?",
        sql,
    ), sql
    assert int(params[0]) == slot.slot_id
    assert params[1] == slot.calendar_version
    assert int(params[2]) == 0
    assert int(params[3]) == 59
