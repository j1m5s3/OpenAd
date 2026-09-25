# Pitch deck (source content)

Source of truth for the hosted pitch deck. The hosted deck (a slides Artifact) is generated from
this file by the orchestrator; edit this file, not the deck, when the content changes. No
customer names, quotes, or traction are claimed — the deck is honest about current stage
(testnet-ready, no customers yet).

## Slide 1 — OpenAd

- Non-custodial advertising marketplace on Base.
- Publishers mint slots and sell periods by Dutch auction (LEASE) or run them in CPC mode;
  advertisers buy periods or fund campaigns.
- USDC in, USDC out, on-chain.

> Speaker notes: Open with the one-liner. This is infrastructure, not a media buying agency —
> no platform key can move user funds; CPC budgets sit in an on-chain vault only the settler can
> charge.

## Slide 2 — Problem

- Ad networks commonly take a large cut of spend — approx. 30–50% is a typical public range for
  network/exchange intermediaries — and pay publishers on a delay (net-30/net-60).
- Approval gates and account managers slow both sides down.
- Third-party tracking is under increasing pressure (cookie deprecation, privacy regulation).

> Speaker notes: These are industry-typical, publicly cited ranges, not a claim about any named
> competitor's actual rate — treat them as context, not precision.

## Slide 3 — Solution

- Publishers mint a slot (NFT), set a calendar, and choose per slot: sell periods by Dutch
  auction (LEASE, price falls from a starting price to a floor, then further toward zero if
  unsold after the period starts) or run the slot in CPC mode, where funded campaigns compete at
  serve time instead of a period being sold.
- LEASE `buy` is one transaction with instant, atomic USDC payout split to publisher and
  treasury; CPC pays out when the settler batches a settlement.
- A tiny embed renders the current creative from a serve endpoint that never reads the chain.

> Speaker notes: Emphasize "one transaction" and "instant payout" — that's the wedge versus
> traditional ad networks' settlement delay.

## Slide 4 — Demo

- Live demo: publisher mints a slot, sets terms, advertiser buys a period, embed updates.
- CPC path: advertiser funds a campaign, serve picks a winner, click settles in a batch.
- https://claude.ai/artifact/AzkEcWfmUT23GCo2qkWxE7 — private until the owner shares it; if the
  link asks you to sign in or request access, ask the OpenAd team for access.

> Speaker notes: Run the demo live if possible; otherwise walk the linked recording. Demo mode
> uses simulated data and a simulated wallet — say so explicitly, it's not a live chain.

## Slide 5 — How it works

- LEASE: publisher sets `start_price` → `floor_price` decaying over `lead_seconds`; if still
  unsold once the period starts, price keeps falling from `floor_price` toward 0 by period end
  (remainder phase, pro-rated late buy); first `buy` in one transaction wins the period and
  writes a lease.
- CPC: advertiser opens/tops-up a campaign in an escrow vault; eligible campaigns compete at
  serve time; a settler batches charges and pays out.
- `Marketplace` never holds USDC after a transaction; the campaign vault holds only currently
  open campaign budgets.

> Speaker notes: Keep this slide diagram-first if presenting live — flow left to right:
> publisher sets terms → advertiser pays → lease/serve → payout.

## Slide 6 — Why now

- Stablecoin payments on Base make small-ticket, instant ad settlement economically practical.
- Cookie deprecation and privacy pressure reward a serve path with no third-party tracking.
- Crypto-native publishers and advertisers already hold USDC and want on-chain proof of spend.

> Speaker notes: This slide answers "why hasn't this existed before" — the rails are new, not
> the ad-tech idea.

## Slide 7 — Market

- Beachhead supply: crypto-native newsletters, dev-tool docs, block explorers, web3 blogs,
  open-source project sites.
- Beachhead demand: web3 protocols, wallets, L2s, dev-tool startups, hackathon sponsors already
  holding USDC on Base.
- Broader opportunity: any publisher/advertiser pair willing to settle in USDC, over time.

> Speaker notes: Keep the market slide to the beachhead — resist the temptation to size "all of
> digital advertising" without evidence.

## Slide 8 — Business model

- Platform fee: `fee_bps`, currently 2.5%, hard-capped on-chain at 10%, taken automatically on
  each LEASE `buy` and each CPC settlement batch.
- Revenue = fee rate × GMV (gross volume moving through the marketplace). No custody, no
  separate billing — the fee is enforced in the same transaction as payment.
- Illustrative only: 200 active publishers averaging $1,500/month in GMV each implies ~$300k
  monthly GMV and ~$7,500/month in platform revenue at 2.5% — an illustrative calculation, not a
  forecast.

> Speaker notes: Be explicit that the worked number is illustrative arithmetic, not a projection
> — investors and partners will ask.

## Slide 9 — Competition

|                           | Typical take rate (approx., public)             | Typical payout terms                                                            | Tracking                          |
| ------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------- |
| Traditional ad networks   | ~30–50%                                         | Net-30 to net-60                                                                | Third-party cookies/pixels common |
| Crypto-native ad networks | Varies, publicly listed rates differ by network | Varies                                                                          | Varies                            |
| OpenAd                    | 2.5% today, capped at 10% on-chain              | Instant, atomic with the transaction (LEASE `buy`); at each settler batch (CPC) | None in the serve path            |

> Speaker notes: See `docs/business/competitive.md` for the full comparison table; this slide is
> a summary, not the full citation list.

## Slide 10 — Go-to-market

- Beachhead: direct outreach to crypto-native publishers and advertisers, hackathon
  sponsorships, Base ecosystem channels, open-source maintainer communities.
- A GitHub README badge and shareable slot pages turn every activated publisher into a
  distribution surface for the next one.
- 0–30/30–60/60–90 day plan in `docs/business/gtm-marketing.md`.

> Speaker notes: Keep this to channels and mechanics — the detailed plan lives in the linked doc,
> don't read the whole GTM doc from the slide.

## Slide 11 — Traction and roadmap

- Current stage: protocol and off-chain stack implemented and tested on local Anvil; Base
  Sepolia deployment pending (ROADMAP 1.5); no production deployment or customers yet.
- Near-term roadmap: zero-friction demo mode, publisher growth tooling (embed code, share page),
  analytics, cross-platform scripts, production (GCP) deployment.
- Honest framing: this is a pre-launch, testnet-ready product — traction claims will follow
  activation, not precede it.

> Speaker notes: Do not overstate this slide. If pressed, say plainly: no customers yet, this is
> the plan to get the first ones.

## Slide 12 — Team

- <TEAM_PLACEHOLDER>

> Speaker notes: Fill in real team bios and roles before presenting; do not present with
> fabricated names or credentials.

## Slide 13 — Ask

- <ASK_PLACEHOLDER> (e.g. pilot publishers/advertisers, grant support, or investment — fill in
  per audience).
- Contact: <CONTACT_PLACEHOLDER>.

> Speaker notes: Tailor the ask to the audience — a grants committee, a hackathon sponsor, and an
> investor each need a different specific ask; don't leave this generic when presenting live.
