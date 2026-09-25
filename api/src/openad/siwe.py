"""Strict EIP-4361 (Sign-In with Ethereum) parsing and origin binding (ADR-0009 amendment).

Pure functions: no database, no I/O, no new dependency. :func:`parse_siwe` accepts only the
EIP-4361 layout, so every value the API relies on comes from the one line that defines it.
The parser it replaces searched the whole text for the first ``0x…`` address, ``Nonce:`` and
``Chain ID:``, and never read the domain, URI, version or timestamps. That let a site sign a
victim in with a message bound to its own domain (threat model T15).

Accepted layout (``LF`` line breaks only), EIP-4361's
``address LF LF [statement LF] LF "URI: "…``:

1. ``<domain> wants you to sign in with your Ethereum account:`` (no ``scheme://`` prefix)
2. the address, EIP-55 checksummed
3. an empty line
4. without a statement, a second empty line; with one, the statement (one line of EIP-4361's
   statement characters) and then an empty line
5. exactly once each, in this order: ``URI:``, ``Version: 1``, ``Chain ID:``, ``Nonce:``,
   ``Issued At:``
6. optionally, in this order: ``Expiration Time:``, ``Not Before:``, ``Request ID:``, and
   ``Resources:`` followed by ``- <uri>`` lines

Nothing may follow the last field. Every parse failure raises the same generic error.
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta, timezone
from urllib.parse import urlsplit

from eth_utils.address import is_checksum_address

from openad.errors import UnauthorizedError

# Tolerated difference between the signer's clock and ours, in seconds (5 minutes).
CLOCK_SKEW_SECONDS = 300
# Longest message the API accepts: ``SiweIn.message`` rejects a longer one before it is
# parsed. Our clients' messages are a few hundred characters.
MAX_MESSAGE_LENGTH = 4096

_HEADER = re.compile(r"(?P<domain>[^\s/]+) wants you to sign in with your Ethereum account:")
_ADDRESS = re.compile(r"0x[0-9a-fA-F]{40}")
# Explicit ASCII classes throughout: Python's ``\d`` also matches non-ASCII digits.
# RFC 3986 ``unreserved`` and ``reserved`` characters, which EIP-4361's grammar builds on.
_UNRESERVED = r"A-Za-z0-9\-._~"
_RESERVED = r":/?#\[\]@!$&'()*+,;="
_PCT_ENCODED = r"%[0-9A-Fa-f]{2}"
_STATEMENT = re.compile(rf"[{_UNRESERVED}{_RESERVED} ]+")
_URI = re.compile(rf"[A-Za-z][A-Za-z0-9+.\-]*:(?:[{_UNRESERVED}{_RESERVED}]|{_PCT_ENCODED})+")
_CHAIN_ID = re.compile(r"[0-9]{1,78}")
_NONCE = re.compile(r"[A-Za-z0-9]{8,64}")  # 64: the auth_nonces.nonce column size
_REQUEST_ID = re.compile(rf"(?:[{_UNRESERVED}!$&'()*+,;=:@]|{_PCT_ENCODED})*")  # *pchar
_RFC3339 = re.compile(
    r"(?P<year>[0-9]{4})-(?P<month>[0-9]{2})-(?P<day>[0-9]{2})[Tt]"
    r"(?P<hour>[0-9]{2}):(?P<minute>[0-9]{2}):(?P<second>[0-9]{2})(?:\.[0-9]+)?"
    r"(?P<offset>[Zz]|[+-][0-9]{2}:[0-9]{2})"
)

_REQUIRED = ("URI", "Version", "Chain ID", "Nonce", "Issued At")
_OPTIONAL = ("Expiration Time", "Not Before", "Request ID")


@dataclass(frozen=True)
class SiweMessage:
    """A parsed EIP-4361 message. Times are Unix seconds (fractions dropped)."""

    domain: str
    address: str  # lower-cased
    statement: str | None
    uri: str
    version: str
    chain_id: int
    nonce: str
    issued_at: int
    expiration_time: int | None = None
    not_before: int | None = None
    request_id: str | None = None
    resources: tuple[str, ...] = ()


def _malformed() -> UnauthorizedError:
    return UnauthorizedError("malformed SIWE message")


def _address(line: str) -> str:
    # EIP-4361 requires the EIP-55 checksum, so an all-lower-case address is rejected too.
    if _ADDRESS.fullmatch(line) is None or not is_checksum_address(line):
        raise _malformed()
    return line.lower()


def _uri(value: str) -> str:
    if _URI.fullmatch(value) is None:
        raise _malformed()
    return value


def _timestamp(value: str) -> int:
    m = _RFC3339.fullmatch(value)
    if m is None:
        raise _malformed()
    offset = m.group("offset")
    tz = UTC
    if offset not in ("Z", "z"):
        hours, minutes = int(offset[1:3]), int(offset[4:6])
        if hours > 23 or minutes > 59:
            raise _malformed()
        delta = timedelta(hours=hours, minutes=minutes)
        tz = timezone(delta if offset[0] == "+" else -delta)
    try:
        moment = datetime(
            int(m.group("year")),
            int(m.group("month")),
            int(m.group("day")),
            int(m.group("hour")),
            int(m.group("minute")),
            int(m.group("second")),
            tzinfo=tz,
        )
    except ValueError as exc:  # month 13, February 30, a leap second, …
        raise _malformed() from exc
    return int(moment.timestamp())


def parse_siwe(message: str) -> SiweMessage:
    """Parse ``message`` strictly (see the module docstring for the accepted layout).

    Raises ``UnauthorizedError("malformed SIWE message")`` for anything else: a CR character,
    a single empty line between the address and ``URI:``, a reordered, duplicate or unknown
    line, a missing field, or anything after the last field.
    """
    if "\r" in message:
        raise _malformed()
    lines = message.split("\n")
    if len(lines) < 5 or lines[2] != "":
        raise _malformed()
    header = _HEADER.fullmatch(lines[0])
    if header is None:
        raise _malformed()
    address = _address(lines[1])

    # ``address LF LF [statement LF] LF``: two empty lines without a statement, or the
    # statement between them.
    statement: str | None = None
    if lines[3] == "":
        i = 4
    else:
        statement = lines[3]
        if _STATEMENT.fullmatch(statement) is None or lines[4] != "":
            raise _malformed()
        i = 5

    required: dict[str, str] = {}
    for tag in _REQUIRED:
        prefix = f"{tag}: "
        if i >= len(lines) or not lines[i].startswith(prefix):
            raise _malformed()
        required[tag] = lines[i][len(prefix) :]
        i += 1

    optional: dict[str, str] = {}
    for tag in _OPTIONAL:
        prefix = f"{tag}: "
        if i < len(lines) and lines[i].startswith(prefix):
            optional[tag] = lines[i][len(prefix) :]
            i += 1

    resources: list[str] = []
    if i < len(lines) and lines[i] == "Resources:":
        i += 1
        while i < len(lines) and lines[i].startswith("- "):
            resources.append(_uri(lines[i][2:]))
            i += 1

    if i != len(lines):
        raise _malformed()  # an unknown, duplicate or out-of-order line, or trailing text

    if required["Version"] != "1":
        raise _malformed()
    if _CHAIN_ID.fullmatch(required["Chain ID"]) is None:
        raise _malformed()
    if _NONCE.fullmatch(required["Nonce"]) is None:
        raise _malformed()
    request_id = optional.get("Request ID")
    if request_id is not None and _REQUEST_ID.fullmatch(request_id) is None:
        raise _malformed()
    expiration = optional.get("Expiration Time")
    not_before = optional.get("Not Before")

    return SiweMessage(
        domain=header.group("domain"),
        address=address,
        statement=statement,
        uri=_uri(required["URI"]),
        version=required["Version"],
        chain_id=int(required["Chain ID"]),
        nonce=required["Nonce"],
        issued_at=_timestamp(required["Issued At"]),
        expiration_time=_timestamp(expiration) if expiration is not None else None,
        not_before=_timestamp(not_before) if not_before is not None else None,
        request_id=request_id,
        resources=tuple(resources),
    )


def _origin(url: str) -> tuple[str, str] | None:
    """``(scheme://authority, authority)`` of an absolute http(s) URL, else None."""
    try:
        parts = urlsplit(url)
    except ValueError:
        return None
    if parts.scheme not in ("http", "https") or not parts.netloc:
        return None
    return f"{parts.scheme}://{parts.netloc}", parts.netloc


def is_bound_to_allowed_origin(message: SiweMessage, allowed_origins: Iterable[str]) -> bool:
    """True when ``message`` was issued for one of ``allowed_origins`` (the web app's origins).

    The ``domain`` must equal the authority (host and port) of an allowed origin, and the
    ``URI``'s origin must be that same allowed origin: same scheme, host and port. Allowed
    origins are compared lower-cased (browsers send ``location.host`` and ``location.origin``
    lower-cased); anything that is not an ``http(s)://`` origin, such as ``*``, allows nothing.
    """
    uri_origin = _origin(message.uri)
    if uri_origin is None:
        return False
    for configured in allowed_origins:
        allowed = _origin(configured.strip().lower())
        if allowed is None:
            continue
        origin, authority = allowed
        if message.domain == authority and uri_origin[0] == origin:
            return True
    return False


def check_time_window(message: SiweMessage, *, now: int, max_age: int) -> None:
    """Reject a message outside its validity window, allowing ``CLOCK_SKEW_SECONDS`` of skew.

    ``Issued At`` must lie in ``[now - max_age - skew, now + skew]``; ``Expiration Time``, if
    present, must be after ``now``; ``Not Before``, if present, at most ``now + skew``.
    """
    if message.issued_at < now - max_age - CLOCK_SKEW_SECONDS:
        raise UnauthorizedError("SIWE message expired")
    if message.issued_at > now + CLOCK_SKEW_SECONDS:
        raise UnauthorizedError("SIWE message not yet valid")
    if message.expiration_time is not None and message.expiration_time <= now:
        raise UnauthorizedError("SIWE message expired")
    if message.not_before is not None and message.not_before > now + CLOCK_SKEW_SECONDS:
        raise UnauthorizedError("SIWE message not yet valid")
