"""House ads and domain verification (off-chain only)."""

from __future__ import annotations

import re
import secrets
from datetime import UTC, datetime

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from openad.errors import NotFoundError
from openad.models import DomainVerification, HouseAd, Slot

META_RE = re.compile(
    r'<meta\s+name=["\']openad-site-verification["\']\s+content=["\']([^"\']+)["\']',
    re.IGNORECASE,
)


async def set_house_ad(
    session: AsyncSession, slot_id: int, *, media_url: str, click_url: str
) -> HouseAd:
    slot = await session.get(Slot, slot_id)
    if slot is None:
        raise NotFoundError(f"slot {slot_id} not found")
    row = await session.get(HouseAd, slot_id)
    if row is None:
        row = HouseAd(
            slot_id=slot_id,
            media_url=media_url,
            click_url=click_url,
            updated_at=datetime.now(UTC),
        )
        session.add(row)
    else:
        row.media_url = media_url
        row.click_url = click_url
        row.updated_at = datetime.now(UTC)
    await session.commit()
    return row


async def start_domain_verification(
    session: AsyncSession, slot_id: int, *, method: str
) -> DomainVerification:
    slot = await session.get(Slot, slot_id)
    if slot is None:
        raise NotFoundError(f"slot {slot_id} not found")
    row = await session.get(DomainVerification, slot_id)
    token = secrets.token_hex(16)
    if row is None:
        row = DomainVerification(slot_id=slot_id, method=method, token=token)
        session.add(row)
    else:
        row.method = method
        row.token = token
        row.verified_at = None
    await session.commit()
    return row


async def check_domain_verification(session: AsyncSession, slot_id: int) -> DomainVerification:
    slot = await session.get(Slot, slot_id)
    if slot is None:
        raise NotFoundError(f"slot {slot_id} not found")
    row = await session.get(DomainVerification, slot_id)
    if row is None:
        raise NotFoundError("no domain verification started")
    row.last_checked_at = datetime.now(UTC)
    ok = False
    if row.method == "meta_tag":
        ok = await _check_meta(slot.domain, row.token)
    elif row.method == "dns_txt":
        ok = await _check_dns(slot.domain, row.token)
    if ok:
        row.verified_at = datetime.now(UTC)
    await session.commit()
    return row


async def _check_meta(domain: str, token: str) -> bool:
    url = f"https://{domain}/"
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            resp = await client.get(url)
            found = META_RE.search(resp.text)
            return bool(found and found.group(1) == token)
    except Exception:
        return False


async def _check_dns(domain: str, token: str) -> bool:
    try:
        import dns.asyncresolver
    except ImportError:
        return False
    try:
        answers = await dns.asyncresolver.resolve(f"_openad.{domain}", "TXT")
        expected = f"openad-verification={token}"
        for rdata in answers:
            texts = [t.decode() if isinstance(t, bytes) else str(t) for t in rdata.strings]
            if expected in texts or expected in "".join(texts):
                return True
    except Exception:
        return False
    return False
