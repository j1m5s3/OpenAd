from __future__ import annotations

from pydantic import Field

from openad.schemas.common import ApiModel
from openad.siwe import MAX_MESSAGE_LENGTH


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
    campaigns: list[CampaignOut]


class CampaignSettleOut(ApiModel):
    batch_id: str
    charged: str
    fee: str
    payable_clicks: int
    slot_id: str


class CampaignOut(ApiModel):
    campaign_id: str
    slot_id: str
    creative_id: str
    max_cpc: str
    remaining: str
    budget: str
    paused: bool
    closed: bool
    close_after: int
    serves: int
    settlements: list[CampaignSettleOut]


class HouseAdIn(ApiModel):
    media_url: str
    click_url: str = ""


class NonceOut(ApiModel):
    nonce: str


class SiweIn(ApiModel):
    # A longer message gets the auth routes' house-style 422 (``main.py``) before parsing.
    message: str = Field(max_length=MAX_MESSAGE_LENGTH)
    signature: str
