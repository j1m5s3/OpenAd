"""Origin enforcement for /v1/serve (docs/ARCHITECTURE.md section 3.4)."""

from __future__ import annotations

from urllib.parse import urlsplit

LOCAL_HOSTS = frozenset({"localhost", "127.0.0.1", "[::1]"})


def request_host(origin: str | None, referer: str | None) -> str | None:
    """Host from the Origin header, else from Referer, else None."""
    for value in (origin, referer):
        if value:
            host = urlsplit(value).hostname
            if host:
                return host.lower()
    return None


def host_matches_domain(host: str | None, slot_domain: str, *, allow_local: bool) -> bool:
    """True when ``host`` equals ``slot_domain`` or is a subdomain of it.

    A missing host (no Origin/Referer, e.g. privacy browsers or direct image loads) is
    treated as a match: we cannot distinguish it from a legitimate page, and refusing would
    break real publishers. Enforcement is best-effort by design.
    """
    if host is None:
        return True
    if allow_local and host in LOCAL_HOSTS:
        return True
    domain = slot_domain.lower().strip(".")
    return host == domain or host.endswith("." + domain)
