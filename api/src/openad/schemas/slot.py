"""Slot read models for the public API (ROADMAP 2.6 fills in periods/quotes)."""

from __future__ import annotations

from openad.schemas.common import ApiModel


class TermsOut(ApiModel):
    start_price: str  # uint256 as decimal string
    floor_price: str
    lead_seconds: int
    sale_end: int
    approval_mode: int
    paused: bool


class SlotOut(ApiModel):
    slot_id: str
    owner: str
    width: int
    height: int
    kind: int
    domain: str
    calendar_version: int
    period_seconds: int | None
    first_period_start: int | None
    terms: TermsOut | None = None


class SlotListOut(ApiModel):
    items: list[SlotOut]
    total: int


class PeriodOut(ApiModel):
    period_index: str
    start: int
    end: int
    leased: bool
    lessee: str | None = None
    creative_id: str | None = None
    sellable: bool
    reason: str
    indicative_price: str


class PeriodListOut(ApiModel):
    items: list[PeriodOut]
