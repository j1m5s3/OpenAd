"""HMAC click tokens and payable-click rules (PROTOCOL.md §11.4, ADR-0014 §5)."""

from __future__ import annotations

import base64
import hashlib
import hmac
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from openad.models import Campaign, ClickEvent, Creative, ServeEvent

TOKEN_TTL_SECONDS = 3600
_BURST: dict[str, int] = {}


@dataclass(frozen=True)
class ClickToken:
    slot_id: int
    campaign_id: int
    creative_id: int
    serve_event_id: int
    exp: int


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _unb64(text: str) -> bytes:
    pad = "=" * ((4 - len(text) % 4) % 4)
    return base64.urlsafe_b64decode(text + pad)


def mint_click_token(*, secret: str, token: ClickToken) -> str:
    payload = (
        f"{token.slot_id}:{token.campaign_id}:{token.creative_id}:"
        f"{token.serve_event_id}:{token.exp}"
    )
    sig = hmac.new(secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    return _b64(f"{payload}:{sig}".encode())


def parse_click_token(*, secret: str, raw: str, now: int) -> ClickToken | None:
    try:
        decoded = _unb64(raw).decode("utf-8")
        payload, sig = decoded.rsplit(":", 1)
        expected = hmac.new(
            secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(sig, expected):
            return None
        slot_s, camp_s, cr_s, ev_s, exp_s = payload.split(":")
        exp = int(exp_s)
        if now >= exp:
            return None
        return ClickToken(
            slot_id=int(slot_s),
            campaign_id=int(camp_s),
            creative_id=int(cr_s),
            serve_event_id=int(ev_s),
            exp=exp,
        )
    except (ValueError, UnicodeDecodeError):
        return None


def token_hash(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def burst_key(*, secret: str, ip: str, slot_id: int) -> str:
    return hmac.new(secret.encode("utf-8"), f"{ip}:{slot_id}".encode(), hashlib.sha256).hexdigest()[
        :32
    ]


def burst_blocked(key: str, now: int, *, window: int = 2) -> bool:
    """In-process short-TTL discard. True means this click is a burst duplicate."""
    until = _BURST.get(key, 0)
    if now < until:
        return True
    _BURST[key] = now + window
    return False


async def hourly_payable_count(session: AsyncSession, campaign_id: int, now: int) -> int:
    since = now - 3600
    stmt = (
        select(func.count())
        .select_from(ClickEvent)
        .where(
            ClickEvent.campaign_id == campaign_id,
            ClickEvent.payable.is_(True),
            ClickEvent.at >= since,
        )
    )
    return int((await session.execute(stmt)).scalar_one())


async def resolve_click(
    session: AsyncSession,
    *,
    secret: str,
    raw_token: str,
    now: int,
    ip: str,
    ivt: bool,
    max_per_hour: int,
) -> tuple[str | None, str | None]:
    """Return (landing_url, ivt_reason). landing_url None → HTTP 404."""
    parsed = parse_click_token(secret=secret, raw=raw_token, now=now)
    if parsed is None:
        return None, "invalid"
    digest = token_hash(raw_token)
    existing = (
        await session.execute(select(ClickEvent).where(ClickEvent.token_hash == digest))
    ).scalar_one_or_none()
    if existing is not None:
        return None, "used"

    serve = await session.get(ServeEvent, parsed.serve_event_id)
    if (
        serve is None
        or serve.slot_id != parsed.slot_id
        or serve.campaign_id != parsed.campaign_id
        or serve.served_kind != "campaign"
    ):
        return None, "no_serve"

    creative = await session.get(Creative, parsed.creative_id)
    if creative is None or not creative.click_url:
        return None, "invalid"

    camp = await session.get(Campaign, parsed.campaign_id)
    gsp = int(serve.gsp_cpc or 0)
    reason: str | None = None
    if camp is None or camp.closed or camp.creative_id != parsed.creative_id:
        reason = "closed"
    elif gsp <= 0 or camp.remaining < gsp:
        reason = "budget"
    elif ivt and burst_blocked(burst_key(secret=secret, ip=ip, slot_id=parsed.slot_id), now):
        reason = "burst"
    elif await hourly_payable_count(session, parsed.campaign_id, now) >= max_per_hour:
        reason = "rate"

    payable = reason is None
    session.add(
        ClickEvent(
            token_hash=digest,
            slot_id=parsed.slot_id,
            campaign_id=parsed.campaign_id,
            creative_id=parsed.creative_id,
            serve_event_id=parsed.serve_event_id,
            payable=payable,
            ivt_reason=reason,
            gsp_cpc=gsp if payable else 0,
            at=now,
        )
    )
    await session.commit()
    return creative.click_url, reason
