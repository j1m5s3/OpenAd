"""Analytics read model (ROADMAP 6.4). Reads ``serve_events``, ``click_events`` and indexed
tables only — never the chain. See ``docs/ARCHITECTURE.md`` §3.x for the exact formulas.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import func, select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import ColumnElement

from openad.errors import InvalidWindowError, SlotNotFoundError
from openad.models import Campaign, CampaignSettlement, ClickEvent, Lease, ServeEvent, Slot
from openad.schemas.analytics import (
    AdvertiserAnalyticsOut,
    AnalyticsTotals,
    AnalyticsWindow,
    BySlotOut,
    DailyBucket,
    SlotAnalyticsOut,
)

_DAY_SECONDS = 86_400
_DEFAULT_WINDOW_DAYS = 30
_MAX_WINDOW_DAYS = 90


def _day_expr(col: Any) -> Any:
    """Floor ``col`` (unix seconds) to its UTC day start.

    Plain ``/`` is SQLAlchemy's *true* division operator (it coerces to a numeric/float SQL
    expression), so ``(col / 86400) * 86400`` does not floor to a day boundary. Subtracting the
    remainder is integer arithmetic on every backend the tests and prod run on (SQLite,
    Postgres) and needs no cast.
    """
    return col - (col % _DAY_SECONDS)


def resolve_window(from_: int | None, to: int | None, now: int) -> tuple[int, int]:
    """Default last 30 days; reject a window over 90 days or inverted (PLAN D4)."""
    resolved_to = now if to is None else to
    resolved_from = resolved_to - _DEFAULT_WINDOW_DAYS * _DAY_SECONDS if from_ is None else from_
    if resolved_to < resolved_from:
        raise InvalidWindowError("window `to` is before `from`")
    if resolved_to - resolved_from > _MAX_WINDOW_DAYS * _DAY_SECONDS:
        raise InvalidWindowError(f"window exceeds {_MAX_WINDOW_DAYS} days")
    return resolved_from, resolved_to


def _day_range(from_: int, to: int) -> list[int]:
    start = (from_ // _DAY_SECONDS) * _DAY_SECONDS
    end = (to // _DAY_SECONDS) * _DAY_SECONDS
    return list(range(start, end + _DAY_SECONDS, _DAY_SECONDS))


@dataclass
class _DayAcc:
    impressions: int = 0
    house_serves: int = 0
    invalid_origin_serves: int = 0
    clicks_payable: int = 0
    clicks_invalid: int = 0
    lease_spend: int = 0
    lease_fee: int = 0
    accrued_cpc_spend: int = 0


@dataclass
class _Accumulator:
    days: dict[int, _DayAcc] = field(default_factory=dict)

    def bucket(self, day_start: int) -> _DayAcc:
        return self.days.setdefault(day_start, _DayAcc())


async def _serve_counts(
    session: AsyncSession, serve_filter: ColumnElement[bool], from_: int, to: int
) -> tuple[dict[int, int], dict[int, int], int]:
    """Returns (impressions_by_day, house_serves_by_day, invalid_origin_total)."""
    day = _day_expr(ServeEvent.at)
    imp_rows = (
        await session.execute(
            select(day, func.count())
            .where(
                serve_filter,
                ServeEvent.served_kind.in_(("lease", "campaign")),
                ServeEvent.origin_ok.is_(True),
                ServeEvent.at >= from_,
                ServeEvent.at <= to,
            )
            .group_by(day)
        )
    ).all()
    house_rows = (
        await session.execute(
            select(day, func.count())
            .where(
                serve_filter,
                ServeEvent.served_kind == "house",
                ServeEvent.at >= from_,
                ServeEvent.at <= to,
            )
            .group_by(day)
        )
    ).all()
    invalid_origin_total = (
        await session.execute(
            select(func.count()).where(
                serve_filter,
                ServeEvent.origin_ok.is_(False),
                ServeEvent.at >= from_,
                ServeEvent.at <= to,
            )
        )
    ).scalar_one()
    return (
        {int(d): int(c) for d, c in imp_rows},
        {int(d): int(c) for d, c in house_rows},
        int(invalid_origin_total),
    )


async def _click_counts(
    session: AsyncSession, click_filter: ColumnElement[bool], from_: int, to: int
) -> tuple[dict[int, int], dict[int, int], dict[int, int], dict[str, int]]:
    """Returns (payable_by_day, invalid_by_day, accrued_cpc_by_day, invalid_by_reason)."""
    day = _day_expr(ClickEvent.at)
    payable_rows = (
        await session.execute(
            select(day, func.count())
            .where(
                click_filter,
                ClickEvent.payable.is_(True),
                ClickEvent.at >= from_,
                ClickEvent.at <= to,
            )
            .group_by(day)
        )
    ).all()
    invalid_rows = (
        await session.execute(
            select(day, func.count())
            .where(
                click_filter,
                ClickEvent.payable.is_(False),
                ClickEvent.at >= from_,
                ClickEvent.at <= to,
            )
            .group_by(day)
        )
    ).all()
    accrued_rows = (
        await session.execute(
            select(day, func.sum(ClickEvent.gsp_cpc))
            .where(
                click_filter,
                ClickEvent.payable.is_(True),
                ClickEvent.at >= from_,
                ClickEvent.at <= to,
            )
            .group_by(day)
        )
    ).all()
    reason_rows = (
        await session.execute(
            select(ClickEvent.ivt_reason, func.count())
            .where(
                click_filter,
                ClickEvent.payable.is_(False),
                ClickEvent.at >= from_,
                ClickEvent.at <= to,
            )
            .group_by(ClickEvent.ivt_reason)
        )
    ).all()
    return (
        {int(d): int(c) for d, c in payable_rows},
        {int(d): int(c) for d, c in invalid_rows},
        {int(d): int(s) for d, s in accrued_rows},
        {(reason or "unknown"): int(c) for reason, c in reason_rows},
    )


async def _lease_totals(
    session: AsyncSession, lease_filter: ColumnElement[bool], from_: int, to: int
) -> tuple[dict[int, int], dict[int, int], int, int]:
    """Returns (spend_by_day, fee_by_day, total_spend, total_fee), attributed by period start."""
    day = _day_expr(Lease.start)
    rows = (
        await session.execute(
            select(day, func.sum(Lease.price), func.sum(Lease.fee))
            .where(lease_filter, Lease.start >= from_, Lease.start <= to, Lease.price.is_not(None))
            .group_by(day)
        )
    ).all()
    spend_by_day = {int(d): int(p or 0) for d, p, _f in rows}
    fee_by_day = {int(d): int(f or 0) for d, _p, f in rows}
    total_spend = sum(spend_by_day.values())
    total_fee = sum(fee_by_day.values())
    return spend_by_day, fee_by_day, total_spend, total_fee


def _ctr_bps(clicks_payable: int, impressions: int) -> int | None:
    if impressions == 0:
        return None
    return clicks_payable * 10_000 // impressions


def _ecpm(basis: int, impressions: int) -> int | None:
    if impressions == 0:
        return None
    return basis * 1_000 // impressions


def _build_daily(acc: _Accumulator, from_: int, to: int) -> list[DailyBucket]:
    return [
        DailyBucket(
            day_start=d,
            impressions=acc.days[d].impressions if d in acc.days else 0,
            house_serves=acc.days[d].house_serves if d in acc.days else 0,
            clicks_payable=acc.days[d].clicks_payable if d in acc.days else 0,
            clicks_invalid=acc.days[d].clicks_invalid if d in acc.days else 0,
            lease_spend=str(acc.days[d].lease_spend if d in acc.days else 0),
            accrued_cpc_spend=str(acc.days[d].accrued_cpc_spend if d in acc.days else 0),
        )
        for d in _day_range(from_, to)
    ]


def _merge_into(
    acc: _Accumulator,
    *,
    impressions_by_day: dict[int, int],
    house_by_day: dict[int, int],
    payable_by_day: dict[int, int],
    invalid_by_day: dict[int, int],
    lease_spend_by_day: dict[int, int],
    lease_fee_by_day: dict[int, int],
    accrued_by_day: dict[int, int],
) -> None:
    for d, n in impressions_by_day.items():
        acc.bucket(d).impressions += n
    for d, n in house_by_day.items():
        acc.bucket(d).house_serves += n
    for d, n in payable_by_day.items():
        acc.bucket(d).clicks_payable += n
    for d, n in invalid_by_day.items():
        acc.bucket(d).clicks_invalid += n
    for d, n in lease_spend_by_day.items():
        acc.bucket(d).lease_spend += n
    for d, n in lease_fee_by_day.items():
        acc.bucket(d).lease_fee += n
    for d, n in accrued_by_day.items():
        acc.bucket(d).accrued_cpc_spend += n


async def slot_analytics(
    session: AsyncSession, slot_id: int, from_param: int | None, to_param: int | None, now: int
) -> SlotAnalyticsOut:
    slot = await session.get(Slot, slot_id)
    if slot is None:
        raise SlotNotFoundError(f"slot {slot_id} not found")
    from_, to = resolve_window(from_param, to_param, now)

    acc = _Accumulator()
    impressions_by_day, house_by_day, invalid_origin_total = await _serve_counts(
        session, ServeEvent.slot_id == slot_id, from_, to
    )
    payable_by_day, invalid_by_day, accrued_by_day, reason_counts = await _click_counts(
        session, ClickEvent.slot_id == slot_id, from_, to
    )
    lease_spend_by_day, lease_fee_by_day, lease_spend_total, lease_fee_total = await _lease_totals(
        session, Lease.slot_id == slot_id, from_, to
    )
    _merge_into(
        acc,
        impressions_by_day=impressions_by_day,
        house_by_day=house_by_day,
        payable_by_day=payable_by_day,
        invalid_by_day=invalid_by_day,
        lease_spend_by_day=lease_spend_by_day,
        lease_fee_by_day=lease_fee_by_day,
        accrued_by_day=accrued_by_day,
    )

    settle_rows = (
        (
            await session.execute(
                select(CampaignSettlement).where(CampaignSettlement.slot_id == slot_id)
            )
        )
        .scalars()
        .all()
    )
    cpc_settled_spend = sum(int(r.charged) for r in settle_rows)
    cpc_settled_fee = sum(int(r.fee) for r in settle_rows)
    cpc_settled_earnings = cpc_settled_spend - cpc_settled_fee

    accrued_total = sum(acc_.accrued_cpc_spend for acc_ in acc.days.values())
    total_impressions = sum(acc_.impressions for acc_ in acc.days.values())
    total_house = sum(acc_.house_serves for acc_ in acc.days.values())
    total_payable = sum(acc_.clicks_payable for acc_ in acc.days.values())
    total_invalid = sum(acc_.clicks_invalid for acc_ in acc.days.values())
    lease_earnings_total = lease_spend_total - lease_fee_total

    totals = AnalyticsTotals(
        impressions=total_impressions,
        house_serves=total_house,
        clicks_payable=total_payable,
        clicks_invalid=total_invalid,
        ctr_bps=_ctr_bps(total_payable, total_impressions),
        ecpm=_ecpm(lease_earnings_total + cpc_settled_earnings, total_impressions),
        lease_spend=str(lease_spend_total),
        lease_fee=str(lease_fee_total),
        lease_earnings=str(lease_earnings_total),
        cpc_settled_spend=str(cpc_settled_spend),
        cpc_settled_fee=str(cpc_settled_fee),
        cpc_settled_earnings=str(cpc_settled_earnings),
        accrued_cpc_spend=str(accrued_total),
        invalid_origin_serves=invalid_origin_total,
        clicks_invalid_by_reason=reason_counts,
    )
    return SlotAnalyticsOut(
        slot_id=str(slot_id),
        window=AnalyticsWindow(**{"from": from_, "to": to}),
        totals=totals,
        daily=_build_daily(acc, from_, to),
    )


async def advertiser_analytics(
    session: AsyncSession, address: str, from_param: int | None, to_param: int | None, now: int
) -> AdvertiserAnalyticsOut:
    addr = address.lower()
    from_, to = resolve_window(from_param, to_param, now)

    leases = (await session.execute(select(Lease).where(Lease.user == addr))).scalars().all()
    lease_pairs = [(row.slot_id, row.calendar_version, row.period_index) for row in leases]
    campaigns = (
        (await session.execute(select(Campaign).where(Campaign.advertiser == addr))).scalars().all()
    )
    campaign_ids = [c.campaign_id for c in campaigns]
    campaign_slot: dict[int, int] = {c.campaign_id: c.slot_id for c in campaigns}

    acc = _Accumulator()
    by_slot_spend: dict[int, int] = defaultdict(int)

    if lease_pairs:
        lease_serve_filter = tuple_(
            ServeEvent.slot_id, ServeEvent.lease_calendar_version, ServeEvent.lease_period_index
        ).in_(lease_pairs)
        impressions_by_day, house_by_day, invalid_origin_lease = await _serve_counts(
            session, lease_serve_filter, from_, to
        )
    else:
        impressions_by_day, house_by_day, invalid_origin_lease = {}, {}, 0

    lease_spend_by_day, lease_fee_by_day, lease_spend_total, lease_fee_total = (
        await _lease_totals(session, Lease.user == addr, from_, to)
        if lease_pairs
        else ({}, {}, 0, 0)
    )
    # Window-limited, so `by_slot` stays consistent with `totals.lease_spend` above.
    for row in leases:
        if row.price is not None and from_ <= row.start <= to:
            by_slot_spend[row.slot_id] += int(row.price)

    if campaign_ids:
        camp_serve_filter = ServeEvent.campaign_id.in_(campaign_ids)
        camp_impressions_by_day, camp_house_by_day, invalid_origin_camp = await _serve_counts(
            session, camp_serve_filter, from_, to
        )
        click_filter = ClickEvent.campaign_id.in_(campaign_ids)
        payable_by_day, invalid_by_day, accrued_by_day, reason_counts = await _click_counts(
            session, click_filter, from_, to
        )
        settle_rows = (
            (
                await session.execute(
                    select(CampaignSettlement).where(
                        CampaignSettlement.campaign_id.in_(campaign_ids)
                    )
                )
            )
            .scalars()
            .all()
        )
    else:
        camp_impressions_by_day, camp_house_by_day, invalid_origin_camp = {}, {}, 0
        payable_by_day, invalid_by_day, accrued_by_day, reason_counts = {}, {}, {}, {}
        settle_rows = []

    for d, n in camp_impressions_by_day.items():
        impressions_by_day[d] = impressions_by_day.get(d, 0) + n
    for d, n in camp_house_by_day.items():
        house_by_day[d] = house_by_day.get(d, 0) + n

    _merge_into(
        acc,
        impressions_by_day=impressions_by_day,
        house_by_day=house_by_day,
        payable_by_day=payable_by_day,
        invalid_by_day=invalid_by_day,
        lease_spend_by_day=lease_spend_by_day,
        lease_fee_by_day=lease_fee_by_day,
        accrued_by_day=accrued_by_day,
    )

    cpc_settled_spend = sum(int(r.charged) for r in settle_rows)
    cpc_settled_fee = sum(int(r.fee) for r in settle_rows)
    cpc_settled_earnings = cpc_settled_spend - cpc_settled_fee
    for r in settle_rows:
        slot_id = campaign_slot.get(r.campaign_id, r.slot_id)
        by_slot_spend[slot_id] += int(r.charged)

    total_impressions = sum(acc_.impressions for acc_ in acc.days.values())
    total_house = sum(acc_.house_serves for acc_ in acc.days.values())
    total_payable = sum(acc_.clicks_payable for acc_ in acc.days.values())
    total_invalid = sum(acc_.clicks_invalid for acc_ in acc.days.values())
    accrued_total = sum(acc_.accrued_cpc_spend for acc_ in acc.days.values())
    invalid_origin_total = invalid_origin_lease + invalid_origin_camp

    totals = AnalyticsTotals(
        impressions=total_impressions,
        house_serves=total_house,
        clicks_payable=total_payable,
        clicks_invalid=total_invalid,
        ctr_bps=_ctr_bps(total_payable, total_impressions),
        ecpm=_ecpm(lease_spend_total + cpc_settled_spend, total_impressions),
        lease_spend=str(lease_spend_total),
        lease_fee=str(lease_fee_total),
        lease_earnings=str(lease_spend_total - lease_fee_total),
        cpc_settled_spend=str(cpc_settled_spend),
        cpc_settled_fee=str(cpc_settled_fee),
        cpc_settled_earnings=str(cpc_settled_earnings),
        accrued_cpc_spend=str(accrued_total),
        invalid_origin_serves=invalid_origin_total,
        clicks_invalid_by_reason=reason_counts,
    )

    top_slots = sorted(by_slot_spend.items(), key=lambda kv: kv[1], reverse=True)[:10]

    return AdvertiserAnalyticsOut(
        address=addr,
        window=AnalyticsWindow(**{"from": from_, "to": to}),
        totals=totals,
        daily=_build_daily(acc, from_, to),
        by_slot=[BySlotOut(slot_id=str(sid), spend=str(spend)) for sid, spend in top_slots],
    )
