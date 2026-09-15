"""Serve response contract. MUST match ``embed/src/types.ts`` field for field.

docs/ARCHITECTURE.md section 3.4.
"""

from __future__ import annotations

from typing import Literal

from openad.schemas.common import ApiModel

ServeStatus = Literal["lease", "campaign", "house", "empty", "unknown"]


class ServeCreative(ApiModel):
    kind: Literal["image"] = "image"
    media_url: str
    click_url: str
    width: int
    height: int
    alt: str = "Sponsored"


class ServeLease(ApiModel):
    advertiser: str
    expires_at: str  # ISO-8601 UTC


class ServeCampaign(ApiModel):
    advertiser: str
    campaign_id: str


class ServeResponse(ApiModel):
    slot_id: str
    status: ServeStatus
    creative: ServeCreative | None = None
    lease: ServeLease | None = None
    campaign: ServeCampaign | None = None
    ttl: int
