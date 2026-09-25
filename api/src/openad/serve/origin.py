"""Origin enforcement for /v1/serve (docs/ARCHITECTURE.md section 3.4).

Best effort: a browser can't forge ``Origin`` or ``Referer``, but any other client can, so this
narrows where paid creatives show; it doesn't stop scripted clicks (the click burst rule and
the hourly per-campaign cap are the backstop).
"""

from __future__ import annotations

from urllib.parse import urlsplit

# Loopback page hosts that match any slot in dev and test. `urlsplit` drops the brackets of
# an IPv6 literal, so a page at `http://[::1]:5173` has the host `::1`.
LOCAL_HOSTS = frozenset({"localhost", "127.0.0.1", "::1"})


def _host(value: str | None) -> str | None:
    """The host a header's URL names; None when the header is absent or empty, is ``null``
    (an opaque origin), or is not a URL with a host."""
    if not value:
        return None
    try:
        host = urlsplit(value).hostname
    except ValueError:  # e.g. an unbalanced IPv6 bracket: `http://[`
        return None
    return host.lower() if host else None


def request_host(origin: str | None, referer: str | None) -> str | None:
    """Host from the Origin header, else from Referer, else None."""
    return _host(origin) or _host(referer)


def host_matches_domain(host: str, slot_domain: str, *, allow_local: bool) -> bool:
    """True when ``host`` equals ``slot_domain`` or is a subdomain of it, or, with
    ``allow_local`` (dev and test), is a loopback host."""
    if allow_local and host in LOCAL_HOSTS:
        return True
    domain = slot_domain.lower().strip(".")
    return host == domain or host.endswith("." + domain)


def origin_allowed(
    origin: str | None, referer: str | None, slot_domain: str, *, allow_local: bool
) -> bool:
    """Whether a paid creative may serve to this request when enforcement is on.

    - The page host is the one ``Origin`` names, else the one ``Referer`` names, and it must
      match the slot's domain (:func:`host_matches_domain`).
    - An ``Origin`` that names no host, like ``null`` from an opaque-origin page (a sandboxed
      iframe, a ``data:`` URL), is refused unless ``Referer`` names a matching host.
    - No ``Origin`` header and no ``Referer`` host: allowed. Browsers send ``Origin`` on the
      embed's cross-origin fetch, so this is mostly a non-browser client, which could send any
      header it likes; refusing it would stop nothing.
    """
    host = request_host(origin, referer)
    if host is None:
        return not origin
    return host_matches_domain(host, slot_domain, allow_local=allow_local)
