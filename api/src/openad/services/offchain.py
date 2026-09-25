"""House ads, domain verification, and slot listings (off-chain only)."""

from __future__ import annotations

import re
import secrets
import unicodedata
from collections.abc import Sequence
from datetime import UTC, datetime

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from openad.errors import InvalidListingError, NotFoundError
from openad.listing_taxonomy import CATEGORY_SET, MAX_CATEGORIES
from openad.models import DomainVerification, HouseAd, Slot, SlotListing

META_RE = re.compile(
    r'<meta\s+name=["\']openad-site-verification["\']\s+content=["\']([^"\']+)["\']',
    re.IGNORECASE,
)

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


async def check_domain_verification(session: AsyncSession, slot_id: int) -> DomainVerification:
    slot = await session.get(Slot, slot_id)
    if slot is None:
        raise NotFoundError(f"slot {slot_id} not found")
    row = await session.get(DomainVerification, slot_id)
    if row is None:
        raise NotFoundError("no domain verification started")
    row.last_checked_at = datetime.now(UTC)
    ok = False
    if row.method == "meta_tag":
        ok = await _check_meta(slot.domain, row.token)
    elif row.method == "dns_txt":
        ok = await _check_dns(slot.domain, row.token)
    if ok:
        row.verified_at = datetime.now(UTC)
    await session.commit()
    return row


async def _check_meta(domain: str, token: str) -> bool:
    url = f"https://{domain}/"
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            resp = await client.get(url)
            found = META_RE.search(resp.text)
            return bool(found and found.group(1) == token)
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
