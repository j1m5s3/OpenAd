from __future__ import annotations

import time

from fastapi import APIRouter, Query, Request

from openad.db.session import SessionDep
from openad.schemas.dashboard import ApprovalOut, PublisherOut
from openad.services import auth as auth_service
from openad.services import creatives as creatives_service

router = APIRouter(prefix="/publishers", tags=["publishers"])


@router.get("/{address}", response_model=PublisherOut)
async def publisher(address: str, session: SessionDep) -> PublisherOut:
    return await creatives_service.publisher_dashboard(session, address)


@router.get("/{address}/approvals", response_model=list[ApprovalOut])
async def publisher_approvals(address: str, session: SessionDep) -> list[ApprovalOut]:
    return await creatives_service.list_approvals(session, address)


@router.get("/{address}/pricing-suggestion")
async def pricing_suggestion(
    address: str,
    request: Request,
    session: SessionDep,
    slot_id: int = Query(..., ge=1),
) -> dict[str, str]:
    rec = await auth_service.get_session(session, request.cookies.get(auth_service.COOKIE_NAME))
    await auth_service.require_slot_owner(session, slot_id, rec.address)
    if rec.address != address.lower():
        from openad.errors import ForbiddenError

        raise ForbiddenError("wallet is not the publisher")
    return await creatives_service.suggest_prices(session, slot_id, int(time.time()))
