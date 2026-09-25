# ADR-0014: Dual sale mode — keep Dutch leases, add per-slot CPC campaigns

- **Status:** Accepted
- **Date:** 2026-09-14
- **Scope:** contracts, api, web, embed, repo

## Context

v1 sells a **period**: exclusive time on a slot, Dutch (or remainder) price, one
`buy`, `Marketplace` holds no USDC. That is a billboard. Advertisers pay even if
nobody clicks; publishers with real traffic cannot earn more without raising
terms by hand.

A Google Ads analog sells a **serve/click opportunity**: many funded
**campaigns** compete, the advertiser sets **max CPC**, the publisher sets a
**floor CPC**, actual charge is second-price (GSP), leftover budget refunds.
That needs escrow, a click meter, and a privileged settler — all forbidden in
v1 without an ADR (`ROADMAP.md` out of scope: English occupancy auctions and
on-chain per-click attribution).

Toy same-world prototypes (lease vs open CPC vs exclusive-lease-plus-publisher-CPC)
showed:

- Open CPC with advertiser max CPC and GSP is the only variant that is actually
  Google-like and that can let quality beat a high bid.
- Dual **sale mode** per slot is how this repo keeps sponsorship takeovers.
- Exclusive occupancy plus a publisher-set CPC pot is a worse clone (first-price
  lease, click tax, fraud after the lease is paid). Rejected.

The question: how to add CPC matching without deleting Dutch `buy`.

## Decision

**Dual sale mode (B) with an open CPC engine (A) inside `CPC` mode. Reject
exclusive-lease-plus-CPC (C). Reject English/sealed occupancy auctions.**

Normative protocol text is `PROTOCOL.md` §11 (status: **Specified**, not
implemented). This ADR is the why and the invariant carve-outs.

### 1. Sale mode is per slot, on `Terms`

`SaleMode` (`uint8`): `0 = LEASE` (default, v1 Dutch/`buy`), `1 = CPC`.

- `LEASE`: v1 unchanged. `buy` / `buy_with_permit` / `quote` / remainder. No
  campaign matching. `Marketplace` still holds 0 USDC after every tx.
- `CPC`: `buy` reverts `"cpc mode"`. Matching is off-chain at serve time.
  USDC lives in a new **`CampaignVault`**, not in `Marketplace`.
- A slot is one mode at a time. The publisher flips mode via `set_terms`.
- `LEASE → CPC` reverts `"leases outstanding"` while `last_leased_end > now`.
- `CPC → LEASE` reverts `"campaigns open"` while any campaign for that slot is
  not `closed`.

Do not overload the glossary term **auction** (that remains the Dutch schedule).
UI copy for mode 1 is **CPC** / **campaign**, never “auction” for occupancy.

### 2. Who sets prices

- Publisher sets **`floor_cpc`** (USDC base units, `> 0` in CPC mode).
- Advertiser sets **`max_cpc`** and a **budget** on a **campaign**.
- Actual charge per **payable click** is GSP, integer math, `PROTOCOL.md` §11.3:
  `min(winner.max_cpc, max(floor_cpc, runner_up.ad_rank / winner.q + CPC_TICK))`.
  One eligible campaign pays `floor_cpc`, not their max.
- `CPC_TICK = 10_000` (0.01 USDC). `q = Q_DENOM = 1_000_000` in the first
  implementation (quality is a later serve-only increment; no protocol change).
- Publisher-set *actual* CPC is forbidden.

### 3. `CampaignVault` escrows; `Marketplace` does not

New contract, ownable, USDC / AdSlot / CreativeRegistry / Marketplace immutables
(or duplicated `fee_bps` + `treasury` with the same `MAX_FEE_BPS`). Replaceable
independently of `AdSlot` (principle 6).

A **campaign** is `(advertiser, slot_id, creative_id, max_cpc, remaining,
valid_from, valid_until, paused, close_after, closed)`. Ids start at 1.
Several open campaigns per slot (including several from one advertiser) are
allowed; they compete.

Advertiser txs: `open_campaign`, `top_up`, `set_max_cpc`, `set_paused`,
`request_close`, and `finalize_close` after `CLOSE_DELAY_SECONDS` (default 3600;
anyone may finalize). `open_campaign` uses the same creative/approval/dimension
checks as `buy` at tx time. Revoke after fund does not auto-refund; the
advertiser `request_close`s. Serve re-checks indexed eligibility every request.

`Marketplace.buy` never writes a lease in CPC mode. `AdSlot.userOf` /
`userExpires` stay lease-only (empty on a CPC slot with no leftover lease).

### 4. Matching is at serve, never on RPC

`GET /v1/serve/{slot_id}` still must not import `openad.chain`. Eligible
campaigns come from indexed rows + verification:

- terms `sale_mode == CPC`, not paused;
- campaign open, not paused, not past `close_after` as ineligible for *new*
  serves, `remaining >= floor_cpc`, flight window contains `now`;
- creative verified, active, dimensions match (MEDIA);
- not blocked; if `REQUIRED`, approved or allowlisted.

Highest `ad_rank = max_cpc * q / Q_DENOM` wins. Unverified/blocked skipped;
if none remain → house ad → empty (existing fallback). Serve JSON gains
`status: "campaign"`; `creative.clickUrl` is a platform click token, never the
raw advertiser URL. Embed still renders `<a><img></a>` from serve (ADR-0006
**media** path unchanged: bytes only from `/media`).

`LEASE` serve rule is unchanged (`PROTOCOL.md` §7).

### 5. Payable clicks are off-chain; settlement is batched on-chain

Embed/media still do not see advertiser origin. **Clicks** go
`GET /v1/c/{token}` → one-time HMAC token → 302 to `creative.click_url`.

A click is **payable** only if: token unused and unexpired, matching
`serve_event`, campaign still open with `remaining` enough to cover the GSP
recorded at serve, IVT caps pass. House-ad clicks are never payable.

**IVT (first cut):** one use per token; token TTL 1 hour; max payable clicks
per campaign per hour (config); discard if no prior serve. Raw IP is not stored
on `serve_events`. The click route keeps a short-TTL HMAC of the trusted-hop
client key (`OPENAD_TRUSTED_PROXY_HOPS`) and `slot_id`, in a bounded map, for
burst discard (`OPENAD_CLICK_IVT`); it is skipped, and logged, until the hop
count is verified in staging (ROADMAP 6.14). No cookies in the embed.

**Settler** (platform EOA, like moderator): `settle_batch(campaign_id,
payable_clicks, charged_usdc, batch_id)`. On-chain checks: caller is settler,
campaign not `closed`, `batch_id` unused, `charged_usdc <= remaining`,
`charged_usdc > 0`. Then fee → treasury, rest → `ownerOf(slot_id)` at settle
time, decrement `remaining`. `payable_clicks` is event metadata; money is
`charged_usdc`. Idempotent `batch_id`.

HTTP `api/` and `web/` still hold **no** spending keys. Settler is a separate
process (`python -m openad.settler`), same image as indexer, env-gated. It
cannot open campaigns or write leases. Unsettled clicks in the `CLOSE_DELAY`
window may still settle; `finalize_close` refunds whatever `remaining` is left
(publisher can lose at most one delay of unpaid clicks if the settler is down —
documented).

Per-click chain transactions are forbidden.

### 6. What stays forbidden

- English or sealed-bid **occupancy** (who *owns* the period).
- Publisher-set actual CPC; ranking by locked budget.
- HTML/JS creatives; serving advertiser media URLs; cookies/fingerprinting in
  the embed.
- `api/`/`web/` signing user txs or holding keys that move funds or write
  leases.
- Auto-refund on revoke (same as v1 leases).

## Alternatives considered

- **Replace Dutch entirely (shape A only)** — kills exclusive sponsorships
  (house takeovers, newsletters, physical). Rejected as the only mode.
- **Exclusive lease + CPC pot (shape C)** — first-price occupancy plus
  publisher CPC. Advertisers shade the lease when they expect clicks; fraud
  drains the pot after the lease is already paid. Rejected.
- **Put escrow in `Marketplace`** — violates the pass-through invariant for
  every `buy`. A second contract keeps Dutch tests honest.
- **Advertiser-reported or publisher-reported clicks** — the paying / paid
  party will cheat. Platform redirect is the only meter that matches hashed
  media serving.
- **On-chain per-click `transferFrom`** — gas and bot surface. Batch settle
  only.
- **Merkle-challenge settler** — honest but a v1.3. First cut: caps, public
  `click_events`, advertiser pause/close, `MAX_BATCH_CHARGE`.
- **CTR quality in the first protocol drop** — needs stable serve/click
  history. Ship `q = 1`; add `q` in serve later.

## Consequences

- v1 Dutch product remains default (`LEASE`). CPC is opt-in per slot.
- New privileged role **settler** (drain risk: fake payable clicks → colluding
  publisher). Threat model T11+. Residual: same class as moderator, plus money.
- Serve JSON and embed types gain `campaign`. Click 302 is an intentional
  exception to “never touch advertiser URLs” that applies only to navigation,
  not media (ADR-0006 still holds for bytes).
- `set_terms` / `TermsSet` grow `sale_mode` and `floor_cpc` (new Marketplace
  deploy, `AdSlot.set_market`, because v1 has no proxies).
- Indexer, Alembic, Discover/Supply/Campaigns, sim, e2e all grow a CPC path.
- Glossary: **auction** stays Dutch; new terms are **sale mode**, **campaign**,
  **floor CPC**, **max CPC**, **campaign vault**, **settler**, **payable click**.

## References

- `PROTOCOL.md` §1 principles 3–4 (LEASE), §7 (LEASE serve), **§11 (CPC,
  Specified)**, §9.
- `ARCHITECTURE.md` §2, §3.2–3.4, §6 (Specified CPC rows).
- ADR-0003 (Dutch occupancy), ADR-0004 (approvals), ADR-0006 (media cache).
- GSP: Varian / Edelman–Ostrovsky–Schwarz; Google Ads second-price CPC as
  product analog, not as a cloned stack (no keywords, cookies, or HTML5).
