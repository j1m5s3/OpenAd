# Advertiser seat arc

Operate Discover, Campaigns, and buy as an **advertiser** using sim `adv-6`
unless a later phase already used that wallet. Wear this seat from both the
business SME and UX skills. Read [`README.md`](README.md) first.

Routing: defects → `docs/qa/findings/`; critique → `docs/qa/critique/`.

## P0 — Setup

1. Playwright MCP (or stop headed MCP). Stack once. Pause sim.
2. Critique file header (`devwallet=adv-6`).
3. Navigate `http://localhost:5173/?devwallet=adv-6`. Connect injected.

## P1 — Discovery

Filters, domain search, SlotCard, slot page shareability. Can a media buyer see
size, domain, live price, time remaining, and verified-domain without hunting?

## P2 — Register creative

Campaigns: file hashed locally, public URI, MIME, dimensions, click URL. NFT_REF
path. Verification states. Compare to Ads Manager asset upload — OpenAd never
hosts the bytes; hash + URI is the model.

## P3 — Request approval

REQUIRED vs WAIVED comprehension. Request approval with a publisher address and
creative. Empty/error copy when the creative is blocked or revoked.

## P4 — Buy or fund

LEASE: period table vs calendar. Quote, fee split, permit, one transaction.
CPC: Buy hidden; fund from Campaigns (`open_campaign_with_permit`). Do not call
CPC occupancy an auction.

## P5 — Leases, campaigns, and delivery

Leases calendar. CPC remaining, pause/close, settle fee line. Delivery from
`serve_events`. Spend vs GAM/Meta reporting — on-chain attribution is out of
scope; is the honest lease/campaign model explained?

## P6 — Remainder and renewal

Buy remainder. What happens at period end? Is renewal a new buy, not escrow?

## P7 — Brand safety

Blocked/revoked creatives, verified-domain badge, house-ad fallback on embed.
JS/HTML creatives are out of scope — frame hash-verified raster as the answer.
