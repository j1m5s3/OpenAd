"""Serve CORS: /v1/serve/* is readable from any origin, credential-free; other routes are not.

See docs/ARCHITECTURE.md section 3.4 and AGENTS.md's serving invariants.
"""

from __future__ import annotations

from httpx import AsyncClient


async def test_serve_allows_arbitrary_origin(client: AsyncClient) -> None:
    resp = await client.get("/v1/serve/1", headers={"Origin": "https://publisher.example"})
    assert resp.headers["access-control-allow-origin"] == "*"
    assert "access-control-allow-credentials" not in resp.headers
    assert resp.headers.get("vary", "").lower() == "origin"


async def test_serve_media_allows_arbitrary_origin(client: AsyncClient) -> None:
    resp = await client.get("/v1/serve/1/media", headers={"Origin": "https://publisher.example"})
    assert resp.headers["access-control-allow-origin"] == "*"
    assert "access-control-allow-credentials" not in resp.headers


async def test_serve_preflight_ok(client: AsyncClient) -> None:
    resp = await client.options(
        "/v1/serve/1",
        headers={
            "Origin": "https://publisher.example",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert resp.status_code == 200
    assert resp.headers["access-control-allow-origin"] == "*"
    assert "GET" in resp.headers["access-control-allow-methods"]


async def test_non_serve_route_ignores_arbitrary_origin(client: AsyncClient) -> None:
    resp = await client.get(
        "/v1/publishers/" + "0x" + "aa" * 20,
        headers={"Origin": "https://random.example"},
    )
    assert "access-control-allow-origin" not in resp.headers


async def test_non_serve_route_keeps_credentials_for_allowlisted_origin(
    client: AsyncClient,
) -> None:
    resp = await client.options(
        "/v1/publishers/" + "0x" + "aa" * 20,
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert resp.headers.get("access-control-allow-origin") == "http://localhost:5173"
    assert resp.headers.get("access-control-allow-credentials") == "true"


async def test_near_miss_path_gets_no_public_cors(client: AsyncClient) -> None:
    """A same-prefixed but different route (``/v1/serve-x``) must not pass a naive
    ``str.startswith("/v1/serve")`` check."""
    resp = await client.get("/v1/serve-x", headers={"Origin": "https://random.example"})
    assert "access-control-allow-origin" not in resp.headers


async def test_encoded_traversal_path_gets_no_public_cors(client: AsyncClient) -> None:
    """A request whose path is percent-encoded (``%2F``) so its ``..`` segment survives into
    ``scope["path"]`` unresolved — e.g. ``/v1/slots/../serve/1``, which a plain HTTP client
    normalizes away before the request is even sent, so this is the only way to reach the app
    with the literal text intact — must not get serve's CORS. It never actually reaches the
    serve route either: Starlette's router does not resolve dot segments any more than this
    check does, so the request 404s regardless."""
    resp = await client.get(
        "/v1/slots%2F..%2Fserve%2F1",
        headers={"Origin": "https://publisher.example"},
    )
    assert resp.status_code == 404
    assert "access-control-allow-origin" not in resp.headers


async def test_serve_path_with_trailing_id_gets_public_cors(client: AsyncClient) -> None:
    """Sanity check: an ordinary, un-encoded serve path still gets public CORS — the traversal
    test above is about the literal, unresolved text, not a blanket denial of anything with a
    slash in it."""
    resp = await client.get("/v1/serve/1", headers={"Origin": "https://publisher.example"})
    assert resp.headers.get("access-control-allow-origin") == "*"
