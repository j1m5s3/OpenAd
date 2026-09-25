# Go-to-market and marketing plan

Working document. Channel and tactic names are candidates to evaluate, not commitments or
partnerships already in place. No customer names, quotes, or traction are claimed.

## Positioning statement

For crypto-native publishers and advertisers who are tired of ad-network approval gates, slow
payouts, and third-party tracking, OpenAd is a non-custodial advertising marketplace on Base
where publishers mint slots and sell periods by Dutch auction (LEASE) or run them in CPC mode,
getting paid in USDC the moment
a period sells or a batch settles — unlike traditional ad networks that typically take a large
cut (approx., public list rates commonly cited in the 30–50% range) and pay out on a delay,
OpenAd charges a transparent, on-chain-capped fee (`fee_bps`, 2.5% today, capped at 10%) and
never touches user funds.

## Messaging per persona

- **Publisher (newsletter/blog/dev-docs operator):** "Mint your ad space once, set your price,
  and get paid in USDC the instant a period sells or a CPC batch settles — no ad-network
  application, no net-30 wait, no visitor tracking to maintain."
- **Advertiser (protocol/wallet/L2/dev-tool team):** "Buy verified placement on crypto-native
  sites in one transaction, or run a CPC campaign with a hard budget cap — see exactly what you
  paid for, on-chain."
- **Skeptical technical reader:** "Non-custodial by construction: read `docs/PROTOCOL.md` and the
  contract interfaces yourself. `Marketplace` never holds USDC after a transaction; the settler
  process can only call `settle_batch`."

## Channels

- Farcaster and X, crypto-developer audience.
- Base ecosystem grants programs and ecosystem showcases.
- Newsletter-operator communities (Substack/Beehiiv/Ghost creator forums).
- Hackathon sponsorships (an OpenAd slot or CPC budget as a sponsor benefit, doubling as a live
  demo of the product).
- Open-source maintainers (docs-site and README ad slots as a funding mechanism).
- A GitHub README badge — "Advertise here via OpenAd" — linking to the publisher's live slot page.

## Launch plan

The product work behind each phase below is already built (6.2–6.9); what remains is the launch
itself, the pilots, and the audit before mainnet.

- **Days 0–30 — Go live:** launch on Base Sepolia and Google Cloud (6.10), and hand-recruit pilot
  publishers with the demo and the embed tag.
- **Days 30–60 — Prove it:** pilots' CTR, eCPM and spend from the built-in dashboards go into
  advertiser outreach, alongside the first hackathon sponsorship.
- **Days 60–90 — Scale it:** the independent audit (7.10), then Base mainnet; grant applications
  and direct outreach with the deck.

## Cold-start tactics

- **House ads.** When a slot has no serveable lease or campaign, the publisher's own house ad
  fills it — already part of the product — so a newly minted slot never looks broken.
- **Seed demand with launch credits.** Fund a limited number of advertiser trial campaigns from
  the platform's own marketing budget via a normal USDC transfer to selected advertisers — this
  is a marketing spend, not a protocol change, and does not touch `Marketplace` or
  `CampaignVault` accounting rules.
- **Content calendar:** weekly build-in-public updates (protocol changes, new guide pages, demo
  improvements); a monthly "who's advertising on OpenAd" roundup once real pilots exist (no
  fabricated examples before then).
- **Funnel metrics to track:** landing-page → demo start → demo completion → publisher sign-up →
  slot minted → terms set → first lease/campaign settled; advertiser: landing-page → demo →
  creative registered → first buy/campaign funded.
- **Budget-light experiments:** a single hackathon sponsorship, a handful of direct publisher
  outreach emails/DMs, and organic Farcaster/X posts before any paid acquisition spend.
