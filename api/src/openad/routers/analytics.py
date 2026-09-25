from __future__ import annotations

import time

from fastapi import APIRouter, Query

from openad.db.session import SessionDep
from openad.schemas.analytics import AdvertiserAnalyticsOut, SlotAnalyticsOut
from openad.services import analytics as analytics_service

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/slots/{slot_id}", response_model=SlotAnalyticsOut)
async def slot_analytics(
    slot_id: int,
    session: SessionDep,
    from_: int | None = Query(default=None, alias="from"),
    to: int | None = Query(default=None),
) -> SlotAnalyticsOut:
    return await analytics_service.slot_analytics(session, slot_id, from_, to, now=int(time.time()))


@router.get("/advertisers/{address}", response_model=AdvertiserAnalyticsOut)
async def advertiser_analytics(
    address: str,
    session: SessionDep,
    from_: int | None = Query(default=None, alias="from"),
    to: int | None = Query(default=None),
) -> AdvertiserAnalyticsOut:
    return await analytics_service.advertiser_analytics(
        session, address, from_, to, now=int(time.time())
    )
