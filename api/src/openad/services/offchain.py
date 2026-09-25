"""House ads, domain verification, and slot listings (off-chain only)."""

from __future__ import annotations

import asyncio
import math
import re
import secrets
import unicodedata
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from typing import Any, cast
from urllib.parse import urljoin

import httpx
from sqlalchemy import or_, update
from sqlalchemy.engine import CursorResult
from sqlalchemy.ext.asyncio import AsyncSession

from openad.config import Settings
from openad.errors import InvalidListingError, NotFoundError, RateLimitedError
from openad.listing_taxonomy import CATEGORY_SET, MAX_CATEGORIES
from openad.models import DomainVerification, HouseAd, Slot, SlotListing
from openad.services.media import MAX_REDIRECT_HOPS, _content_encoding_ok, _hop_allowed

META_RE = re.compile(
    r'<meta\s+name=["\']openad-site-verification["\']\s+content=["\']([^"\']+)["\']',
    re.IGNORECASE,
)
_HEAD_CLOSE_RE = re.compile(rb"</head", re.IGNORECASE)
# `</head` is a fixed 6-byte literal (case aside), so a match that starts in one chunk and ends
# in the next can only start within the last (len - 1) bytes already read: re-searching just
# that overlap plus the new chunk each time finds every match in O(total bytes read), instead of
# rescanning the whole accumulated buffer per chunk, which is O(bytes²) (fix round 1: a 1-byte-
# chunk drip up to the cap measured 9.89s CPU in a 10s check).
_HEAD_CLOSE_OVERLAP = len(b"</head") - 1

# `check_domain_verification` (ROADMAP 6.9 step 39; docs/threat-model.md T18): a per-slot
# cooldown on the on-demand network check (minting a slot, and so starting verification, is
# permissionless), and the bound on `_check_meta`'s own fetch.
DOMAIN_CHECK_COOLDOWN_SECONDS = 30
DOMAIN_CHECK_DEADLINE_SECONDS = 10.0
DOMAIN_CHECK_BODY_CAP_BYTES = 256 * 1024


def _rowcount(result: object) -> int:
    # DML through AsyncSession.execute returns a CursorResult; the stubs only say Result.
    return int(cast("CursorResult[Any]", result).rowcount)


_LISTING_SUMMARY_MAX = 140
_LISTING_AUDIENCE_MAX = 600

# Whitespace runs (space, tab, newline, CR, Unicode space separators) collapse to a single space
# during normalization; this is unrelated to the control-character check below, which runs first
# and on the un-collapsed text (see `_first_disallowed_control_char`).
_WHITESPACE_RE = re.compile(r"\s+")

# Plain ASCII space/tab/newline/CR are formatting, not attacks, even though tab/newline/CR are
# technically Unicode category Cc (control). ZWJ (U+200D) is a legitimate joiner in some emoji
# and script sequences. Every other Cc (control) or Cf (format) character is rejected: bidi
# overrides (U+202E RIGHT-TO-LEFT OVERRIDE, U+2066 LEFT-TO-RIGHT ISOLATE), zero-width characters
# (U+200B ZERO WIDTH SPACE), and C1 controls (U+0080-U+009F, e.g. U+009B CSI) among them. Doing
# this by Unicode category — not a hardcoded ASCII range — is what catches all of these; an
# ASCII-only `[\x00-\x1f\x7f]` regex (this module's previous approach) misses every non-ASCII one.
# Checked on the NFC-normalized, not-yet-whitespace-collapsed text: collapsing first would let
# `\s+` (which Python treats as matching some non-whitespace Cc controls, e.g. U+001C-U+001F and
# U+0085 NEL, per their Unicode bidirectional class) silently turn those into an accepted space.
_ALLOWED_WHITESPACE_CHARS = frozenset(" \t\n\r")
_ALLOWED_FORMAT_CHARS = frozenset("‍")


def _first_disallowed_control_char(text: str) -> str | None:
    for ch in text:
        if ch in _ALLOWED_WHITESPACE_CHARS or ch in _ALLOWED_FORMAT_CHARS:
            continue
        if unicodedata.category(ch) in ("Cc", "Cf"):
            return ch
    return None


# No link spam in a listing (PROTOCOL/ROADMAP 6.3 design): the slot's domain is already shown, so
# a URL in the summary is either redundant or an attempt to point elsewhere. Two patterns: an
# explicit scheme/`www.` prefix, and a bare "label.label...tld" host with no scheme.
#
# Known, documented bypasses (also called out in docs/guide/publisher/listing.md): a spaced-out
# host ("example . com"), a "defanged" form ("example[.]com"), a bare IP address ("192.0.2.1"),
# an @handle with no dot ("@openad"), and Unicode dot lookalikes not folded below (e.g. U+00B7
# MIDDLE DOT). This is an anti-spam heuristic, not a security boundary
# — a determined publisher can still get a URL past it.
_URL_SCHEME_RE = re.compile(r"(?i)\b(?:[a-z][a-z0-9+.-]*://|www\.)")
_BARE_DOMAIN_RE = re.compile(
    r"(?i)\b[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?"
    r"(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.([a-z]{2,})\b"
)
# Common tech/file-extension tokens that read as a "bare domain" to the regex above but are not
# links in ordinary prose ("Node.js devs", "ethers.js users", "audit.sol"). To our knowledge none
# of these is a delegated TLD today. ccTLDs that collide with file extensions — `.py` (Paraguay,
# e.g. "shop.com.py"), `.rs` (Serbia, open registration) — are deliberately NOT listed, so text
# like "main.py" or "lib.rs" is rejected as a URL. Tradeoff: "evil.js" or "shop.go" still
# passes, and would read like a host name to a human; if one of these suffixes is ever delegated,
# it becomes an unflagged real domain. Listing text is rendered as plain text, never as a link.
# Keep this list in sync with docs/guide/publisher/listing.md.
_BARE_DOMAIN_ALLOWED_SUFFIXES = frozenset(
    {"js", "jsx", "mjs", "cjs", "ts", "tsx", "go", "rb", "sol", "java", "cpp", "php"}
)

_DOT_LOOKALIKES = str.maketrans(
    {
        "\u3002": ".",  # IDEOGRAPHIC FULL STOP (CJK) - no NFKC decomposition to ASCII '.'
        "\uff61": ".",  # HALFWIDTH IDEOGRAPHIC FULL STOP - ditto
        "\u2024": ".",  # ONE DOT LEADER
    }
)


# Invisible characters that `_first_disallowed_control_char` lets through (ZWJ) are deleted before
# URL detection, so "evil\u200d.com" or "evil.\u200dcom" can't split the host past the regex.
_STRIP_INVISIBLE = str.maketrans(dict.fromkeys(_ALLOWED_FORMAT_CHARS))


def _fold_url_lookalikes(text: str) -> str:
    """Deletes the allowed invisible characters (`_ALLOWED_FORMAT_CHARS`, i.e. ZWJ), then NFKC
    folds fullwidth Latin punctuation (e.g. U+FF0E FULLWIDTH FULL STOP) to its ASCII form; a few
    CJK dot-like punctuation marks have no NFKC decomposition to '.', so they are folded
    explicitly via `_DOT_LOOKALIKES`. Used only to *detect* a URL — the stored text keeps its
    original NFC form, since folding it would also mangle unrelated non-Latin text."""
    stripped = text.translate(_STRIP_INVISIBLE)
    return unicodedata.normalize("NFKC", stripped).translate(_DOT_LOOKALIKES)


def _looks_like_url(text: str) -> bool:
    folded = _fold_url_lookalikes(text)
    if _URL_SCHEME_RE.search(folded):
        return True
    for match in _BARE_DOMAIN_RE.finditer(folded):
        if match.group(1).lower() not in _BARE_DOMAIN_ALLOWED_SUFFIXES:
            return True
    return False


def _normalize_listing_text(text: str, *, field: str, max_len: int, reject_urls: bool) -> str:
    """Strip, collapse internal whitespace to single spaces, and enforce the security-relevant
    listing rules from ROADMAP 6.3 step 16. Raises ``InvalidListingError`` (422, the repo's
    existing ``DomainError`` shape) rather than relying on Pydantic's default validation body."""
    nfc = unicodedata.normalize("NFC", text)
    if _first_disallowed_control_char(nfc) is not None:
        raise InvalidListingError(f"{field} contains control characters")
    normalized = _WHITESPACE_RE.sub(" ", nfc).strip()
    if not normalized:
        raise InvalidListingError(f"{field} must not be empty")
    if len(normalized) > max_len:
        raise InvalidListingError(f"{field} exceeds {max_len} characters")
    if reject_urls and _looks_like_url(normalized):
        raise InvalidListingError(f"{field} must not contain a URL")
    return normalized


def _normalize_categories(categories: Sequence[str]) -> list[str]:
    # Dedupe before enforcing the cap: 4 raw entries that collapse to 2 distinct categories (e.g.
    # ["defi", "defi", "DeFi", "security"]) must not be rejected as "too many".
    deduped = {raw.strip().lower() for raw in categories}
    if len(deduped) > MAX_CATEGORIES:
        raise InvalidListingError(f"at most {MAX_CATEGORIES} categories")
    for cat in deduped:
        if cat not in CATEGORY_SET:
            raise InvalidListingError(f"unknown category: {cat}")
    return sorted(deduped)


async def set_house_ad(
    session: AsyncSession, slot_id: int, *, media_url: str, click_url: str
) -> HouseAd:
    slot = await session.get(Slot, slot_id)
    if slot is None:
        raise NotFoundError(f"slot {slot_id} not found")
    row = await session.get(HouseAd, slot_id)
    if row is None:
        row = HouseAd(
            slot_id=slot_id,
            media_url=media_url,
            click_url=click_url,
            updated_at=datetime.now(UTC),
        )
        session.add(row)
    else:
        row.media_url = media_url
        row.click_url = click_url
        row.updated_at = datetime.now(UTC)
    await session.commit()
    return row


async def start_domain_verification(
    session: AsyncSession, slot_id: int, *, method: str
) -> DomainVerification:
    slot = await session.get(Slot, slot_id)
    if slot is None:
        raise NotFoundError(f"slot {slot_id} not found")
    row = await session.get(DomainVerification, slot_id)
    token = secrets.token_hex(16)
    if row is None:
        row = DomainVerification(slot_id=slot_id, method=method, token=token)
        session.add(row)
    else:
        row.method = method
        row.token = token
        row.verified_at = None
    await session.commit()
    return row


async def _claim_check_window(session: AsyncSession, slot_id: int, *, now: datetime) -> int:
    """Atomically claim the right to run the network check for `slot_id` in this cooldown
    window (fix round 1, ROADMAP 6.9 step 39). Returns 1 if this call won the claim, 0 if
    another call already holds it (or held it within `DOMAIN_CHECK_COOLDOWN_SECONDS`).

    A read-then-write cooldown (read `last_checked_at`, decide in Python, then write) lets
    concurrent callers all read "not in cooldown" before any of them writes — 8 concurrent
    `check=true` requests on Postgres measured 2x200 instead of 1. One conditional UPDATE means
    the database, not this process, decides who wins: only one statement, no preceding read of
    this row (mirrors `services.auth.consume_nonce`).
    """
    cutoff = now - timedelta(seconds=DOMAIN_CHECK_COOLDOWN_SECONDS)
    result = await session.execute(
        update(DomainVerification)
        .where(
            DomainVerification.slot_id == slot_id,
            or_(
                DomainVerification.last_checked_at.is_(None),
                DomainVerification.last_checked_at <= cutoff,
            ),
        )
        .values(last_checked_at=now)
        .execution_options(synchronize_session=False)
    )
    return _rowcount(result)


async def check_domain_verification(
    session: AsyncSession, slot_id: int, settings: Settings
) -> DomainVerification:
    """Run the on-demand domain check (ROADMAP 6.9 step 39; `docs/threat-model.md` T18).

    Minting a slot (and so starting verification) is permissionless, and the network check
    below can take up to `DOMAIN_CHECK_DEADLINE_SECONDS`; without the guards here, one wallet
    could hold a DB connection per slow request and exhaust the api's pool (`docs/deploy-gcp.md`
    "Connection budget"):

    1. `_claim_check_window` atomically claims a per-slot cooldown window; a caller that doesn't
       win it gets `429 rate_limited` without a fetch.
    2. The claim's transaction is committed — releasing the pooled connection — *before* the
       network call, win or lose.
    3. The result is written in a third transaction, guarded by the `token` read before the
       fetch: if `start_domain_verification` re-issued a new token while the fetch was in
       flight, this (now-stale) result must not mark the slot verified under that new token.
    """
    slot = await session.get(Slot, slot_id)
    if slot is None:
        raise NotFoundError(f"slot {slot_id} not found")
    row = await session.get(DomainVerification, slot_id)
    if row is None:
        raise NotFoundError("no domain verification started")
    domain, method, token = slot.domain, row.method, row.token

    now = datetime.now(UTC)
    claimed = await _claim_check_window(session, slot_id, now=now)
    await session.commit()  # release the pooled connection before network I/O, win or lose (T18)

    if claimed == 0:
        await session.refresh(row)  # our read above may already be stale; get the real value
        last_checked = row.last_checked_at
        remaining = float(DOMAIN_CHECK_COOLDOWN_SECONDS)
        if last_checked is not None:
            # SQLite (unit tests) drops the tzinfo of a `DateTime(timezone=True)` column on read
            # even though it round-trips the UTC instant we wrote; Postgres (prod, CI) returns
            # it tz-aware already. Either way the value is UTC, so a naive read means "this is
            # UTC".
            if last_checked.tzinfo is None:
                last_checked = last_checked.replace(tzinfo=UTC)
            remaining = DOMAIN_CHECK_COOLDOWN_SECONDS - (now - last_checked).total_seconds()
        raise RateLimitedError("domain check cooldown", retry_after=max(1, math.ceil(remaining)))

    ok = False
    if method == "meta_tag":
        ok = await _check_meta(domain, token, is_dev=settings.is_dev)
    elif method == "dns_txt":
        ok = await _check_dns(domain, token)

    if ok:
        await session.execute(
            update(DomainVerification)
            .where(DomainVerification.slot_id == slot_id, DomainVerification.token == token)
            .values(verified_at=now)
            .execution_options(synchronize_session=False)
        )
        await session.commit()  # a new transaction: only opened when there is something to write

    await session.refresh(row)  # pick up whichever of the writes above actually landed
    return row


async def _check_meta(domain: str, token: str, *, is_dev: bool) -> bool:
    """Fetch `https://<domain>/` and look for the verification meta tag. Manual redirects
    (a hop may drop to `http://`, or skip the host checks below, only in dev/test), each
    re-validated with `services.media._hop_allowed` (ROADMAP 6.9 step 39, same SSRF guard as
    `fetch_media`, `docs/threat-model.md` T17/T18); an overall deadline; the body read raw
    (`aiter_raw()`) and refused outright if declared with a non-identity `Content-Encoding`, so
    a compressed body can't decode to something far larger than the byte cap below (fix round 1,
    same decompression-bomb guard as `fetch_media`, see `services.media._content_encoding_ok`);
    and the body is read only up to `DOMAIN_CHECK_BODY_CAP_BYTES` or `</head>`, whichever comes
    first — checked incrementally (`_HEAD_CLOSE_OVERLAP`), not by rescanning everything read so
    far on every chunk, since the tag always belongs in `<head>`.
    """
    url = f"https://{domain}/"
    try:
        if not _hop_allowed(url, is_dev=is_dev):
            return False
        async with asyncio.timeout(DOMAIN_CHECK_DEADLINE_SECONDS):
            async with httpx.AsyncClient(
                timeout=DOMAIN_CHECK_DEADLINE_SECONDS,
                follow_redirects=False,
                headers={"Accept-Encoding": "identity"},
            ) as client:
                for _ in range(MAX_REDIRECT_HOPS + 1):
                    async with client.stream("GET", url) as resp:
                        if resp.has_redirect_location:
                            url = urljoin(url, resp.headers["location"])
                            if not _hop_allowed(url, is_dev=is_dev):
                                return False
                            continue
                        resp.raise_for_status()
                        if not _content_encoding_ok(resp):
                            return False
                        body = bytearray()
                        async for chunk in resp.aiter_raw():
                            search_from = max(0, len(body) - _HEAD_CLOSE_OVERLAP)
                            body.extend(chunk)
                            if len(body) >= DOMAIN_CHECK_BODY_CAP_BYTES:
                                break
                            if _HEAD_CLOSE_RE.search(body, search_from):
                                break
                        text = bytes(body[:DOMAIN_CHECK_BODY_CAP_BYTES]).decode(
                            "utf-8", errors="replace"
                        )
                        found = META_RE.search(text)
                        return bool(found and found.group(1) == token)
                return False  # too many redirect hops
    except Exception:
        return False


async def get_listing(session: AsyncSession, slot_id: int) -> SlotListing | None:
    return await session.get(SlotListing, slot_id)


async def set_listing(
    session: AsyncSession,
    slot_id: int,
    *,
    summary: str,
    audience: str,
    categories: Sequence[str],
) -> SlotListing:
    slot = await session.get(Slot, slot_id)
    if slot is None:
        raise NotFoundError(f"slot {slot_id} not found")
    norm_summary = _normalize_listing_text(
        summary, field="summary", max_len=_LISTING_SUMMARY_MAX, reject_urls=True
    )
    norm_audience = _normalize_listing_text(
        audience, field="audience", max_len=_LISTING_AUDIENCE_MAX, reject_urls=False
    )
    norm_categories = _normalize_categories(categories)
    joined = ",".join(norm_categories)
    row = await session.get(SlotListing, slot_id)
    if row is None:
        row = SlotListing(
            slot_id=slot_id,
            summary=norm_summary,
            audience=norm_audience,
            categories=joined,
            updated_at=datetime.now(UTC),
        )
        session.add(row)
    else:
        row.summary = norm_summary
        row.audience = norm_audience
        row.categories = joined
        row.updated_at = datetime.now(UTC)
    await session.commit()
    return row


async def delete_listing(session: AsyncSession, slot_id: int) -> None:
    slot = await session.get(Slot, slot_id)
    if slot is None:
        raise NotFoundError(f"slot {slot_id} not found")
    row = await session.get(SlotListing, slot_id)
    if row is not None:
        await session.delete(row)
        await session.commit()


async def _check_dns(domain: str, token: str) -> bool:
    try:
        import dns.asyncresolver
    except ImportError:
        return False
    try:
        answers = await dns.asyncresolver.resolve(f"_openad.{domain}", "TXT")
        expected = f"openad-verification={token}"
        for rdata in answers:
            texts = [t.decode() if isinstance(t, bytes) else str(t) for t in rdata.strings]
            if expected in texts or expected in "".join(texts):
                return True
    except Exception:
        return False
    return False
