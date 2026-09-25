"""Creative verification + media cache (ARCHITECTURE §3.5)."""

from __future__ import annotations

from collections.abc import Callable
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
    VERIFY_FAILED_FETCH,
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


def _mock_client(handler: Callable[[httpx.Request], httpx.Response]) -> type[httpx.AsyncClient]:
    """An `httpx.AsyncClient` subclass wired to a `MockTransport`, for monkeypatching
    `media.httpx.AsyncClient` — `fetch_media` builds its own client internally, so tests inject
    the transport this way rather than passing one in."""
    transport = httpx.MockTransport(handler)

    class _Client(httpx.AsyncClient):
        def __init__(self, *args: object, **kwargs: object) -> None:
            kwargs["transport"] = transport
            super().__init__(*args, **kwargs)

    return _Client


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


async def test_fetch_media_redirect_to_http_refused(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A hop that downgrades to plain http is refused outside dev (ROADMAP 6.9). The forbidden
    target would serve a valid PNG if it were ever reached, so a broken per-hop check (e.g. one
    that only ran on the first URL) would make this test pass with the wrong data instead of
    coincidentally hitting the redirect cap."""
    requested: list[str] = []
    png = tiny_png()

    def handler(request: httpx.Request) -> httpx.Response:
        requested.append(str(request.url))
        if str(request.url) == "https://ads.example/start.png":
            return httpx.Response(302, headers={"location": "http://ads.example/next.png"})
        return httpx.Response(200, content=png)

    import openad.services.media as media

    monkeypatch.setattr(media.httpx, "AsyncClient", _mock_client(handler))
    prod_settings = settings.model_copy(update={"env": "prod"})
    data, status = await fetch_media("https://ads.example/start.png", settings=prod_settings)
    assert data is None
    assert status == VERIFY_FAILED_FETCH
    assert requested == ["https://ads.example/start.png"], "the http hop must never be requested"


async def test_fetch_media_redirect_to_private_ip_refused(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A hop that points at a private IP literal is refused outside dev (SSRF guard, ROADMAP
    6.9). Uses prod settings: the host block is a production-only guard (L1 fix), since the
    sim registers creatives against loopback URLs while the api runs in dev (ADR-0012). As
    above, the forbidden target would serve a valid PNG if ever reached."""
    requested: list[str] = []
    png = tiny_png()

    def handler(request: httpx.Request) -> httpx.Response:
        requested.append(str(request.url))
        if str(request.url) == "https://ads.example/start.png":
            return httpx.Response(302, headers={"location": "https://10.0.0.1/internal"})
        return httpx.Response(200, content=png)

    import openad.services.media as media

    monkeypatch.setattr(media.httpx, "AsyncClient", _mock_client(handler))
    prod_settings = settings.model_copy(update={"env": "prod"})
    data, status = await fetch_media("https://ads.example/start.png", settings=prod_settings)
    assert data is None
    assert status == VERIFY_FAILED_FETCH
    assert requested == ["https://ads.example/start.png"], "private-IP hop must never be requested"


async def test_fetch_media_relative_redirect_accepted(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A relative Location header resolves against the current hop's own URL (ROADMAP 6.9)."""
    png = tiny_png()

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path == "/start.png":
            return httpx.Response(302, headers={"location": "/final.png"})
        if path == "/final.png":
            return httpx.Response(200, content=png)
        raise AssertionError(f"unexpected path {path}")

    import openad.services.media as media

    monkeypatch.setattr(media.httpx, "AsyncClient", _mock_client(handler))
    data, status = await fetch_media("https://ads.example/start.png", settings=settings)
    assert data == png
    assert status == VERIFY_VERIFIED


async def test_fetch_media_protocol_relative_redirect_to_private_ip_refused(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A protocol-relative Location ("//host/path") inherits the current scheme via `urljoin`
    and gets the same host check as any other hop (ROADMAP 6.9); prod settings, see above."""
    requested: list[str] = []
    png = tiny_png()

    def handler(request: httpx.Request) -> httpx.Response:
        requested.append(str(request.url))
        if str(request.url) == "https://ads.example/start.png":
            return httpx.Response(302, headers={"location": "//10.0.0.1/x"})
        return httpx.Response(200, content=png)

    import openad.services.media as media

    monkeypatch.setattr(media.httpx, "AsyncClient", _mock_client(handler))
    prod_settings = settings.model_copy(update={"env": "prod"})
    data, status = await fetch_media("https://ads.example/start.png", settings=prod_settings)
    assert data is None
    assert status == VERIFY_FAILED_FETCH
    assert requested == ["https://ads.example/start.png"]


async def test_fetch_media_malformed_bracketed_host_fails_closed(settings: Settings) -> None:
    """A malformed URL must fail closed, not raise: `register_media` is permissionless, so
    one bad `uri` would otherwise make `verify_pending` raise on every indexer pass and starve
    every other pending creative behind it (L1 fix, ROADMAP 6.9)."""
    data, status = await fetch_media("https://[x/", settings=settings)
    assert data is None
    assert status == VERIFY_FAILED_FETCH


async def test_fetch_media_dev_loopback_accepted(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    """In dev/test only the scheme is checked: `sim/` registers creatives at
    `http://127.0.0.1:<controlPort>/media/*` against an api running `OPENAD_ENV=dev`
    (ADR-0012), and those must still verify (L1 fix, ROADMAP 6.9)."""
    png = tiny_png()

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=png)

    import openad.services.media as media

    monkeypatch.setattr(media.httpx, "AsyncClient", _mock_client(handler))
    data, status = await fetch_media("http://127.0.0.1:8610/media/1.png", settings=settings)
    assert data == png
    assert status == VERIFY_VERIFIED


@pytest.mark.parametrize(
    "host",
    [
        "localhost",
        "sub.localhost",
        "metadata.google.internal",
        "svc.internal",
        "127.1",  # legacy short form -> 127.0.0.1
        "0x7f000001",  # hex form -> 127.0.0.1
        "2130706433",  # decimal 32-bit form -> 127.0.0.1
        "017700000001",  # octal form -> 127.0.0.1
        "100.64.0.1",  # CGNAT shared address space: not ipaddress.is_private
        "224.0.0.1",  # multicast: ipaddress.is_global is True for this
        "[::ffff:127.0.0.1]",  # IPv4-mapped IPv6 loopback
        # A trailing dot is the same host, fully qualified: it must not dodge the checks above.
        "localhost.",
        "foo.localhost.",
        "metadata.google.internal.",
        "127.0.0.1.",
        ".",  # empty once the trailing dot is stripped: fail closed
        # IPv6 that ipaddress.is_global calls global on py3.12:
        "[::a00:1]",  # IPv4-compatible (reserved ::/8), embeds 10.0.0.1
        "[64:ff9b::a00:1]",  # NAT64 well-known prefix (reserved ::/8), embeds 10.0.0.1
        "[fec0::1]",  # deprecated IPv6 site-local (fec0::/10)
    ],
)
async def test_fetch_media_blocks_hostname_and_numeric_ip_forms(
    host: str, settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Outside dev, each of these must be refused before any request is made, even though it
    would serve a valid PNG if ever reached (ROADMAP 6.9; docs/threat-model.md T17)."""
    requested: list[str] = []
    png = tiny_png()

    def handler(request: httpx.Request) -> httpx.Response:
        requested.append(str(request.url))
        return httpx.Response(200, content=png)

    import openad.services.media as media

    monkeypatch.setattr(media.httpx, "AsyncClient", _mock_client(handler))
    prod_settings = settings.model_copy(update={"env": "prod"})
    data, status = await fetch_media(f"https://{host}/x.png", settings=prod_settings)
    assert data is None
    assert status == VERIFY_FAILED_FETCH
    assert requested == []


async def test_fetch_media_nul_in_host_fails_closed(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    """`socket.inet_aton` raises `ValueError`, not `OSError`, on an embedded NUL: the IP-literal
    parser must read that as "not an IP literal" instead of raising, and the host check must
    still refuse the host on its own (a NUL can truncate the name at a C resolver), so the hop
    never reaches the transport (ROADMAP 6.9; docs/threat-model.md T17)."""
    import openad.services.media as media

    assert media._parse_ip_literal("127.0.0.1\x00") is None
    assert media._blocked_host("127.0.0.1\x00")
    assert media._blocked_host("127.0.0.1\x00.ads.example")

    requested: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requested.append(str(request.url))
        return httpx.Response(200, content=tiny_png())

    monkeypatch.setattr(media.httpx, "AsyncClient", _mock_client(handler))
    prod_settings = settings.model_copy(update={"env": "prod"})
    data, status = await fetch_media("https://127.0.0.1\x00/x.png", settings=prod_settings)
    assert data is None
    assert status == VERIFY_FAILED_FETCH
    assert requested == []


async def test_fetch_media_two_hop_redirect_accepted(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Up to 3 https redirect hops are followed manually (ROADMAP 6.9)."""
    png = tiny_png()

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path == "/start.png":
            return httpx.Response(302, headers={"location": "https://ads.example/hop1.png"})
        if path == "/hop1.png":
            return httpx.Response(302, headers={"location": "https://ads.example/final.png"})
        if path == "/final.png":
            return httpx.Response(200, content=png)
        raise AssertionError(f"unexpected path {path}")

    import openad.services.media as media

    monkeypatch.setattr(media.httpx, "AsyncClient", _mock_client(handler))
    data, status = await fetch_media("https://ads.example/start.png", settings=settings)
    assert data == png
    assert status == VERIFY_VERIFIED


async def test_fetch_media_too_many_redirects_refused(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A 4th redirect hop exceeds the cap and is refused (ROADMAP 6.9)."""
    count = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        count["n"] += 1
        return httpx.Response(302, headers={"location": f"https://ads.example/hop{count['n']}"})

    import openad.services.media as media

    monkeypatch.setattr(media.httpx, "AsyncClient", _mock_client(handler))
    data, status = await fetch_media("https://ads.example/start", settings=settings)
    assert data is None
    assert status == VERIFY_FAILED_FETCH
    assert count["n"] == 4  # initial + 3 manual redirects; the 4th redirect is the one refused


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
