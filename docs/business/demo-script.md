# Demo script

For live pitches, using the hosted demo:
**[Live demo →](https://claude.ai/artifact/AzkEcWfmUT23GCo2qkWxE7)** (private until the owner
shares it; if the link asks you to sign in or request access, ask the OpenAd team for access).

## Pre-flight

- The Artifact is shared with the audience ahead of time, or you present it yourself on screen.
- Chrome, browser window at least 1280px wide, zoom at 100–110%.
- A full page reload resets the demo store and disconnects the demo wallet — by design (ADR-0016).
  Do not reload mid-demo unless you want to restart.
- Every persona (publisher and advertiser) is fictional — say so if asked.
- The banner reads "Demo — simulated data, no real funds or chain" at all times. Say this out
  loud once, early, so nobody mistakes it for a live chain.

## Three talk tracks

Routes below are the demo's real hash routes: `#/`, `#/slots/<id>`, `#/campaigns`, `#/supply`,
`#/embed-demo`, `#/why`.

### 2-minute (hallway)

1. **`#/` (Discover), as the advertiser.** Click "Take the tour" from the banner.
   - _Say:_ "Every slot a publisher has listed — no sign-up, no ad-network approval gate."
   - _Proof point:_ Discover's slot grid, filterable by placement and auction state.
2. **Tour step 2 — `#/slots/0`, the Dutch price falling.**
   - _Say:_ "The price opens high and falls to a floor. First buy at or below your max wins."
   - _Proof point:_ the live countdown/price on the slot's period table.
3. **Tour step 3 — Buy the period.**
   - _Say:_ "One transaction: the fee goes to the treasury and the rest to the publisher,
     atomically — `Marketplace` never holds the USDC."
   - _Proof point:_ the wallet balance drops by exactly the quoted price.
4. **Tour step 6 — `#/embed-demo`, then finish on `#/why`.** Enter one impressions/eCPM pair.
   - _Say:_ "This is the real `<open-ad>` element, not a mock-up. And here's what you'd keep."
   - _Proof point:_ the calculator's "OpenAd payout" line versus a typical network's cut.

### 5-minute (investor or partner)

1. Run the full 6-step guided tour end to end (Discover → slot → buy → Supply → Campaigns →
   embed), narrating each step's "say this" line above, plus:
   - **Tour step 3 — the receipt, before closing the dialog (about 20–30 seconds).**
     - _Say:_ "Here's the receipt: price paid, the publisher/fee split, and the transaction hash —
       nothing left in `Marketplace`."
     - _Proof point:_ the "Lease confirmed" panel with price, split, tx hash, and "View slot".
   - **Tour step 4 — `#/supply`, as the publisher.**
     - _Say:_ "Earnings already reflect every lease and settlement, net of OpenAd's 2.5% fee."
     - _Proof point:_ the Supply page's performance tiles (earnings, eCPM, CTR trend).
   - **Tour step 5 — `#/campaigns`, CPC.**
     - _Say:_ "CPC slots run on a floor CPC instead of a Dutch auction; campaigns compete at serve
       time against payable clicks."
2. Return to `#/supply` and point at the performance tiles again (or open `#/why` and run the
   calculator with the audience's own numbers) if there's time — this is the number a publisher
   or investor actually wants to see.

### 15-minute (publisher or advertiser deep dive)

Skip the guided tour; walk the manual path so you can pause and answer questions.

1. **On `#/` (Discover), filter by a category** (e.g. "DeFi"). Point out the listing badges on
   the filtered cards — publisher-written audience/category text, self-described and not
   verified on-chain.
2. **As advertiser Nimbus Wallet, buy a LEASE period on `#/slots/0`.** Point out the price
   falling in real time, then buy. Before closing the dialog (about 20–30 seconds), show the
   receipt: price paid, the publisher/fee split, the transaction hash, and "View slot" — then
   close it and show the wallet balance dropped by exactly the quote.
3. **Switch persona to advertiser Fastlane L2** ("Viewing as" → Advertiser — Fastlane L2), then
   **open a CPC campaign on `#/campaigns`.** Fund it, point out the hard budget cap (`remaining`
   never exceeds what was funded).
4. **Switch to publisher Basecamp Weekly.** On `#/supply`:
   - Show pending creative approvals and approve one.
   - Show earnings = price − fee for the LEASE sale just made.
   - Show the performance panel (CTR, eCPM, spend/earnings trend).
5. **`#/embed-demo`.** Show the real `<open-ad>` element rendering a creative for a chosen slot —
   say explicitly that this makes no chain read.
6. **`#/why`.** Plug in the audience's own approximate impressions and eCPM numbers and let them
   read the payout comparison themselves.

## Q&A crib

- **"Is this real money?"** No — the hosted demo is simulated data and a simulated wallet by
  design (ADR-0016); it never opens an RPC connection or signs a real transaction. The protocol
  itself settles real USDC on Base once deployed.
- **"Who holds the funds?"** Nobody at OpenAd. No code in `api/` or `web/` can sign a user's
  transaction or move their funds. `Marketplace` never holds USDC after a transaction; the
  campaign vault holds only currently open, unspent campaign budgets, released only by
  `settle_batch` or `finalize_close`.
- **"What if nobody buys a period?"** The Dutch price keeps falling toward a floor, and past the
  period start it keeps falling toward zero (a pro-rated late buy). If it still goes unleased,
  the publisher's own house ad fills the slot so it never looks broken.
- **"What about click fraud (CPC)?"** Only "payable" clicks — ones that pass the platform's own
  token and invalid-traffic checks — are ever charged; a settler batches those, never a raw click
  count.
- **"Do you support fiat?"** Not today — USDC only, on Base. That is an accepted, documented gap
  (see `docs/business/competitive.md`); mitigated by
  `docs/guide/advertiser/getting-usdc-on-base.md` (PR #16), which walks advertisers through
  getting USDC on Base without endorsing or linking any specific provider — not custodial code.
- **"Has this been audited?"** No. That is a launch-checklist item before any mainnet deploy —
  see `docs/business/launch-checklist.md`.
- **"Why Base and USDC?"** Low fees and fast finality make small-ticket, instant ad settlement
  practical, and USDC is a widely available stablecoin on Base.
- **"How do you make money?"** A fee (`fee_bps`, 2.5% today, hard-capped on-chain at 10%) on
  gross volume moving through `buy` and `settle_batch` — set by the contract owner, visible
  on-chain, never adjustable from `api/` or `web/`.

## Recovery

- **The wallet disconnected.** Click "Connect Wallet" → "OpenAd Demo Wallet" again.
- **The tour dialog closed early.** Click "Take the tour" in the banner to restart it.
- **State looks odd (wrong persona, stale numbers).** A full page reload resets the demo store to
  its seeded fixtures — this is expected, not a bug, but it does restart the demo.

## Follow-up email template

> Subject: OpenAd — demo and deck
>
> Hi <NAME>,
>
> Thanks for the time today. As promised:
>
> - Live demo: https://claude.ai/artifact/AzkEcWfmUT23GCo2qkWxE7 (private — let me know if it
>   asks you to sign in or request access, and I'll grant it)
> - Pitch deck: https://claude.ai/artifact/Day12XXUFNi7CJdNpa2MUH
>
> <ONE-LINE CTA SPECIFIC TO THIS CONVERSATION — e.g. a pilot slot, a follow-up call, a grant
> application deadline>
>
> Happy to answer anything that comes up as you look through it.
>
> <YOUR NAME>

Fill in `<NAME>`, `<YOUR NAME>` and the CTA per recipient — do not send with placeholders left in,
and never invent a name, quote, or metric that isn't in this document or `market-fit.md`.
