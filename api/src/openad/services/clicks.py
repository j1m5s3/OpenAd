"""HMAC click tokens and payable-click rules (PROTOCOL.md §11.4, ADR-0014 §5)."""

from __future__ import annotations

import base64
import hashlib
import hmac
from collections import OrderedDict
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from openad.models import Campaign, ClickEvent, Creative, ServeEvent

TOKEN_TTL_SECONDS = 3600
BURST_WINDOW_SECONDS = 2
BURST_MAX_KEYS = 10_000


class BurstWindow:
    """The burst rule's memory: a key that recorded a click less than ``window`` seconds ago
    makes the next click on it a burst duplicate.

    Keys are :func:`burst_key` HMACs, never raw addresses. The map holds at most ``max_keys``
    entries, in the order their last click was recorded: when it is full, the least recently
    recorded key (also the one closest to expiry) is evicted, and every recorded click first
    drops the expired entries, so the map normally holds only the last ``window`` seconds.
    Per process, in memory only: each api instance has its own, and a restart forgets it.
    """

    def __init__(
        self, *, max_keys: int = BURST_MAX_KEYS, window: int = BURST_WINDOW_SECONDS
    ) -> None:
        if max_keys < 1 or window < 1:
            raise ValueError("max_keys and window must be at least 1")
        self.max_keys = max_keys
        self.window = window
        self._until: OrderedDict[str, int] = OrderedDict()  # key -> Unix second its window ends

    def __len__(self) -> int:
        return len(self._until)

    def __contains__(self, key: object) -> bool:
        return key in self._until

    def hit(self, key: str, now: int) -> bool:
        """True if ``key`` is inside its window: a burst duplicate, which neither extends the
        window nor refreshes the key. Otherwise record this click and return False."""
        until = self._until.get(key)
        if until is not None and now < until:
            return True
        self._until.pop(key, None)
        while self._until:
            oldest, oldest_until = next(iter(self._until.items()))
            if now < oldest_until:
                break
            del self._until[oldest]
        self._until[key] = now + self.window
        while len(self._until) > self.max_keys:
            self._until.popitem(last=False)  # the least recently recorded key
        return False


_BURST = BurstWindow()


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


def burst_key(*, secret: str, client: str, slot_id: int) -> str:
    """HMAC of ``client:slot_id``, so the burst map never holds a raw address."""
    return hmac.new(
        secret.encode("utf-8"), f"{client}:{slot_id}".encode(), hashlib.sha256
    ).hexdigest()[:32]


def burst_blocked(key: str, now: int) -> bool:
    """In-process short-TTL discard. True means this click is a burst duplicate."""
    return _BURST.hit(key, now)


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
    client: str,
    burst_rule: bool,
    max_per_hour: int,
) -> tuple[str | None, str | None]:
    """Return (landing_url, ivt_reason). landing_url None → HTTP 404.

    ``client`` is the visitor's key (``openad.ratelimit.client_key``). ``burst_rule`` applies
    the burst discard: ``OPENAD_CLICK_IVT`` is on and that key identifies the visitor
    (``openad.routers.clicks.burst_rule_active``)."""
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
    elif burst_rule and burst_blocked(
        burst_key(secret=secret, client=client, slot_id=parsed.slot_id), now
    ):
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
