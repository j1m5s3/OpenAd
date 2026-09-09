from __future__ import annotations

from openad.schemas.common import ApiModel


class HealthResponse(ApiModel):
    status: str
    version: str
    chain_id: int
    env: str
