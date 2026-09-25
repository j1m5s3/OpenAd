"""Creative verification + media cache (ARCHITECTURE §3.5)."""

from __future__ import annotations

import asyncio
import gzip
from collections.abc import AsyncIterator, Callable
from io import BytesIO
from pathlib import Path

import httpx
import pytest
from PIL import Image
from sqlalchemy.ext.asyncio import AsyncSession

from openad.config import Settings
from openad.models import CreativeVerification
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


class _BytesStream(httpx.AsyncByteStream):
    """Wraps fixed bytes as a genuine, not-yet-consumed stream.

    `httpx.Response(200, content=b"...")` looks convenient, but httpx treats a response built
    from `content=` as already fully read and buffered: `aiter_bytes()` still works (it falls
    back to the cached `.content`), but `fetch_media` now reads with `aiter_raw()` (fix round 1,
    ROADMAP 6.9 step 39, decompression-bomb guard), which raises `httpx.StreamConsumed` against
    that pre-consumed state. A real stream, even a one-chunk one, doesn't have this problem.
    """

    def __init__(self, data: bytes) -> None:
        self._data = data

    async def __aiter__(self) -> AsyncIterator[bytes]:
        yield self._data


def _content_response(
    status_code: int, content: bytes, *, headers: dict[str, str] | None = None
) -> httpx.Response:
    return httpx.Response(status_code, headers=headers, stream=_BytesStream(content))


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


async def test_fetch_media_slow_drip_times_out(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A host that trickles a few bytes at a time, always well inside a single httpx read,
    never trips `FETCH_TIMEOUT_S` — only the OVERALL deadline around the whole fetch catches it
    (ROADMAP 6.9 step 39; docs/threat-model.md T18). The drip is a finite 10 chunks (0.8s of
    real sleep), so this stays fast and deterministic: with the small deadline below it always
    times out well before finishing, and removing that deadline (the mutation check for this
    test) doesn't hang, it just finishes — successfully — instead of timing out."""

    class _SlowDripStream(httpx.AsyncByteStream):
        async def __aiter__(self) -> AsyncIterator[bytes]:
            for _ in range(10):
                await asyncio.sleep(0.08)
                yield b"a"

    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, stream=_SlowDripStream())

    import openad.services.media as media

    monkeypatch.setattr(media.httpx, "AsyncClient", _mock_client(handler))
    fast = settings.model_copy(update={"media_fetch_deadline_seconds": 0.3})
    data, status = await fetch_media("https://ads.example/drip.png", settings=fast)
    assert data is None
    assert status == VERIFY_FAILED_TIMEOUT


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
        return _content_response(200, png)

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
        return _content_response(200, png)

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
            return _content_response(200, png)
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
        return _content_response(200, png)

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
        return _content_response(200, png)

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
        return _content_response(200, png)

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
        return _content_response(200, tiny_png())

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
            return _content_response(200, png)
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


async def test_fetch_media_refuses_non_identity_content_encoding(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A gzip-bomb `uri` must be refused, not decoded: `max_media_bytes` is checked against wire
    bytes read via `aiter_raw()`, so a compressed body would otherwise be free to expand far past
    the cap in memory before the size check ever sees it (fix round 1, ROADMAP 6.9 step 39;
    docs/threat-model.md T18 — the same OOM/crash-loop risk on a pending malicious creative).
    `Content-Encoding` is trusted from the response, never the request's own `Accept-Encoding`,
    since a malicious server can ignore what it was asked for."""
    compressed = gzip.compress(tiny_png() * 100)

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["accept-encoding"] == "identity"
        return _content_response(200, compressed, headers={"content-encoding": "gzip"})

    import openad.services.media as media

    monkeypatch.setattr(media.httpx, "AsyncClient", _mock_client(handler))
    data, status = await fetch_media("https://ads.example/bomb.png", settings=settings)
    assert data is None
    assert status == VERIFY_FAILED_FETCH


async def test_verify_pending_pass_budget_leaves_rest_pending(
    session: AsyncSession, settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The indexer's verify pass has a time budget (ROADMAP 6.9 step 39): creatives it doesn't
    reach in the budget stay `pending` for the next pass, so `CreativeRegistered` (permissionless)
    plus a slow `uri` can never block block indexing for longer than one budget plus one fetch
    deadline (docs/threat-model.md T18). An injected fake clock makes this deterministic instead
    of depending on how long a real (mocked-out) `verify_creative` call takes."""
    import openad.services.media as media

    for cid in (1, 2, 3):
        session.add(make_creative(creative_id=cid))
        session.add(CreativeVerification(creative_id=cid, status=VERIFY_PENDING))
    await session.commit()

    calls: list[int] = []

    async def fake_verify_creative(s: AsyncSession, creative_id: int, st: Settings) -> str:
        calls.append(creative_id)
        return VERIFY_FAILED_FETCH

    monkeypatch.setattr(media, "verify_creative", fake_verify_creative)

    # clock() is called once to set the deadline (0.0 + budget), then once per candidate id to
    # decide whether there is still time: 0.0 and 5.0 are inside a 10s budget, 11.0 is past it,
    # so id 3 is left pending for the next pass.
    ticks = iter([0.0, 0.0, 5.0, 11.0])
    budget_settings = settings.model_copy(update={"verify_pass_budget_seconds": 10})
    count = await media.verify_pending(session, budget_settings, clock=lambda: next(ticks))

    assert count == 2
    assert calls == [1, 2]
    still_pending = await session.get(CreativeVerification, 3)
    assert still_pending is not None
    assert still_pending.status == VERIFY_PENDING


async def test_verify_pending_processes_in_creative_id_order(
    session: AsyncSession, settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    """FIFO by `creative_id` (roughly registration order, ROADMAP 6.9 step 39): a pass that runs
    out of budget must always skip the same, highest-id creatives, not an arbitrary subset per
    backend. The rows are added out of id order here, so a broken or missing `order_by` (e.g.
    one that fell back to insertion order or an unordered scan) would still pass by accident on a
    naive read; asserting the exact processing order catches that."""
    import openad.services.media as media

    for cid in (3, 1, 4, 2):
        session.add(make_creative(creative_id=cid))
        session.add(CreativeVerification(creative_id=cid, status=VERIFY_PENDING))
    await session.commit()

    calls: list[int] = []

    async def fake_verify_creative(s: AsyncSession, creative_id: int, st: Settings) -> str:
        calls.append(creative_id)
        return VERIFY_FAILED_FETCH

    monkeypatch.setattr(media, "verify_creative", fake_verify_creative)
    count = await media.verify_pending(session, settings)

    assert count == 4
    assert calls == [1, 2, 3, 4]


async def test_verify_creative_releases_connection_before_network_call(
    session: AsyncSession, settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    """`verify_creative` must not hold a DB transaction (and so a pooled connection) while the
    media fetch is in flight: `register_creative` is permissionless and the sim verifies right
    after registering (`sim/src/planner/execute.ts:180`), so a slow or malicious `uri` could
    otherwise let one advertiser pin the api's whole connection pool — two concurrent verifies of
    one creative previously made an unrelated `GET /v1/slots/1` time out (fix round 1, ROADMAP
    6.9 step 39; docs/threat-model.md T18), the same risk `check_domain_verification` guards
    against. Same pattern as `test_check_releases_connection_before_network_call`: replace the
    network call itself (`fetch_media`, which `verify_creative` does not wrap in its own
    `try`/`except`) so a failed assertion raises straight out of `verify_creative`, instead of
    being swallowed by `fetch_media`'s own broad `except Exception` the way a transport-level
    mock's assertion would be."""
    import openad.services.media as media

    png = tiny_png()
    creative = make_creative(creative_id=1)
    creative.content_hash = keccak_hex(png)
    session.add(creative)
    await session.commit()
    assert session.in_transaction() is False

    async def fake_fetch_media(uri: str, *, settings: Settings) -> tuple[bytes | None, str]:
        assert session.in_transaction() is False
        return png, VERIFY_VERIFIED

    monkeypatch.setattr(media, "fetch_media", fake_fetch_media)
    status = await media.verify_creative(session, 1, settings)
    assert status == VERIFY_VERIFIED

    row = await session.get(CreativeVerification, 1)
    assert row is not None
    assert row.status == VERIFY_VERIFIED


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
