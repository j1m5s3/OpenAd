"""Creative verification + media cache (ARCHITECTURE §3.5)."""

from __future__ import annotations

from io import BytesIO
from pathlib import Path

import httpx
import pytest
from PIL import Image
from sqlalchemy.ext.asyncio import AsyncSession

from openad.config import Settings
from openad.models.offchain import (
    VERIFY_FAILED_CLICK_URL,
    VERIFY_FAILED_DIMENSIONS,
    VERIFY_FAILED_HASH,
    VERIFY_FAILED_MIME,
    VERIFY_FAILED_SIZE,
    VERIFY_FAILED_TIMEOUT,
    VERIFY_VERIFIED,
)
from openad.services.media import fetch_media, keccak_hex, verify_bytes
from tests.conftest import (
    make_creative,
    make_lease,
    make_slot,
    make_verified,
)


def tiny_png(width: int = 300, height: int = 250) -> bytes:
    buf = BytesIO()
    Image.new("RGB", (width, height), (0, 82, 255)).save(buf, format="PNG")
    return buf.getvalue()


def test_verify_bytes_failures() -> None:
    png = tiny_png()
    digest = keccak_hex(png)
    kwargs = {
        "content_hash": digest,
        "mime": "image/png",
        "width": 300,
        "height": 250,
        "click_url": "https://advertiser.example/",
        "max_bytes": 2 * 1024 * 1024,
    }
    assert verify_bytes(png, **kwargs) == VERIFY_VERIFIED
    assert verify_bytes(png, **{**kwargs, "content_hash": "0x" + "00" * 32}) == VERIFY_FAILED_HASH
    assert verify_bytes(png, **{**kwargs, "mime": "image/jpeg"}) == VERIFY_FAILED_MIME
    assert verify_bytes(png, **{**kwargs, "width": 1}) == VERIFY_FAILED_DIMENSIONS
    assert verify_bytes(png, **{**kwargs, "max_bytes": 10}) == VERIFY_FAILED_SIZE
    insecure = {**kwargs, "click_url": "http://insecure.test"}
    assert verify_bytes(png, **insecure) == VERIFY_FAILED_CLICK_URL


async def test_fetch_timeout(settings: Settings, monkeypatch: pytest.MonkeyPatch) -> None:
    class FakeClient:
        def __init__(self, *a: object, **k: object) -> None:
            pass

        async def __aenter__(self) -> FakeClient:
            return self

        async def __aexit__(self, *a: object) -> None:
            return None

        def stream(self, *a: object, **k: object) -> FakeClient:
            raise httpx.TimeoutException("slow")

    import openad.services.media as media

    monkeypatch.setattr(media.httpx, "AsyncClient", FakeClient)  # type: ignore[attr-defined]
    data, status = await fetch_media("https://ads.example/banner.png", settings=settings)
    assert data is None and status == VERIFY_FAILED_TIMEOUT


async def test_serve_media_etag(
    client: httpx.AsyncClient, session: AsyncSession, settings: Settings
) -> None:
    import time

    png = tiny_png()
    digest = keccak_hex(png)
    slot = make_slot(first_period_start=int(time.time()) - 60, period_seconds=3600)
    creative = make_creative()
    creative.content_hash = digest
    cache_dir: Path = settings.media_cache_path
    cache_dir.mkdir(parents=True, exist_ok=True)
    path = cache_dir / "7.bin"
    path.write_bytes(png)
    verification = make_verified()
    verification.cached_path = str(path)
    session.add_all([slot, creative, verification, make_lease(slot, 0, approval_mode=1)])
    await session.commit()

    res = await client.get("/v1/serve/1/media")
    assert res.status_code == 200
    assert res.content == png
    assert res.headers["etag"] == f'"{digest}"'
    assert res.headers["content-type"].startswith("image/png")

    again = await client.get("/v1/serve/1/media", headers={"If-None-Match": f'"{digest}"'})
    assert again.status_code == 304
