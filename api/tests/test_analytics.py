"""Analytics read model (ROADMAP 6.4). Pins the metric definitions in ARCHITECTURE.md §3.x."""

from __future__ import annotations

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from openad.models import CampaignSettlement, ClickEvent, ServeEvent
from tests.conftest import (
    ADVERTISER,
    PUBLISHER,
    make_campaign,
    make_creative,
    make_lease,
    make_slot,
    make_terms,
    make_verified,
)

DAY = 86_400
T0 = 1_700_000_000 - (1_700_000_000 % DAY)  # aligned to a UTC day boundary


def serve_event(
    *,
    slot_id: int = 1,
    served_kind: str = "lease",
    lease_period_index: int | None = None,
    lease_calendar_version: int | None = None,
    campaign_id: int | None = None,
    origin_ok: bool = True,
    gsp_cpc: int | None = None,
    at: int = T0,
) -> ServeEvent:
    default_version = 1 if lease_period_index is not None else None
    return ServeEvent(
        slot_id=slot_id,
        lease_calendar_version=(
            lease_calendar_version if lease_calendar_version is not None else default_version
        ),
        lease_period_index=lease_period_index,
        campaign_id=campaign_id,
        served_kind=served_kind,
        origin_ok=origin_ok,
        gsp_cpc=gsp_cpc,
        at=at,
    )


def click_event(
    *,
    id_: int,
    slot_id: int = 1,
    campaign_id: int = 1,
    creative_id: int = 7,
    payable: bool = True,
    ivt_reason: str | None = None,
    gsp_cpc: int = 0,
    at: int = T0,
) -> ClickEvent:
    return ClickEvent(
        token_hash=f"hash-{id_}",
        slot_id=slot_id,
        campaign_id=campaign_id,
        creative_id=creative_id,
        serve_event_id=None,
        payable=payable,
        ivt_reason=ivt_reason,
        gsp_cpc=gsp_cpc,
        at=at,
    )


def settlement(
    *,
    batch_id: str,
    campaign_id: int = 1,
    slot_id: int = 1,
    charged: int = 1_000_000,
    fee: int = 25_000,
    payable_clicks: int = 5,
) -> CampaignSettlement:
    return CampaignSettlement(
        batch_id=batch_id,
        campaign_id=campaign_id,
        slot_id=slot_id,
        publisher=PUBLISHER,
        payable_clicks=payable_clicks,
        charged=charged,
        fee=fee,
        tx_hash="0x" + "dd" * 32,
        block_number=3,
    )


async def _seed_base(session: AsyncSession) -> None:
    slot = make_slot()
    session.add_all([slot, make_terms(), make_creative(), make_verified()])
    await session.commit()


async def test_impressions_exclude_house_empty_and_invalid_origin(
    client: AsyncClient, session: AsyncSession
) -> None:
    await _seed_base(session)
    session.add_all(
        [
            serve_event(served_kind="lease", lease_period_index=0, at=T0),
            serve_event(served_kind="lease", lease_period_index=0, at=T0 + 1),
            serve_event(served_kind="house", at=T0),
            serve_event(served_kind="empty", at=T0),
            serve_event(served_kind="lease", lease_period_index=0, origin_ok=False, at=T0),
        ]
    )
    await session.commit()

    resp = await client.get(f"/v1/analytics/slots/1?from={T0 - DAY}&to={T0 + DAY}")
    assert resp.status_code == 200
    totals = resp.json()["totals"]
    assert totals["impressions"] == 2
    assert totals["houseServes"] == 1
    assert totals["invalidOriginServes"] == 1


async def test_ctr_bps_and_ecpm_integer_floor(client: AsyncClient, session: AsyncSession) -> None:
    slot = make_slot()
    session.add_all(
        [
            slot,
            make_terms(),
            make_creative(),
            make_verified(),
            make_lease(slot, 0),
            serve_event(served_kind="lease", lease_period_index=0, at=T0),
            serve_event(served_kind="lease", lease_period_index=0, at=T0),
            serve_event(served_kind="lease", lease_period_index=0, at=T0),
        ]
    )
    await session.commit()
    lease_start, _ = slot.period_window(0)

    resp = await client.get(
        f"/v1/analytics/slots/1?from={lease_start - DAY}&to={lease_start + DAY}"
    )
    body = resp.json()
    totals = body["totals"]
    # 3 impressions, price=5_000_000 fee=125_000 -> earnings=4_875_000
    assert totals["impressions"] == 3
    assert totals["leaseEarnings"] == "4875000"
    assert totals["ecpm"] == 4_875_000 * 1000 // 3
    # no payable clicks -> ctr 0/3 = 0 bps
    assert totals["ctrBps"] == 0


async def test_zero_impressions_gives_null_ctr_and_ecpm(
    client: AsyncClient, session: AsyncSession
) -> None:
    await _seed_base(session)
    resp = await client.get(f"/v1/analytics/slots/1?from={T0 - DAY}&to={T0 + DAY}")
    totals = resp.json()["totals"]
    assert totals["ctrBps"] is None
    assert totals["ecpm"] is None


async def test_daily_buckets_zero_filled_and_ordered(
    client: AsyncClient, session: AsyncSession
) -> None:
    await _seed_base(session)
    session.add(serve_event(served_kind="lease", lease_period_index=0, at=T0))
    await session.commit()

    resp = await client.get(f"/v1/analytics/slots/1?from={T0 - 2 * DAY}&to={T0}")
    daily = resp.json()["daily"]
    assert [d["dayStart"] for d in daily] == [T0 - 2 * DAY, T0 - DAY, T0]
    assert daily[0]["impressions"] == 0
    assert daily[-1]["impressions"] == 1


async def test_day_bucket_floors_to_day_start_not_true_division(
    client: AsyncClient, session: AsyncSession
) -> None:
    """Regression: SQLAlchemy `/` is true division, so `(at / 86400) * 86400` returns `at`
    unchanged instead of the day start, scattering same-day events across mis-keyed buckets
    that never land in the zero-filled daily series. Three events land in the same UTC day at
    different offsets; all three must fold into the single `day_start = T0` bucket.
    """
    slot = make_slot(first_period_start=T0 + 3600, period_seconds=DAY)
    session.add_all(
        [
            slot,
            make_terms(),
            make_creative(),
            make_verified(),
            make_lease(slot, 0),  # period 0 starts at T0+3600, still inside the T0 UTC day
            serve_event(served_kind="lease", lease_period_index=0, at=T0 + 1),
            click_event(id_=1, campaign_id=1, payable=True, gsp_cpc=40_000, at=T0 + 50_000),
        ]
    )
    await session.commit()
    lease_start, _ = slot.period_window(0)
    assert lease_start == T0 + 3600  # matches the finding's "lease start at T0+3600"

    resp = await client.get(f"/v1/analytics/slots/1?from={T0 - DAY}&to={T0 + DAY}")
    daily = {d["dayStart"]: d for d in resp.json()["daily"]}
    assert T0 in daily
    bucket = daily[T0]
    assert bucket["impressions"] == 1
    assert bucket["leaseSpend"] == "5000000"
    assert bucket["accruedCpcSpend"] == "40000"
    # No stray bucket keyed by an un-floored timestamp.
    assert set(daily) == {T0 - DAY, T0, T0 + DAY}


async def test_window_over_90_days_gives_422(client: AsyncClient, session: AsyncSession) -> None:
    await _seed_base(session)
    resp = await client.get(f"/v1/analytics/slots/1?from={T0 - 91 * DAY}&to={T0}")
    assert resp.status_code == 422


async def test_lease_spend_fee_earnings_reconcile(
    client: AsyncClient, session: AsyncSession
) -> None:
    slot = make_slot()
    session.add_all([slot, make_terms(), make_creative(), make_verified(), make_lease(slot, 0)])
    await session.commit()
    lease_start, _ = slot.period_window(0)

    resp = await client.get(
        f"/v1/analytics/slots/1?from={lease_start - DAY}&to={lease_start + DAY}"
    )
    totals = resp.json()["totals"]
    spend = int(totals["leaseSpend"])
    fee = int(totals["leaseFee"])
    earnings = int(totals["leaseEarnings"])
    assert earnings + fee == spend
    assert spend == 5_000_000


async def test_cpc_settled_and_accrued_reported_separately(
    client: AsyncClient, session: AsyncSession
) -> None:
    await _seed_base(session)
    session.add_all(
        [
            make_campaign(slot_id=1, campaign_id=1),
            click_event(id_=1, campaign_id=1, payable=True, gsp_cpc=100_000, at=T0),
            settlement(batch_id="0x" + "aa" * 32, campaign_id=1, charged=1_000_000, fee=25_000),
        ]
    )
    await session.commit()

    resp = await client.get(f"/v1/analytics/slots/1?from={T0 - DAY}&to={T0 + DAY}")
    totals = resp.json()["totals"]
    assert totals["cpcSettledSpend"] == "1000000"
    assert totals["cpcSettledFee"] == "25000"
    assert totals["cpcSettledEarnings"] == "975000"
    assert totals["accruedCpcSpend"] == "100000"


async def test_invalid_clicks_split_by_reason(client: AsyncClient, session: AsyncSession) -> None:
    await _seed_base(session)
    session.add_all(
        [
            make_campaign(slot_id=1, campaign_id=1),
            click_event(id_=1, campaign_id=1, payable=False, ivt_reason="rate_limit", at=T0),
            click_event(id_=2, campaign_id=1, payable=False, ivt_reason="rate_limit", at=T0),
            click_event(id_=3, campaign_id=1, payable=False, ivt_reason="replay", at=T0),
            click_event(id_=4, campaign_id=1, payable=True, at=T0),
        ]
    )
    await session.commit()

    resp = await client.get(f"/v1/analytics/slots/1?from={T0 - DAY}&to={T0 + DAY}")
    totals = resp.json()["totals"]
    assert totals["clicksPayable"] == 1
    assert totals["clicksInvalid"] == 3
    assert totals["clicksInvalidByReason"] == {"rate_limit": 2, "replay": 1}


async def test_unknown_slot_gives_404(client: AsyncClient) -> None:
    resp = await client.get("/v1/analytics/slots/999")
    assert resp.status_code == 404


async def test_advertiser_scope_excludes_other_advertisers(
    client: AsyncClient, session: AsyncSession
) -> None:
    other = "0x" + "ee" * 20
    slot = make_slot()
    session.add_all(
        [
            slot,
            make_terms(),
            make_creative(),
            make_verified(),
            make_lease(slot, 0, user=ADVERTISER),
            make_lease(slot, 1, user=other, creative_id=7),
        ]
    )
    await session.commit()
    lease_start, _ = slot.period_window(0)

    resp = await client.get(
        f"/v1/analytics/advertisers/{ADVERTISER}?from={lease_start - DAY}&to={lease_start + DAY}"
    )
    assert resp.status_code == 200
    totals = resp.json()["totals"]
    assert totals["leaseSpend"] == "5000000"  # only ADVERTISER's own lease


async def test_advertiser_scope_matches_lease_by_calendar_version_too(
    client: AsyncClient, session: AsyncSession
) -> None:
    """A calendar change reuses period indices: period 0 under calendar_version=1 (ADVERTISER's
    lease) and period 0 under calendar_version=2 (a different advertiser's lease, after a
    recalendar) must not be conflated just because they share `(slot_id, period_index)`.
    """
    other = "0x" + "ee" * 20
    slot = make_slot(calendar_version=1)
    session.add_all([slot, make_terms(), make_creative(), make_verified()])
    lease_own = make_lease(slot, 0, user=ADVERTISER)  # calendar_version=1
    slot.calendar_version = 2
    lease_other = make_lease(slot, 0, user=other, creative_id=7)  # calendar_version=2
    session.add_all(
        [
            lease_own,
            lease_other,
            serve_event(served_kind="lease", lease_period_index=0, lease_calendar_version=1, at=T0),
            serve_event(served_kind="lease", lease_period_index=0, lease_calendar_version=2, at=T0),
        ]
    )
    await session.commit()

    resp = await client.get(f"/v1/analytics/advertisers/{ADVERTISER}?from={T0 - DAY}&to={T0 + DAY}")
    assert resp.status_code == 200
    totals = resp.json()["totals"]
    # Only the calendar_version=1 serve belongs to ADVERTISER's own lease.
    assert totals["impressions"] == 1
    assert totals["leaseSpend"] == "5000000"  # ADVERTISER's own lease only


async def test_by_slot_lease_spend_is_window_limited(
    client: AsyncClient, session: AsyncSession
) -> None:
    """`by_slot` must agree with `totals`: a lease outside the requested window contributes to
    neither.
    """
    slot = make_slot()
    session.add_all([slot, make_terms(), make_creative(), make_verified()])
    in_window = make_lease(slot, 0, user=ADVERTISER)  # start == first_period_start
    out_of_window = make_lease(slot, 5, user=ADVERTISER, creative_id=7)  # far in the future
    session.add_all([in_window, out_of_window])
    await session.commit()
    lease_start, _ = slot.period_window(0)
    out_start, _ = slot.period_window(5)
    assert out_start > lease_start + DAY  # actually outside the window below

    resp = await client.get(
        f"/v1/analytics/advertisers/{ADVERTISER}?from={lease_start - DAY}&to={lease_start + DAY}"
    )
    body = resp.json()
    assert body["totals"]["leaseSpend"] == "5000000"
    assert body["bySlot"] == [{"slotId": "1", "spend": "5000000"}]


async def test_by_slot_ordered_by_spend_capped_at_ten(
    client: AsyncClient, session: AsyncSession
) -> None:
    rows: list[object] = []
    for i in range(1, 13):
        slot = make_slot(slot_id=i, domain=f"slot{i}.example.com")
        camp = make_campaign(slot_id=i, campaign_id=i, remaining=0)
        settle = settlement(
            batch_id="0x" + f"{i:064x}",
            campaign_id=i,
            slot_id=i,
            charged=i * 1_000_000,
            fee=0,
        )
        rows.extend([slot, make_terms(slot_id=i), camp, settle])
    session.add_all(rows)
    await session.commit()

    resp = await client.get(f"/v1/analytics/advertisers/{ADVERTISER}")
    body = resp.json()
    by_slot = body["bySlot"]
    assert len(by_slot) == 10
    spends = [int(row["spend"]) for row in by_slot]
    assert spends == sorted(spends, reverse=True)
    assert by_slot[0]["slotId"] == "12"


async def test_money_fields_are_digit_strings(client: AsyncClient, session: AsyncSession) -> None:
    slot = make_slot()
    session.add_all([slot, make_terms(), make_creative(), make_verified(), make_lease(slot, 0)])
    await session.commit()
    lease_start, _ = slot.period_window(0)

    resp = await client.get(
        f"/v1/analytics/slots/1?from={lease_start - DAY}&to={lease_start + DAY}"
    )
    totals = resp.json()["totals"]
    for key in (
        "leaseSpend",
        "leaseFee",
        "leaseEarnings",
        "cpcSettledSpend",
        "cpcSettledFee",
        "cpcSettledEarnings",
        "accruedCpcSpend",
    ):
        assert totals[key].isdigit(), (key, totals[key])
