from __future__ import annotations

from fastapi import APIRouter, Request, Response

from openad.db.session import SessionDep
from openad.schemas.dashboard import NonceOut, SiweIn
from openad.services import auth as auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/nonce", response_model=NonceOut)
async def nonce(session: SessionDep) -> NonceOut:
    return NonceOut(nonce=await auth_service.issue_nonce(session))


@router.post("/verify")
async def verify(
    body: SiweIn, request: Request, response: Response, session: SessionDep
) -> dict[str, str]:
    settings = request.app.state.settings
    rec = await auth_service.verify_siwe(
        session,
        message=body.message,
        signature=body.signature,
        chain_id=settings.chain_id,
        ttl_seconds=settings.session_ttl_seconds,
    )
    response.set_cookie(
        auth_service.COOKIE_NAME,
        rec.id,
        httponly=True,
        samesite="lax",
        secure=not settings.is_dev,
        max_age=settings.session_ttl_seconds,
        path="/",
    )
    return {"address": rec.address}


@router.post("/logout")
async def logout(request: Request, response: Response, session: SessionDep) -> dict[str, bool]:
    await auth_service.logout(session, request.cookies.get(auth_service.COOKIE_NAME))
    response.delete_cookie(auth_service.COOKIE_NAME, path="/")
    return {"ok": True}
