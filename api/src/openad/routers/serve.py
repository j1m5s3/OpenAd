"""Serving edge: GET /v1/serve/{slot_id} and /v1/serve/{slot_id}/media.

Public and never touches the chain. Media, and lease, house and empty responses, are publicly
cacheable; a campaign response is ``private, no-store``. docs/ARCHITECTURE.md section 3.4.
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
from openad.serve.origin import origin_allowed
from openad.services import clicks as click_service
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
    paid = result.response.status in {"lease", "campaign"}
    if settings.serve_enforce_origin and paid:
        origin_ok = origin_allowed(origin, referer, result.slot.domain, allow_local=settings.is_dev)
        if not origin_ok:
            result = await serve_service.house_or_empty(session, result.slot, ctx)

    event = await serve_service.record_serve(
        session,
        result.response,
        now=now,
        origin_ok=origin_ok,
        lease=result.lease,
        campaign=result.campaign,
        gsp_cpc=result.gsp_cpc,
    )
    if (
        result.response.status == "campaign"
        and result.campaign is not None
        and event is not None
        and result.response.creative is not None
    ):
        raw = click_service.mint_click_token(
            secret=settings.click_hmac_secret,
            token=click_service.ClickToken(
                slot_id=result.campaign.slot_id,
                campaign_id=result.campaign.campaign_id,
                creative_id=result.campaign.creative_id,
                serve_event_id=event.id,
                exp=now + click_service.TOKEN_TTL_SECONDS,
            ),
        )
        result.response.creative.click_url = f"{settings.public_url}/v1/c/{raw}"

    response.headers["Vary"] = "Origin"
    if result.response.status == "campaign":
        # Never shared by any cache: the response carries a one-time click token, and each
        # response is an impression (the serve_events row above).
        response.headers["Cache-Control"] = "private, no-store"
        return result.response
    etag = _serve_etag(slot_id, result.response.status, result.lease, result.campaign)
    response.headers["Cache-Control"] = f"public, max-age={result.response.ttl}"
    response.headers["ETag"] = etag
    return result.response


@router.get("/{slot_id}/media")
async def serve_media(
    slot_id: int,
    request: Request,
    session: SessionDep,
    if_none_match: Annotated[str | None, Header()] = None,
) -> Response:
    """Verified media bytes for the current lease or CPC winner. Never fetches advertiser URLs."""
    settings = request.app.state.settings
    now = int(time.time())
    ctx = serve_service.ServeContext(public_url=settings.public_url, ttl=settings.serve_ttl_seconds)
    result = await serve_service.resolve(session, slot_id, now, ctx)
    creative_id: int | None = None
    if result.response.status == "lease" and result.lease is not None:
        creative_id = result.lease.creative_id
    elif result.response.status == "campaign" and result.campaign is not None:
        creative_id = result.campaign.creative_id
    if creative_id is None:
        return JSONResponse(
            status_code=404, content={"error": "no verified media", "slotId": str(slot_id)}
        )

    verification = await session.get(CreativeVerification, creative_id)
    missing = JSONResponse(
        status_code=404, content={"error": "media not cached", "slotId": str(slot_id)}
    )
    if verification is None or not verification.cached_path:
        return missing
    data = await media_service.read_cached(verification.cached_path, settings=settings)
    if data is None:
        return missing

    creative = await session.get(Creative, creative_id)
    etag = '"' + (creative.content_hash if creative and creative.content_hash else "media") + '"'
    headers = {
        "Cache-Control": f"public, max-age={settings.serve_ttl_seconds}",
        "ETag": etag,
    }
    if if_none_match == etag:
        return Response(status_code=304, headers=headers)
    media_type = creative.mime if creative else "application/octet-stream"
    return Response(content=data, media_type=media_type, headers=headers)


def _serve_etag(slot_id: int, status: str, lease: object, campaign: object | None = None) -> str:
    cid = getattr(lease, "creative_id", 0) if lease is not None else 0
    camp = getattr(campaign, "campaign_id", 0) if campaign is not None else 0
    return f'W/"{slot_id}-{status}-{serve_cache.generation()}-{cid}-{camp}"'
