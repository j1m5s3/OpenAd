"""Liveness listener for the indexer/settler Cloud Run workers (ADR-0017)."""

from __future__ import annotations

import http.client
import time

import pytest

from openad.health import (
    DEFAULT_MIN_STALE_SECONDS,
    Liveness,
    stale_after_seconds,
    start_liveness_server,
    start_liveness_server_from_env,
)


def test_stale_after_seconds_floors_at_minimum() -> None:
    assert stale_after_seconds(1.0) == DEFAULT_MIN_STALE_SECONDS
    assert stale_after_seconds(20.0) == 100.0


def test_liveness_fresh_then_stale() -> None:
    liveness = Liveness(stale_after=0.05)
    assert liveness.is_alive()
    time.sleep(0.1)
    assert not liveness.is_alive()
    liveness.tick()
    assert liveness.is_alive()


def _get(port: int, path: str) -> http.client.HTTPResponse:
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=2)
    conn.request("GET", path)
    return conn.getresponse()


def test_server_reports_ok_then_stale() -> None:
    liveness = Liveness(stale_after=0.1)
    server = start_liveness_server(0, liveness)
    try:
        port = server.server_address[1]
        res = _get(port, "/")
        assert res.status == 200
        assert res.read() == b"ok"

        res = _get(port, "/healthz")
        assert res.status == 200

        time.sleep(0.2)
        res = _get(port, "/healthz")
        assert res.status == 503
        assert res.read() == b"stale"

        res = _get(port, "/nope")
        assert res.status == 404
    finally:
        server.shutdown()
        server.server_close()


def test_start_from_env_is_noop_without_port(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("PORT", raising=False)
    liveness = Liveness(stale_after=30.0)
    assert start_liveness_server_from_env(liveness) is None


def test_start_from_env_starts_when_port_set(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PORT", "0")
    liveness = Liveness(stale_after=30.0)
    server = start_liveness_server_from_env(liveness)
    assert server is not None
    try:
        port = server.server_address[1]
        assert _get(port, "/").status == 200
    finally:
        server.shutdown()
        server.server_close()
