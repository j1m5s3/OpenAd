from __future__ import annotations

from fastapi import APIRouter, Query

from openad.db.session import SessionDep
from openad.schemas.slot import SlotListOut, SlotOut
from openad.services import slots as slots_service

router = APIRouter(prefix="/slots", tags=["slots"])


@router.get("", response_model=SlotListOut)
async def list_slots(
    session: SessionDep,
    domain: str | None = None,
    kind: int | None = Query(default=None, ge=0, le=3),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> SlotListOut:
    return await slots_service.list_slots(
        session, domain=domain, kind=kind, limit=limit, offset=offset
    )


@router.get("/{slot_id}", response_model=SlotOut)
async def get_slot(slot_id: int, session: SessionDep) -> SlotOut:
    """Slot detail. Also the ERC-721 ``tokenURI`` target (AdSlot.base_uri + slot_id)."""
    return await slots_service.get_slot(session, slot_id)
