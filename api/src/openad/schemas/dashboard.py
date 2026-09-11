from __future__ import annotations

from openad.schemas.common import ApiModel


class PublisherOut(ApiModel):
    address: str
    slot_ids: list[str]
    pending_approvals: int
    earnings_usdc: str


class ServeCountOut(ApiModel):
    slot_id: str
    period_index: str
    serves: int


class ApprovalOut(ApiModel):
    publisher: str
    creative_id: str
    status: int
    advertiser: str | None = None


class AdvertiserOut(ApiModel):
    address: str
    creative_ids: list[str]
    lease_count: int
    delivery: list[ServeCountOut]


class HouseAdIn(ApiModel):
    media_url: str
    click_url: str = ""


class NonceOut(ApiModel):
    nonce: str


class SiweIn(ApiModel):
    message: str
    signature: str
