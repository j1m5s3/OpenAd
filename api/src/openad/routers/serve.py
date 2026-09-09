"""Serving edge: GET /v1/serve/{slot_id} and /v1/serve/{slot_id}/media.

Public, cacheable, never touches the chain. docs/ARCHITECTURE.md section 3.4.
"""

from __future__ import annotations

import time
from typing import Annotated

from fastapi import APIRouter, Header, Request, Response
from fastapi.responses import JSONResponse

from openad.db.session import SessionDep
from openad.schemas.serve import ServeResponse
from openad.serve.origin import host_matches_domain, request_host
from openad.services import serve as serve_service

router = APIRouter(prefix="/serve", tags=["serve"])


@router.get("/{slot_id}", response_model=ServeResponse, responses={404: {"model": ServeResponse}})
async def serve_slot(
    slot_id: int,
    request: Request,
    response: Response,
    session: SessionDep,
    origin: Annotated[str | None, Header()] = None,
    referer: Annotated[str | None, Header()] = None,
) -> ServeResponse | JSONResponse:
    settings = request.app.state.settings
    now = int(time.time())
    ctx = serve_service.ServeContext(public_url=settings.public_url, ttl=settings.serve_ttl_seconds)

    result = await serve_service.resolve(session, slot_id, now, ctx)
    if result.slot is None:
        return JSONResponse(
            status_code=404,
            content=result.response.model_dump(by_alias=True),
            headers={"Cache-Control": "public, max-age=60"},
        )

    origin_ok = True
    if settings.serve_enforce_origin and result.lease is not None:
        origin_ok = host_matches_domain(
            request_host(origin, referer), result.slot.domain, allow_local=settings.is_dev
        )
        if not origin_ok:
            result = await serve_service.house_or_empty(session, result.slot, ctx)

    await serve_service.record_serve(
        session, result.response, now=now, origin_ok=origin_ok, lease=result.lease
    )

    response.headers["Cache-Control"] = f"public, max-age={result.response.ttl}"
    response.headers["Vary"] = "Origin"
    return result.response


@router.get("/{slot_id}/media")
async def serve_media(slot_id: int) -> Response:
    """Verified media bytes for the current lease. Implemented in ROADMAP 2.3."""
    return JSONResponse(
        status_code=404,
        content={
            "error": "media cache not implemented",
            "roadmap": "2.3",
            "slotId": str(slot_id),
        },
    )
