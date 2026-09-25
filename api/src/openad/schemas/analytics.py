"""Analytics read model schemas (ROADMAP 6.4).

Money fields are decimal strings of integer USDC base units, the same convention as
``schemas/dashboard.py``. See ``docs/ARCHITECTURE.md`` §3.x for the exact formulas.
"""

from __future__ import annotations

from pydantic import Field

from openad.schemas.common import ApiModel


class AnalyticsWindow(ApiModel):
    from_: int = Field(alias="from")
    to: int


class DailyBucket(ApiModel):
    day_start: int
    impressions: int
    house_serves: int
    clicks_payable: int
    clicks_invalid: int
    lease_spend: str
    accrued_cpc_spend: str


class AnalyticsTotals(ApiModel):
    impressions: int
    house_serves: int
    clicks_payable: int
    clicks_invalid: int
    ctr_bps: int | None
    ecpm: int | None
    lease_spend: str
    lease_fee: str
    lease_earnings: str
    cpc_settled_spend: str
    cpc_settled_fee: str
    cpc_settled_earnings: str
    accrued_cpc_spend: str
    invalid_origin_serves: int
    clicks_invalid_by_reason: dict[str, int]


class BySlotOut(ApiModel):
    slot_id: str
    spend: str


class SlotAnalyticsOut(ApiModel):
    slot_id: str
    window: AnalyticsWindow
    totals: AnalyticsTotals
    daily: list[DailyBucket]


class AdvertiserAnalyticsOut(ApiModel):
    address: str
    window: AnalyticsWindow
    totals: AnalyticsTotals
    daily: list[DailyBucket]
    by_slot: list[BySlotOut]
