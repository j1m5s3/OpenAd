from __future__ import annotations

from openad.schemas.common import ApiModel


class CreativeOut(ApiModel):
    creative_id: str
    advertiser: str
    kind: int
    uri: str
    content_hash: str | None
    mime: str
    width: int
    height: int
    click_url: str
    revoked: bool
    verification_status: str
    verification_error: str | None = None
