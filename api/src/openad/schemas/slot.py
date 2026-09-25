"""Slot read models for the public API (ROADMAP 2.6 fills in periods/quotes)."""

from __future__ import annotations

from pydantic import Field

from openad.schemas.common import ApiModel


class SlotListingIn(ApiModel):
    """Write body for ``PUT /v1/slots/{slot_id}/listing``.

    Deliberately loose types (``str``/``list[str]``, not ``Category``): validation lives in
    ``services/offchain.py`` so every rejection (unknown category, too many categories, overlong
    text, a URL in the summary, control characters) returns 422 in the repo's existing
    ``{"error": ..., "message": ...}`` shape (``DomainError``), not FastAPI's default Pydantic
    validation-error body.
    """

    summary: str
    audience: str
    categories: list[str] = Field(default_factory=list)


class SlotListingOut(ApiModel):
    slot_id: str
    summary: str
    audience: str
    categories: list[str]
    updated_at: int


class TermsOut(ApiModel):
    start_price: str  # uint256 as decimal string
    floor_price: str
    lead_seconds: int
    sale_end: int
    approval_mode: int
    sale_mode: int = 0
    floor_cpc: str = "0"
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
    listing: SlotListingOut | None = None


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
