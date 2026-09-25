"""Fixed category taxonomy for publisher-provided slot listings (ROADMAP 6.3, step 16).

Single source of truth for the API: ``schemas/slot.py`` uses ``Category`` for the
``GET /v1/slots?category=`` query parameter, which FastAPI/Pydantic export to OpenAPI as an
enum. The web app mirrors these values (with display labels) in
``web/src/lib/listingTaxonomy.ts`` rather than generating them, since query-parameter enums
are not part of OpenAPI's ``components/schemas`` that ``openapi-typescript`` turns into
importable types.

Off-chain only: never reference this module from ``contracts/`` or protocol-facing code.
"""

from __future__ import annotations

from typing import Literal, get_args

Category = Literal[
    "defi",
    "nft",
    "infrastructure",
    "developer-tools",
    "wallets",
    "layer-2",
    "gaming",
    "dao-governance",
    "security",
    "news-media",
    "education",
    "other",
]

CATEGORIES: tuple[Category, ...] = get_args(Category)
CATEGORY_SET: frozenset[str] = frozenset(CATEGORIES)

# Design cap (docs/PROTOCOL.md is silent here; this is an off-chain UX limit, not a protocol
# invariant): a listing may name at most this many categories.
MAX_CATEGORIES = 3
