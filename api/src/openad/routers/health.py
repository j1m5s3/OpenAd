from __future__ import annotations

from fastapi import APIRouter, Request

from openad.chain.client import make_web3
from openad.db.session import SessionDep
from openad.schemas.health import HealthResponse
from openad.services import health as health_service

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health(request: Request, session: SessionDep) -> HealthResponse:
    settings = request.app.state.settings
    head: int | None = None
    try:
        w3 = make_web3(settings.rpc_url, timeout=2.0)
        head = int(await w3.eth.block_number)
    except Exception:
        head = None
    return await health_service.build_health(session, settings, head_block=head)
