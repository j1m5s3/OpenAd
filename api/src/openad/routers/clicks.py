"""GET /v1/c/{token} — one-time click token → 302 landing or 404."""

from __future__ import annotations

import time

from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse, Response

from openad.db.session import SessionDep
from openad.services import clicks as click_service

router = APIRouter(tags=["clicks"])


@router.get("/c/{token}")
async def follow_click(token: str, request: Request, session: SessionDep) -> Response:
    settings = request.app.state.settings
    ip = request.client.host if request.client is not None else "unknown"
    landing, _reason = await click_service.resolve_click(
        session,
        secret=settings.click_hmac_secret,
        raw_token=token,
        now=int(time.time()),
        ip=ip,
        ivt=settings.click_ivt,
        max_per_hour=settings.click_max_per_campaign_hour,
    )
    if landing is None:
        return Response(status_code=404)
    return RedirectResponse(url=landing, status_code=302)
