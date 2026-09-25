"""Creative media verification and disk cache (ARCHITECTURE §3.5).

Serve never fetches advertiser URLs; only the verifier writes the cache.
"""

from __future__ import annotations

from datetime import UTC, datetime

import httpx
from eth_hash.auto import keccak
from PIL import Image
from sqlalchemy.ext.asyncio import AsyncSession

from openad.config import Settings
from openad.errors import NotFoundError
from openad.logging import get_logger
from openad.models import Creative, CreativeVerification
from openad.models.creative import KIND_MEDIA
from openad.models.offchain import (
    VERIFY_FAILED_CLICK_URL,
    VERIFY_FAILED_DIMENSIONS,
    VERIFY_FAILED_FETCH,
    VERIFY_FAILED_HASH,
    VERIFY_FAILED_MIME,
    VERIFY_FAILED_SIZE,
    VERIFY_FAILED_TIMEOUT,
    VERIFY_PENDING,
    VERIFY_VERIFIED,
)
from openad.services.media_store import dispatch_get, media_store_for

log = get_logger(__name__)

ALLOWED_MIMES = frozenset({"image/png", "image/jpeg", "image/webp", "image/gif"})
FETCH_TIMEOUT_S = 10.0


def keccak_hex(data: bytes) -> str:
    return "0x" + keccak(data).hex()


def sniff_mime(data: bytes) -> str:
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data.startswith(b"GIF87a") or data.startswith(b"GIF89a"):
        return "image/gif"
    return "application/octet-stream"


def image_size(data: bytes) -> tuple[int, int]:
    from io import BytesIO

    with Image.open(BytesIO(data)) as img:
        return int(img.size[0]), int(img.size[1])


def check_click_url(url: str) -> bool:
    return url == "" or url.startswith("https://")


def verify_bytes(
    data: bytes,
    *,
    content_hash: str,
    mime: str,
    width: int,
    height: int,
    click_url: str,
    max_bytes: int,
) -> str:
    """Return VERIFY_VERIFIED or a failed:* status. Pure; used by tests and the fetcher."""
    if len(data) > max_bytes:
        return VERIFY_FAILED_SIZE
    if keccak_hex(data) != content_hash.lower():
        return VERIFY_FAILED_HASH
    sniffed = sniff_mime(data)
    if sniffed not in ALLOWED_MIMES or sniffed != mime:
        return VERIFY_FAILED_MIME
    try:
        w, h = image_size(data)
    except Exception:
        return VERIFY_FAILED_DIMENSIONS
    if w != width or h != height:
        return VERIFY_FAILED_DIMENSIONS
    if not check_click_url(click_url):
        return VERIFY_FAILED_CLICK_URL
    return VERIFY_VERIFIED


def _resolve_uri(uri: str, ipfs_gateway: str) -> str:
    if uri.startswith("ipfs://"):
        path = uri.removeprefix("ipfs://").removeprefix("ipfs/")
        return ipfs_gateway.rstrip("/") + "/" + path
    return uri


async def fetch_media(uri: str, *, settings: Settings) -> tuple[bytes | None, str]:
    url = _resolve_uri(uri, settings.ipfs_gateway)
    if not url.startswith("https://") and not (settings.is_dev and url.startswith("http://")):
        return None, VERIFY_FAILED_FETCH
    try:
        async with httpx.AsyncClient(timeout=FETCH_TIMEOUT_S, follow_redirects=True) as client:
            async with client.stream("GET", url) as resp:
                resp.raise_for_status()
                chunks: list[bytes] = []
                total = 0
                async for chunk in resp.aiter_bytes():
                    total += len(chunk)
                    if total > settings.max_media_bytes:
                        return None, VERIFY_FAILED_SIZE
                    chunks.append(chunk)
                return b"".join(chunks), VERIFY_VERIFIED
    except httpx.TimeoutException:
        return None, VERIFY_FAILED_TIMEOUT
    except Exception:
        return None, VERIFY_FAILED_FETCH


async def verify_creative(session: AsyncSession, creative_id: int, settings: Settings) -> str:
    creative = await session.get(Creative, creative_id)
    if creative is None:
        raise NotFoundError(f"creative {creative_id} not found")
    row = await session.get(CreativeVerification, creative_id)
    if row is None:
        row = CreativeVerification(creative_id=creative_id, status=VERIFY_PENDING)
        session.add(row)

    if creative.kind != KIND_MEDIA:
        row.status = VERIFY_PENDING
        row.error = "nft_ref verification deferred to scheduled owner check"
        row.checked_at = datetime.now(UTC)
        await session.commit()
        return row.status

    data, fetch_status = await fetch_media(creative.uri, settings=settings)
    if data is None:
        row.status = fetch_status
        row.error = fetch_status
        row.checked_at = datetime.now(UTC)
        await session.commit()
        return row.status

    status = verify_bytes(
        data,
        content_hash=creative.content_hash or "",
        mime=creative.mime,
        width=creative.width,
        height=creative.height,
        click_url=creative.click_url,
        max_bytes=settings.max_media_bytes,
    )
    row.status = status
    row.error = None if status == VERIFY_VERIFIED else status
    row.checked_at = datetime.now(UTC)
    if status == VERIFY_VERIFIED:
        ref = await media_store_for(settings).put(f"{creative_id}.bin", data)
        row.cached_path = ref
    await session.commit()
    log.info("media.verify", creative_id=creative_id, status=status)
    return status


async def verify_pending(session: AsyncSession, settings: Settings) -> int:
    from datetime import timedelta

    from sqlalchemy import or_, select

    cutoff = datetime.now(UTC) - timedelta(seconds=settings.verify_interval_seconds)
    ids = (
        (
            await session.execute(
                select(CreativeVerification.creative_id).where(
                    CreativeVerification.status == VERIFY_PENDING,
                    or_(
                        CreativeVerification.checked_at.is_(None),
                        CreativeVerification.checked_at < cutoff,
                    ),
                )
            )
        )
        .scalars()
        .all()
    )
    count = 0
    for cid in ids:
        await verify_creative(session, cid, settings)
        count += 1
    return count


async def read_cached(ref: str, *, settings: Settings) -> bytes | None:
    """Read cached media bytes for a `cached_path` value, dispatching by ref scheme so a
    database holding refs from an earlier backend keeps reading after a switch."""
    return await dispatch_get(ref, settings=settings)
