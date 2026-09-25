from __future__ import annotations

import pytest

from openad.serve.origin import host_matches_domain, origin_allowed, request_host


@pytest.mark.parametrize(
    ("origin", "referer", "expected"),
    [
        ("https://Example.com", None, "example.com"),
        (None, "https://news.example.com/article?x=1", "news.example.com"),
        ("https://a.test", "https://b.test", "a.test"),
        (None, None, None),
        ("not a url", None, None),
        ("null", None, None),  # an opaque origin names no host
        ("null", "https://example.com/post", "example.com"),
        ("http://[::1]:5173", None, "::1"),  # urlsplit drops the IPv6 brackets
        ("http://[", None, None),  # unparseable (an unbalanced bracket) names no host
        (None, "http://[::1", None),
    ],
)
def test_request_host(origin: str | None, referer: str | None, expected: str | None) -> None:
    assert request_host(origin, referer) == expected


@pytest.mark.parametrize(
    ("host", "domain", "allow_local", "expected"),
    [
        ("example.com", "example.com", False, True),
        ("www.example.com", "example.com", False, True),
        ("evil-example.com", "example.com", False, False),
        ("example.com.evil.net", "example.com", False, False),
        ("localhost", "example.com", True, True),
        ("localhost", "example.com", False, False),
        ("127.0.0.1", "example.com", True, True),
        ("::1", "example.com", True, True),
        ("::1", "example.com", False, False),
    ],
)
def test_host_matches_domain(host: str, domain: str, allow_local: bool, expected: bool) -> None:
    assert host_matches_domain(host, domain, allow_local=allow_local) is expected


@pytest.mark.parametrize(
    ("origin", "referer", "allow_local", "expected"),
    [
        ("https://example.com", None, False, True),
        ("https://blog.example.com", None, False, True),
        ("https://evil.test", None, False, False),
        ("https://evil.test", "https://example.com/", False, False),  # Origin wins
        (None, "https://example.com/post", False, True),
        (None, "https://evil.test/post", False, False),
        (None, None, False, True),  # neither header: a match (a script could send either)
        ("null", None, False, False),  # an opaque origin with no Referer: a mismatch
        ("null", "https://www.example.com/post", False, True),
        ("null", "https://evil.test/post", False, False),
        ("null", "about:blank", False, False),  # a Referer without a host doesn't help
        ("http://[", None, False, False),  # an Origin that names no host, like null
        (None, "http://[::1", False, True),  # no Origin and no Referer host: as neither
        ("http://[::1]:5173", None, True, True),  # IPv6 loopback, dev and test only
        ("http://[::1]:5173", None, False, False),
        ("http://localhost:5173", None, True, True),
        ("http://127.0.0.1:5173", None, True, True),
    ],
)
def test_origin_allowed(
    origin: str | None, referer: str | None, allow_local: bool, expected: bool
) -> None:
    assert origin_allowed(origin, referer, "example.com", allow_local=allow_local) is expected
