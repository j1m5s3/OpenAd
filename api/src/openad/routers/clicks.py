"""GET /v1/c/{token} — one-time click token → 302 landing or 404."""

from __future__ import annotations

import time

from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse, Response

from openad.config import Settings
from openad.db.session import SessionDep
from openad.ratelimit import client_key
from openad.services import clicks as click_service

router = APIRouter(tags=["clicks"])


def burst_rule_active(settings: Settings) -> bool:
    """Whether the click burst rule's client key identifies the visitor.

    The key is :func:`openad.ratelimit.client_key`: the N-th ``X-Forwarded-For`` entry from the
    right when ``trusted_proxy_hops`` is N > 0, else the TCP peer. The peer is the visitor only
    in dev and test. In staging or prod with 0 hops (Cloud Run) it is the proxy in front of
    the api, shared by every visitor, so the rule would discard the second click on a slot from
    anyone; it is skipped there until the hop count is verified (docs/deploy-gcp.md section 11).
    """
    return settings.trusted_proxy_hops > 0 or settings.is_dev


@router.get("/c/{token}")
async def follow_click(token: str, request: Request, session: SessionDep) -> Response:
    settings = request.app.state.settings
    landing, _reason = await click_service.resolve_click(
        session,
        secret=settings.click_hmac_secret,
        raw_token=token,
        now=int(time.time()),
        # The visitor as the trusted proxy hops report it, like the auth rate limit's key.
        client=client_key(request, settings.trusted_proxy_hops),
        burst_rule=settings.click_ivt and burst_rule_active(settings),
        max_per_hour=settings.click_max_per_campaign_hour,
    )
    if landing is None:
        return Response(status_code=404)
    return RedirectResponse(url=landing, status_code=302)
