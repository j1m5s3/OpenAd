from __future__ import annotations

import pytest

from openad.serve.origin import host_matches_domain, request_host


@pytest.mark.parametrize(
    ("origin", "referer", "expected"),
    [
        ("https://Example.com", None, "example.com"),
        (None, "https://news.example.com/article?x=1", "news.example.com"),
        ("https://a.test", "https://b.test", "a.test"),
        (None, None, None),
        ("not a url", None, None),
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
        (None, "example.com", False, True),  # missing header: cannot enforce
        ("localhost", "example.com", True, True),
        ("localhost", "example.com", False, False),
    ],
)
def test_host_matches_domain(
    host: str | None, domain: str, allow_local: bool, expected: bool
) -> None:
    assert host_matches_domain(host, domain, allow_local=allow_local) is expected
