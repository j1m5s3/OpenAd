"""Serving edge: GET /v1/serve/{slot_id} and /v1/serve/{slot_id}/media.

Public, cacheable, never touches the chain. docs/ARCHITECTURE.md section 3.4.
"""

from __future__ import annotations

import time
from typing import Annotated

from fastapi import APIRouter, Header, Request, Response
from fastapi.responses import JSONResponse

from openad.db.session import SessionDep
from openad.models import Creative, CreativeVerification
from openad.schemas.serve import ServeResponse
from openad.serve import cache as serve_cache
from openad.serve.origin import host_matches_domain, request_host
from openad.services import media as media_service
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

    etag = _serve_etag(slot_id, result.response.status, result.lease)
    response.headers["Cache-Control"] = f"public, max-age={result.response.ttl}"
    response.headers["Vary"] = "Origin"
    response.headers["ETag"] = etag
    return result.response


@router.get("/{slot_id}/media")
async def serve_media(
    slot_id: int,
    request: Request,
    session: SessionDep,
    if_none_match: Annotated[str | None, Header()] = None,
) -> Response:
    """Verified media bytes for the current lease. Never fetches advertiser URLs."""
    settings = request.app.state.settings
    now = int(time.time())
    ctx = serve_service.ServeContext(public_url=settings.public_url, ttl=settings.serve_ttl_seconds)
    result = await serve_service.resolve(session, slot_id, now, ctx)
    if result.response.status != "lease" or result.lease is None:
        return JSONResponse(
            status_code=404, content={"error": "no verified media", "slotId": str(slot_id)}
        )

    verification = await session.get(CreativeVerification, result.lease.creative_id)
    missing = JSONResponse(
        status_code=404, content={"error": "media not cached", "slotId": str(slot_id)}
    )
    if verification is None or not verification.cached_path:
        return missing
    data = await media_service.read_cached(verification.cached_path)
    if data is None:
        return missing

    creative = await session.get(Creative, result.lease.creative_id)
    etag = '"' + (creative.content_hash if creative and creative.content_hash else "media") + '"'
    headers = {
        "Cache-Control": f"public, max-age={settings.serve_ttl_seconds}",
        "ETag": etag,
    }
    if if_none_match == etag:
        return Response(status_code=304, headers=headers)
    media_type = creative.mime if creative else "application/octet-stream"
    return Response(content=data, media_type=media_type, headers=headers)


def _serve_etag(slot_id: int, status: str, lease: object) -> str:
    cid = getattr(lease, "creative_id", 0) if lease is not None else 0
    return f'W/"{slot_id}-{status}-{serve_cache.generation()}-{cid}"'
