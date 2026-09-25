"""Best-effort rate limit for the SIWE auth routes (ADR-0009 amendment, threat model T16).

A token bucket per client key, kept in this process's memory only: with N api instances the
effective limit is N times the setting, and a restart forgets every bucket. It exists to make
nonce flooding and signature spraying from one address slower, not to be a global quota; put
Cloud Armor rate limiting on a load balancer for that (``docs/deploy-gcp.md``).

Off by default (``OPENAD_AUTH_RATE_LIMIT_PER_MINUTE=0``). Applied as a FastAPI dependency to
``POST /v1/auth/nonce`` and ``POST /v1/auth/verify`` only; both share one bucket per client.
"""

from __future__ import annotations

import math
import time
from collections import OrderedDict
from collections.abc import Callable

from fastapi import Request

from openad.errors import RateLimitedError

DEFAULT_MAX_KEYS = 10_000
# Longer than any IPv6 text form; stops a client-chosen key from pinning much memory when
# `trusted_proxy_hops` is set higher than the real number of proxies.
_MAX_KEY_LENGTH = 64


class TokenBucketLimiter:
    """``per_minute`` tokens of capacity per key, refilled continuously at ``per_minute / 60``
    tokens a second. Keys live in an LRU of at most ``max_keys`` entries, so memory stays bounded
    however many keys show up; an evicted key simply starts again with a full bucket."""

    def __init__(
        self,
        per_minute: int,
        *,
        max_keys: int = DEFAULT_MAX_KEYS,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        if per_minute < 1 or max_keys < 1:
            raise ValueError("per_minute and max_keys must be at least 1")
        self.per_minute = per_minute
        self.max_keys = max_keys
        self._clock = clock
        self._buckets: OrderedDict[str, tuple[float, float]] = OrderedDict()  # (tokens, at)

    def __len__(self) -> int:
        return len(self._buckets)

    def hit(self, key: str) -> int | None:
        """Take one token for ``key``: None if allowed, otherwise the whole seconds until the
        next token (the ``Retry-After`` value, at least 1). A refused request takes nothing."""
        now = self._clock()
        bucket = self._buckets.pop(key, None)
        if bucket is None:
            tokens = float(self.per_minute)
        else:
            tokens, at = bucket
            tokens = min(float(self.per_minute), tokens + (now - at) * self.per_minute / 60)
        allowed = tokens >= 1.0
        self._buckets[key] = (tokens - 1.0 if allowed else tokens, now)
        while len(self._buckets) > self.max_keys:
            self._buckets.popitem(last=False)  # least recently used
        if allowed:
            return None
        return max(1, math.ceil((1.0 - tokens) * 60 / self.per_minute))


def client_key(request: Request, trusted_proxy_hops: int) -> str:
    """The client a request is counted against.

    With ``trusted_proxy_hops`` 0 this is the TCP peer: ``request.client.host`` as uvicorn
    reports it (uvicorn rewrites it from ``X-Forwarded-For`` only for a peer in its
    ``FORWARDED_ALLOW_IPS``, by default ``127.0.0.1``). With N > 0 it is the N-th
    ``X-Forwarded-For`` entry counted from the right, i.e. the address that the outermost of
    the N trusted proxies saw. Entries further left were supplied by the client and
    are never read, so spoofing them changes nothing. Repeated header lines are joined in order,
    as HTTP defines; a chain shorter than N falls back to the peer.
    """
    peer = request.client.host if request.client else "unknown"
    if trusted_proxy_hops <= 0:
        return peer
    values = request.headers.getlist("x-forwarded-for")
    entries = [e.strip() for e in ",".join(values).split(",")] if values else []
    if len(entries) < trusted_proxy_hops:
        return peer
    chosen = entries[-trusted_proxy_hops]
    return chosen[:_MAX_KEY_LENGTH] if chosen else peer


async def auth_rate_limit(request: Request) -> None:
    """FastAPI dependency: a no-op unless the app built a limiter (limit > 0); raises
    :class:`RateLimitedError` (429 + ``Retry-After``) once the client's bucket is empty."""
    limiter: TokenBucketLimiter | None = getattr(request.app.state, "auth_rate_limiter", None)
    if limiter is None:
        return
    key = client_key(request, request.app.state.settings.trusted_proxy_hops)
    retry_after = limiter.hit(key)
    if retry_after is not None:
        raise RateLimitedError(
            "too many sign-in requests; try again later", retry_after=retry_after
        )
