"""Liveness HTTP listener for the indexer and settler worker processes (ADR-0017).

Cloud Run health-checks every container's `$PORT`, including a "no ingress" worker service —
a Cloud Run service that never opens `$PORT` is treated as failing to start. `indexer` and
`settler` are plain poll loops with nothing else to serve, so this module is the entire HTTP
surface they get: `GET /` and `GET /healthz` return 200 while the loop is ticking and 503 once
it has gone stale (stuck or crashed-and-stuck-in-backoff).

Started ONLY when the `PORT` environment variable is set. Cloud Run always sets it; local runs
(`python -m openad.indexer` / `.settler`) never do, so nothing changes locally. `PORT` is a
platform-injected container contract, not an `OPENAD_*` application setting, so it is read
directly here rather than added to `openad.config.Settings` — the same carve-out
`openad.settler.settings` already makes for `OPENAD_SETTLER_KEY` (ARCHITECTURE §3.8).

Alternative considered (see ADR-0017): `gcloud beta run worker-pools`, a Cloud Run resource
kind built for exactly this ("a process with no HTTP surface") that needs no `$PORT` listener
at all. It was still in `beta` when this ADR was written; this stdlib listener works today on
stable `gcloud run deploy` and can be dropped later without changing `IndexerRunner` /
`SettlerRunner` beyond removing the `liveness` argument.
"""

from __future__ import annotations

import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from openad.logging import get_logger

log = get_logger(__name__)

DEFAULT_MIN_STALE_SECONDS = 30.0
STALE_POLL_MULTIPLIER = 5.0


def stale_after_seconds(poll_seconds: float) -> float:
    """How long without a tick before liveness reports unhealthy.

    A few missed poll intervals in a row, not one slow iteration: `max(poll * 5, 30s)`.
    """
    return max(poll_seconds * STALE_POLL_MULTIPLIER, DEFAULT_MIN_STALE_SECONDS)


class Liveness:
    """Shared, thread-safe last-tick clock. The poll loop calls `tick()`; the HTTP handler
    (a different thread) calls `is_alive()`."""

    def __init__(self, stale_after: float) -> None:
        self._stale_after = stale_after
        self._lock = threading.Lock()
        self._last_tick = time.monotonic()

    def tick(self) -> None:
        with self._lock:
            self._last_tick = time.monotonic()

    def is_alive(self) -> bool:
        with self._lock:
            age = time.monotonic() - self._last_tick
        return age < self._stale_after


def _handler_for(liveness: Liveness) -> type[BaseHTTPRequestHandler]:
    class LivenessHandler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            """`GET /` or `GET /healthz` → `200 ok` while the loop has ticked recently,
            `503 stale` once it hasn't; any other path → `404`. `is_alive()` is read exactly
            once and reused for both the status line and the body, so they can't disagree."""
            if self.path not in ("/", "/healthz"):
                self.send_response(404)
                self.end_headers()
                return
            alive = liveness.is_alive()
            body = b"ok" if alive else b"stale"
            self.send_response(200 if alive else 503)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, format: str, *args: object) -> None:
            return  # structlog only; the stdlib default writes straight to stderr

    return LivenessHandler


def start_liveness_server(port: int, liveness: Liveness) -> ThreadingHTTPServer:
    """Start the listener on `port` in a daemon thread and return the server (for tests /
    explicit shutdown; the worker processes never stop it themselves)."""
    server = ThreadingHTTPServer(("0.0.0.0", port), _handler_for(liveness))  # noqa: S104
    thread = threading.Thread(target=server.serve_forever, name="liveness", daemon=True)
    thread.start()
    log.info("liveness.started", port=port)
    return server


def start_liveness_server_from_env(liveness: Liveness) -> ThreadingHTTPServer | None:
    """Start only when Cloud Run's `PORT` is set. Returns None locally (no-op)."""
    port_str = os.environ.get("PORT")
    if not port_str:
        return None
    return start_liveness_server(int(port_str), liveness)
