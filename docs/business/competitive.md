# Competitive comparison

> **Approximate, publicly reported ranges as of 2026; verify before external use. No figure here
> is from a customer.**

This compares OpenAd against categories of alternatives a publisher or advertiser would actually
consider, not against any single named competitor's contract terms. Company names below (where
given) are **examples of the category only, and never appear next to a specific rate** — treat
every number as a typical, publicly cited range for that kind of intermediary, not a quote.

## By category

| Dimension                | Traditional display networks (e.g. large ad exchanges/networks, as a category) | Crypto-native ad networks (as a category)              | Newsletter/sponsorship marketplaces (as a category)                           | Direct/agency-sold deals                            | OpenAd                                                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------ | ----------------------------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Take rate                | ~30–50% (approx., public list rates for network/exchange intermediaries)       | Varies by network; publicly listed rates differ        | Often a flat sponsorship fee or a smaller platform cut, varies by marketplace | Negotiated, often includes an agency commission     | 2.5% today, hard-capped on-chain at 10% (`fee_bps`, `MAX_FEE_BPS`)                                                                                   |
| Payout timing            | Typically net-30 to net-60                                                     | Varies; some pay faster than traditional networks      | Often on invoice, net-15 to net-30                                            | Negotiated, often net-30+                           | Instant, atomic with the transaction (LEASE `buy`); at each settler batch (CPC)                                                                      |
| Custody of funds         | Network holds funds until payout                                               | Varies; some custodial, some on-chain escrow           | Marketplace or platform holds funds until payout                              | Advertiser or agency holds funds until invoice paid | Non-custodial: `Marketplace` never holds USDC after a transaction; `CampaignVault` holds only currently open campaign budgets                        |
| Tracking in serve path   | Third-party cookies/pixels common                                              | Varies; some still use trackers or wallets-as-identity | Usually none beyond basic email/click analytics                               | Varies by placement                                 | None — the serve endpoint never reads the chain and never proxies advertiser media                                                                   |
| Approval gate & minimums | Formal account approval, often with spend minimums                             | Varies; some open, some gated                          | Usually manual publisher approval, often with minimum sponsorship sizes       | Case by case, often high minimums                   | Publisher approves creatives per-publisher (or waives approval); no platform-level admission gate or minimum spend                                   |
| Pricing mechanism        | Real-time bidding / programmatic auction                                       | Varies (fixed rate, auction, or CPC bid)               | Usually a fixed rate set by the publisher                                     | Negotiated                                          | Dutch auction (LEASE) decaying `start_price` → `floor_price`, or CPC with a publisher floor and advertiser max, matched by generalized second price  |
| Spend transparency       | Aggregated reporting, often delayed                                            | Varies                                                 | Manual invoices/reporting                                                     | Manual invoices/reporting                           | On-chain transaction for every `buy` and `settle_batch`; off-chain analytics (CTR, eCPM, spend/earnings trend) computed from the same indexed events |
| Fiat support             | Yes                                                                            | Varies                                                 | Yes                                                                           | Yes                                                 | **No — USDC only today**                                                                                                                             |
| Audience targeting       | Often granular (behavioral, contextual, demographic)                           | Varies, often slot- or wallet-level                    | Usually just the publisher's own audience                                     | Whatever the deal specifies                         | Slot-level only today (domain, placement, size); publisher-written audience/category listings are in progress on a separate branch                   |
| Demand/fill today        | Established, high fill on major networks                                       | Varies widely by network's maturity                    | Depends on the marketplace's publisher/advertiser base                        | Depends on the relationship                         | Early: no established demand pool yet — see "Where OpenAd loses today"                                                                               |

## Where OpenAd loses today

- **USDC-only, no fiat onramp.** An advertiser without USDC on Base must bridge or on-ramp first;
  this plan does not add custodial onramp code (see `docs/ROADMAP.md` "Out of scope").
- **Cold-start demand and fill.** There is no established pool of publishers or advertisers yet;
  a newly minted slot has no guaranteed buyer, and a newly funded campaign has no guaranteed
  supply.
- **Limited targeting.** Placement is slot-level (domain, size, kind) today; publisher-written
  audience descriptions and category listings, which would let Discover filter by audience, are
  in progress on a separate branch (ROADMAP 6.3), not yet on `main`.
- **No audited contracts yet.** The protocol has not had an external security audit; see
  `docs/business/launch-checklist.md`.
- **No independent measurement or IVT vendor.** Click/impression counting and invalid-traffic
  detection are OpenAd's own off-chain logic today, not a third-party-verified measurement
  service.

## How we answer these objections

- _"No fiat onramp"_ → link to a third-party on/off-ramp in the publisher/advertiser guide
  (ROADMAP, accepted as out of scope for custody reasons; a guide link is not a protocol change).
- _"No demand yet"_ → the beachhead go-to-market plan (`gtm-marketing.md`) targets a small,
  reachable ICP (crypto-native publishers and advertisers who already hold USDC on Base) and
  seeds both sides manually before any paid acquisition.
- _"Limited targeting"_ → slot listings and category filters (ROADMAP 6.3, in progress) are the
  first targeting improvement; further targeting needs its own spec and ADR, since the protocol
  makes no promises about audience data.
- _"No audit"_ → tracked as a launch-checklist item before any mainnet deploy; nothing here
  claims an audit has happened.
- _"No IVT vendor"_ → the settler batches only "payable" clicks after the platform's own IVT
  checks (see `docs/PROTOCOL.md`); an independent measurement partner is future work, not
  promised here.

See `docs/business/pitch-deck.md` Slide 9 for the summary version of this table shown live; keep
that slide's take-rate/payout/tracking columns consistent with this file if either changes.
