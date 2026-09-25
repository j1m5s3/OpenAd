# Market fit assessment

Working document. Figures marked "illustrative" are worked examples, not observed data; figures
marked "approx., public" are typical/public industry ranges, not measured facts about OpenAd.
No customer names, quotes, or traction are claimed anywhere in this document.

## Summary verdict

**Technically sound, not yet market-ready.** The protocol is a real differentiator: non-custodial
(publishers and advertisers sign their own transactions; no code in `api/` or `web/` holds keys
that move funds or write leases), instant atomic USDC payout on `buy`, a low platform take
(`fee_bps` = 250, i.e. 2.5%, hard-capped at `MAX_FEE_BPS` = 1000 = 10%, governed on-chain) versus
typical ad-network take rates of roughly 30–50% (approx., public list rates), no third-party
tracking in the serve path, and both LEASE (Dutch auction, one-tx buy) and CPC (campaign, GSP
serve-time matching) sale modes. Adoption today is blocked by product and go-to-market gaps, not
by protocol gaps — see "Adoption blockers" below.

## Product today

- **LEASE mode.** Publisher sets per-slot `Terms` (`start_price`, `floor_price`, `lead_seconds`,
  `sale_end`, `approval_mode`). Price decays linearly from `start_price` to `floor_price` over
  `lead_seconds`; after the period starts, an unsold period enters a remainder phase where price
  falls from `floor_price` toward 0 by the period's end (a pro-rated late buy, PROTOCOL §4.2).
  The first `buy` in one transaction pays USDC, splits `fee_bps` to the platform treasury
  (owner-settable, visible on-chain) and the remainder to the publisher, and writes a lease for
  one period. No bids, escrow, or settle steps in LEASE mode.
- **CPC mode.** Advertisers open/top-up a campaign (max CPC, creative, budget) in `CampaignVault`;
  eligible campaigns compete at serve time (generalized second price); a settler process batches
  `settle_batch` calls that pay the treasury fee and the publisher out of escrowed, payable
  clicks. `CampaignVault` may hold USDC equal to open `remaining`; `Marketplace` never holds USDC
  after a transaction.
- **Fee.** `fee_bps` = 250 today, capped at `MAX_FEE_BPS` = 1000, set by the contract owner and
  visible on-chain; not adjustable from `api/` or `web/`.
- **Non-custodial.** No HTTP process holds a private key that can move funds or write a lease.
  The opt-in `sim/` daemon uses public Anvil keys on chain id 31337 only. The CPC settler process
  may hold `OPENAD_SETTLER_KEY` and may only call `settle_batch`.
- **Serving.** The embed and `api/src/openad/serve/` never read the chain in the request path and
  never proxy advertiser media URLs; CPC clicks may redirect (302) through `/v1/c`.

## Beachhead ICP

**Supply (publishers):** crypto-native publishers with engaged, technical audiences —
newsletters (Substack/Beehiiv/Ghost), developer-tool docs sites, block explorers and dashboards,
web3 blogs, podcast show-notes pages, open-source project sites.

**Demand (advertisers):** web3 protocols, wallets, L2s, developer-tool startups, and hackathon
sponsors that already hold USDC on Base and want a cookieless, verifiable, brand-safe placement
bought in a single transaction.

**What they value:** payout in seconds (not net-30/net-60), a low, transparent take rate, no
ad-network approval gate, no third-party tracking, and on-chain proof of spend.

## Jobs-to-be-done

- _Publisher:_ "Let me turn my existing audience into revenue without joining an ad network,
  without waiting on payout, and without shipping visitor data to a tracker."
- _Advertiser:_ "Let me buy verifiable, brand-safe placement on crypto-native sites in one
  transaction, with proof of what I paid for, and without a Big Ad account manager."

## Why now

- Stablecoin payments on Base make instant, low-fee USDC settlement practical for small-ticket ad
  buys that wouldn't clear traditional card/ACH rails economically.
- Third-party cookie deprecation and rising privacy pressure make "no tracking, serve without
  chain reads" a genuine differentiator rather than a compliance afterthought.
- Typical ad-network and exchange take rates are commonly cited in the 30–50% range (approx.,
  public list rates for network/exchange intermediaries), leaving publishers open to a
  materially lower, transparent, on-chain-verifiable fee.

## Adoption blockers → ROADMAP mapping

| #   | Blocker                                                                                                                        | Addressed by                                                                            | Status (2026-09-25)                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Nobody can see it work without running Anvil + Postgres + a wallet; no demo, landing page, or value proposition in the README. | 6.2 (demo mode + static showcase), 6.7 (README rewrite)                                 | Shipped — demo mode PR #8; README rewrite PR #11, extended in PR #TBD-36.                                                                                              |
| 2   | Publisher onboarding ends at "mint a slot"; no copy-paste embed code, no shareable slot page, no CMS instructions.             | 6.3 (publisher growth: embed code panel, share page, guide)                             | Shipped — embed code panel and share page PR #10; slot listings and category filter PR #13.                                                                            |
| 3   | Advertisers and publishers see no performance numbers (CTR, eCPM, spend/earnings trend) — the first question every buyer asks. | 6.4 (analytics read model + UI)                                                         | Shipped — PR #9.                                                                                                                                                       |
| 4   | Run scripts are PowerShell-only; no production hosting config.                                                                 | 6.5 (cross-platform scripts), 6.6 (GCP deploy)                                          | Shipped — cross-platform scripts PR #5; GCP deploy artifacts PR #7 (the live deploy is user-run, ROADMAP 6.10).                                                        |
| 5   | USDC-only with no fiat onramp.                                                                                                 | Accepted as out of scope (see below); mitigated by onramp guide links in 6.7, not code. | Mitigated, not solved — onramp guide added in PR #TBD-36 (`docs/guide/advertiser/getting-usdc-on-base.md`); the protocol is unchanged and remains USDC-only by design. |

## Earning model

Platform revenue is `fee_bps` (currently 250, i.e. 2.5%) of LEASE `buy` and CPC `settle_batch`
volume, paid to the platform treasury (owner-settable, visible on-chain) in the same transaction.
The fee is capped
on-chain at `MAX_FEE_BPS` (1000 = 10%) and is not a variable the roadmap proposes changing;
**GMV (gross merchandise volume moving through `buy`/`settle_batch`) is the lever.**

Illustrative worked example (hypothetical, not a forecast):

| Publishers activated | Avg. monthly GMV per publisher | Total monthly GMV | Platform revenue at 2.5% |
| -------------------- | ------------------------------ | ----------------- | ------------------------ |
| 200                  | $1,500                         | $300,000          | $7,500/mo                |
| 1,000                | $1,500                         | $1,500,000        | $37,500/mo               |

Both rows are illustrative arithmetic on assumed inputs, not projections or commitments.

### Levers that raise GMV without breaking invariants

- Faster publisher activation: a copy-paste embed snippet and a shareable slot page (6.3) so a
  publisher goes from "mint" to "live ad unit" without touching code beyond pasting a tag.
- Demand-side confidence: analytics (CTR, eCPM, spend/earnings trend, 6.4) and an earnings
  calculator on the demo showcase (6.2) so advertisers and publishers can evaluate the
  marketplace before committing spend.
- A zero-friction demo (6.2) that lets a prospect see the full LEASE and CPC flow, and the embed
  rendering a creative, without running local infrastructure or connecting a real wallet.

### Optional later levers (recorded here only; not built in this plan)

- Featured-slot listings: off-chain merchandising, paid in USDC by a normal transfer outside the
  protocol — would need its own ADR before implementation.
- Publisher referral attribution: off-chain tracking of who referred an activated publisher —
  would need its own ADR before implementation.

## Deliberately not doing

Per `docs/ROADMAP.md` "Out of scope": English or sealed-bid occupancy auctions, per-click chain
transactions, advertiser HTML/JS creatives, custodial onboarding, multi-currency settlement, a
sublease market, publisher-set actual CPC, and ranking by locked click budget are not built
without a new ADR.

Per `AGENTS.md` non-negotiable invariants: no code in `api/` or `web/` signs user transactions or
holds keys that can move funds or write leases; `Marketplace` never holds USDC after a
transaction; `CampaignVault` may hold only open `remaining`; serving never reads the chain and
never proxies advertiser media; one transaction to buy in LEASE mode with no bids, escrow, settle
steps, or keepers on `Marketplace`.

This plan proposes **no protocol contract changes** (D8). Anything that would require one is
recorded above as future work needing a spec and an ADR first.

## Risks

- **Cold start, two-sided market.** Publishers won't onboard without advertiser demand;
  advertisers won't spend without inventory. Mitigated by a demo that shows both sides working
  without needing real counterparties first, and by targeting a beachhead ICP small enough to
  seed manually.
- **USDC-only friction.** Advertisers without USDC on Base must bridge/onramp first. Accepted as
  out of scope for this plan; mitigate with guide links to onramps, not new custody code.
- **Invalid traffic (IVT) on CPC.** Payable-click charges depend on IVT detection quality; weak
  detection either overcharges advertisers or lets click fraud through.
- **Regulatory and brand-safety.** On-chain, cookieless ad payments and NFT_REF creatives sit in
  an evolving regulatory area; brand-safety review is currently publisher-approval based, not
  automated.

## Success metrics

- Activated publishers (minted a slot, set terms, and completed at least one lease or campaign
  settlement).
- GMV (LEASE `buy` + CPC `settle_batch` volume) over time.
- Fill rate (periods sold vs. periods available; campaigns funded vs. eligible impressions).
- Time-to-first-payout for a newly activated publisher.
