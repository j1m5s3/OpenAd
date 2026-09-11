from __future__ import annotations

from fastapi import APIRouter, Request

from openad.db.session import SessionDep
from openad.schemas.creative import CreativeOut
from openad.services import auth as auth_service
from openad.services import creatives as creatives_service
from openad.services import media as media_service

router = APIRouter(prefix="/creatives", tags=["creatives"])


@router.get("/{creative_id}", response_model=CreativeOut)
async def get_creative(creative_id: int, session: SessionDep) -> CreativeOut:
    return await creatives_service.get_creative(session, creative_id)


@router.post("/{creative_id}/verify", response_model=CreativeOut)
async def verify_creative(creative_id: int, request: Request, session: SessionDep) -> CreativeOut:
    rec = await auth_service.get_session(session, request.cookies.get(auth_service.COOKIE_NAME))
    await creatives_service.require_advertiser(session, creative_id, rec.address)
    await media_service.verify_creative(session, creative_id, request.app.state.settings)
    return await creatives_service.get_creative(session, creative_id)
