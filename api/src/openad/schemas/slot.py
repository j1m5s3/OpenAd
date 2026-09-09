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
