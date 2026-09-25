"""Creative media verification and disk cache (ARCHITECTURE §3.5).

Serve never fetches advertiser URLs; only the verifier writes the cache.
"""

from __future__ import annotations

import ipaddress
import socket
from datetime import UTC, datetime
from urllib.parse import urljoin, urlsplit

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
# Manual redirect cap (ROADMAP 6.9): `httpx.AsyncClient` runs with `follow_redirects=False` and
# every hop, including the first, is re-validated by `_hop_allowed` — an automatic follower
# would only ever see the *first* URL's scheme/host before handing control to the server.
MAX_REDIRECT_HOPS = 3


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


# Blocked by name outside dev, regardless of what they resolve to: `getaddrinfo` sends
# `localhost`/`*.localhost` straight to loopback without a real DNS lookup, and
# `*.internal` (e.g. GCP's `metadata.google.internal`) is a cloud-metadata convention.
_BLOCKED_HOSTNAMES = frozenset({"localhost"})
_BLOCKED_HOSTNAME_SUFFIXES = (".localhost", ".internal")


def _parse_ip_literal(host: str) -> ipaddress.IPv4Address | ipaddress.IPv6Address | None:
    """Best-effort IP-literal detection. `ipaddress.ip_address` is deliberately strict and
    rejects legacy IPv4 forms (`127.1`, `0x7f000001`, `2130706433`, `017700000001`) that
    `socket.inet_aton` (and `getaddrinfo`, and most HTTP clients/browsers) still normalizes to
    127.0.0.1 — so we fall back to it. `inet_aton` never accepts a real hostname (it requires
    every part to be numeric), so this can't misclassify `ads.example` as an IP. It raises
    `ValueError` rather than `OSError` for a string it can't hand to C at all (an embedded NUL),
    so both mean "not an IP literal" here; `_blocked_host` refuses such a host on its own."""
    try:
        return ipaddress.ip_address(host)
    except ValueError:
        pass
    try:
        return ipaddress.IPv4Address(socket.inet_aton(host))
    except (OSError, ValueError):
        return None


def _blocked_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    """True if `ip` must not be fetched: not `is_global`, or multicast, or reserved.

    `is_global` is False for private/loopback/link-local/unspecified and the 100.64.0.0/10 CGNAT
    range (which is not `is_private`), but it counts multicast as global, and on Python 3.12 it
    is also True for some IPv6 addresses inside the IETF-reserved `::/8` block, such as the
    IPv4-compatible `::a00:1` and the NAT64 `64:ff9b::a00:1` (both embed 10.0.0.1, reachable
    through a tunnel or NAT64 gateway). `is_reserved` catches that block (and IPv4 240.0.0.0/4).
    The deprecated IPv6 site-local range `fec0::/10` is also `is_global` there and in no other
    category, so it's refused explicitly. IPv4-mapped IPv6 (`::ffff:a.b.c.d`) is unwrapped
    first, so the underlying IPv4 address is what's judged (the mapped range itself is in
    `::/8`, so without unwrapping every mapped address would count as reserved)."""
    if isinstance(ip, ipaddress.IPv6Address):
        if ip.ipv4_mapped is not None:
            ip = ip.ipv4_mapped
        elif ip.is_site_local:
            return True
    return not ip.is_global or ip.is_multicast or ip.is_reserved


def _blocked_host(host: str) -> bool:
    """Host checks that apply only outside dev (`_hop_allowed` gates this). Fails closed: a
    host that can't be a real name or IP literal is refused, not waved through."""
    # A trailing dot is the same host written fully qualified (`localhost.`, `127.0.0.1.`,
    # `metadata.google.internal.`), so strip it before the name and IP checks; otherwise it
    # alone gets past both.
    host = host.lower().rstrip(".")
    # Empty ("." or ".."), or a NUL/control character/whitespace no real host has: a NUL can
    # truncate the name at a C resolver (`127.0.0.1\x00.ads.example`).
    if not host or any(c.isspace() or (c.isascii() and not c.isprintable()) for c in host):
        return True
    if host in _BLOCKED_HOSTNAMES or host.endswith(_BLOCKED_HOSTNAME_SUFFIXES):
        return True
    ip = _parse_ip_literal(host)
    return ip is not None and _blocked_ip(ip)


def _hop_allowed(url: str, *, is_dev: bool) -> bool:
    """Scheme + host check applied to the initial URL and every redirect hop alike.

    In dev/test (local Anvil + the `sim/` daemon, ADR-0012) only the scheme is checked, so
    creatives the sim registers at `http://127.0.0.1:<port>/media/*` against an api running
    `OPENAD_ENV=dev` still verify. The host block below is a production-only SSRF guard
    (docs/threat-model.md T17): after stripping trailing dots, the host must not be empty,
    contain whitespace or a control character, or be `localhost`/`*.localhost`/`*.internal`,
    and an IP literal must be `is_global` and not multicast, reserved or IPv6 site-local.
    """
    try:
        parts = urlsplit(url)
    except ValueError:
        return False  # malformed URL (e.g. an unterminated "[" in a bracketed IPv6 host)
    if parts.scheme != "https" and not (is_dev and parts.scheme == "http"):
        return False
    host = parts.hostname
    if not host:
        return False
    if is_dev:
        return True
    return not _blocked_host(host)


async def fetch_media(uri: str, *, settings: Settings) -> tuple[bytes | None, str]:
    url = _resolve_uri(uri, settings.ipfs_gateway)
    try:
        if not _hop_allowed(url, is_dev=settings.is_dev):
            return None, VERIFY_FAILED_FETCH
        async with httpx.AsyncClient(timeout=FETCH_TIMEOUT_S, follow_redirects=False) as client:
            for _ in range(MAX_REDIRECT_HOPS + 1):
                async with client.stream("GET", url) as resp:
                    if resp.has_redirect_location:
                        url = urljoin(url, resp.headers["location"])
                        if not _hop_allowed(url, is_dev=settings.is_dev):
                            return None, VERIFY_FAILED_FETCH
                        continue
                    resp.raise_for_status()
                    chunks: list[bytes] = []
                    total = 0
                    async for chunk in resp.aiter_bytes():
                        total += len(chunk)
                        if total > settings.max_media_bytes:
                            return None, VERIFY_FAILED_SIZE
                        chunks.append(chunk)
                    return b"".join(chunks), VERIFY_VERIFIED
            return None, VERIFY_FAILED_FETCH  # too many redirect hops
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
