from __future__ import annotations

from fastapi import APIRouter

from openad.db.session import SessionDep
from openad.schemas.dashboard import AdvertiserOut
from openad.services import creatives as creatives_service

router = APIRouter(prefix="/advertisers", tags=["advertisers"])


@router.get("/{address}", response_model=AdvertiserOut)
async def advertiser(address: str, session: SessionDep) -> AdvertiserOut:
    return await creatives_service.advertiser_dashboard(session, address)
