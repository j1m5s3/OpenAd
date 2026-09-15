from __future__ import annotations

from httpx import AsyncClient


async def test_health(client: AsyncClient) -> None:
    res = await client.get("/v1/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["chainId"] == 31337
    assert body["env"] == "test"
    assert "indexerLag" in body
