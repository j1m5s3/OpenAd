from __future__ import annotations

import time
from typing import Literal

from fastapi import APIRouter, Query, Request

from openad.db.session import SessionDep
from openad.db.types import UINT256_MAX
from openad.listing_taxonomy import Category
from openad.schemas.dashboard import HouseAdIn
from openad.schemas.slot import PeriodListOut, SlotListingIn, SlotListingOut, SlotListOut, SlotOut
from openad.services import auth as auth_service
from openad.services import offchain as offchain_service
from openad.services import periods as periods_service
from openad.services import slots as slots_service

router = APIRouter(prefix="/slots", tags=["slots"])


@router.get("", response_model=SlotListOut)
async def list_slots(
    session: SessionDep,
    domain: str | None = None,
    kind: int | None = Query(default=None, ge=0, le=3),
    category: Category | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> SlotListOut:
    return await slots_service.list_slots(
        session, domain=domain, kind=kind, category=category, limit=limit, offset=offset
    )


@router.get("/{slot_id}", response_model=SlotOut)
async def get_slot(slot_id: int, session: SessionDep) -> SlotOut:
    """Slot detail. Also the ERC-721 ``tokenURI`` target (AdSlot.base_uri + slot_id)."""
    return await slots_service.get_slot(session, slot_id)


@router.get("/{slot_id}/periods", response_model=PeriodListOut)
async def list_periods(
    slot_id: int,
    session: SessionDep,
    from_index: int = Query(default=0, ge=0, le=UINT256_MAX, alias="from"),
    to_index: int = Query(default=7, ge=0, le=UINT256_MAX, alias="to"),
) -> PeriodListOut:
    end = max(from_index, to_index)
    return await periods_service.list_periods(
        session, slot_id, from_index=from_index, to_index=end, now=int(time.time())
    )


@router.put("/{slot_id}/house-ad")
async def put_house_ad(
    slot_id: int, body: HouseAdIn, request: Request, session: SessionDep
) -> dict[str, str]:
    rec = await auth_service.get_session(session, request.cookies.get(auth_service.COOKIE_NAME))
    await auth_service.require_slot_owner(session, slot_id, rec.address)
    row = await offchain_service.set_house_ad(
        session, slot_id, media_url=body.media_url, click_url=body.click_url
    )
    return {"slotId": str(row.slot_id), "mediaUrl": row.media_url, "clickUrl": row.click_url}


@router.put("/{slot_id}/listing", response_model=SlotListingOut)
async def put_listing(
    slot_id: int, body: SlotListingIn, request: Request, session: SessionDep
) -> SlotListingOut:
    rec = await auth_service.get_session(session, request.cookies.get(auth_service.COOKIE_NAME))
    await auth_service.require_slot_owner(session, slot_id, rec.address)
    row = await offchain_service.set_listing(
        session,
        slot_id,
        summary=body.summary,
        audience=body.audience,
        categories=body.categories,
    )
    out = slots_service.listing_to_out(row)
    assert out is not None  # set_listing always returns a persisted row
    return out


@router.delete("/{slot_id}/listing", status_code=204)
async def delete_listing(slot_id: int, request: Request, session: SessionDep) -> None:
    rec = await auth_service.get_session(session, request.cookies.get(auth_service.COOKIE_NAME))
    await auth_service.require_slot_owner(session, slot_id, rec.address)
    await offchain_service.delete_listing(session, slot_id)


@router.post("/{slot_id}/domain-verification")
async def domain_verification(
    slot_id: int,
    request: Request,
    session: SessionDep,
    method: Literal["dns_txt", "meta_tag"] = "meta_tag",
    check: bool = False,
) -> dict[str, str | bool | None]:
    rec = await auth_service.get_session(session, request.cookies.get(auth_service.COOKIE_NAME))
    await auth_service.require_slot_owner(session, slot_id, rec.address)
    if check:
        row = await offchain_service.check_domain_verification(
            session, slot_id, request.app.state.settings
        )
    else:
        row = await offchain_service.start_domain_verification(session, slot_id, method=method)
    return {
        "slotId": str(row.slot_id),
        "method": row.method,
        "token": row.token,
        "verified": row.verified_at is not None,
    }
