"""Public read models (ROADMAP 2.6)."""

from __future__ import annotations

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from openad.db.types import UINT256_MAX
from tests.conftest import (
    ADVERTISER,
    PUBLISHER,
    make_creative,
    make_lease,
    make_slot,
    make_terms,
    make_verified,
)


async def test_slot_periods_and_creative(client: AsyncClient, session: AsyncSession) -> None:
    slot = make_slot()
    session.add_all(
        [slot, make_terms(), make_creative(), make_verified(), make_lease(slot, 0, approval_mode=1)]
    )
    await session.commit()

    slots = await client.get("/v1/slots")
    assert slots.status_code == 200
    assert slots.json()["total"] >= 1

    detail = await client.get("/v1/slots/1")
    assert detail.status_code == 200
    assert detail.json()["domain"] == "example.com"

    periods = await client.get("/v1/slots/1/periods?from=0&to=0")
    assert periods.status_code == 200
    item = periods.json()["items"][0]
    assert item["leased"] is True
    assert item["lessee"] == ADVERTISER

    creative = await client.get("/v1/creatives/7")
    assert creative.status_code == 200
    assert creative.json()["advertiser"] == ADVERTISER
    assert creative.json()["verificationStatus"] == "verified"

    pub = await client.get(f"/v1/publishers/{PUBLISHER}")
    assert pub.status_code == 200
    assert "1" in pub.json()["slotIds"]

    approvals = await client.get(f"/v1/publishers/{PUBLISHER}/approvals")
    assert approvals.status_code == 200

    adv = await client.get(f"/v1/advertisers/{ADVERTISER}")
    assert adv.status_code == 200
    assert adv.json()["leaseCount"] == 1


async def test_slot_periods_range_is_capped_at_60(
    client: AsyncClient, session: AsyncSession
) -> None:
    session.add_all([make_slot(), make_terms()])
    await session.commit()

    exactly_60 = await client.get("/v1/slots/1/periods?from=0&to=59")
    assert exactly_60.status_code == 200
    assert len(exactly_60.json()["items"]) == 60

    too_wide = await client.get("/v1/slots/1/periods?from=0&to=60")
    assert too_wide.status_code == 422
    assert too_wide.json()["error"] == "invalid_window"


async def test_slot_periods_from_and_to_are_each_bounded_to_uint256_max(
    client: AsyncClient, session: AsyncSession
) -> None:
    """A width of 1 or 2 slips past the range cap, so `from` and `to` must each be bounded to a
    valid uint256 on their own — otherwise the Uint256 bind raises and the request 500s instead
    of 422. Sending both out of range at once would pass even if only one had a bound, so `from`
    and `to` are each pushed out of range independently; the boundary value itself
    (`UINT256_MAX`, for both) must still be accepted.
    """
    session.add_all([make_slot(), make_terms()])
    await session.commit()

    from_out_of_range = await client.get(f"/v1/slots/1/periods?from={UINT256_MAX + 1}")
    assert from_out_of_range.status_code == 422

    to_out_of_range = await client.get(
        f"/v1/slots/1/periods?from={UINT256_MAX}&to={UINT256_MAX + 1}"
    )
    assert to_out_of_range.status_code == 422

    at_the_boundary = await client.get(f"/v1/slots/1/periods?from={UINT256_MAX}&to={UINT256_MAX}")
    assert at_the_boundary.status_code == 200
    assert len(at_the_boundary.json()["items"]) == 1
