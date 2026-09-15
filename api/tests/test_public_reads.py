"""Public read models (ROADMAP 2.6)."""

from __future__ import annotations

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

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
