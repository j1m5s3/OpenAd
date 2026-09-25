# Reading your performance numbers

Supply (publisher) and Campaigns (advertiser) each show a **Performance**
panel over a 7/30/90-day window. The numbers come from serve and click logs,
never from the chain, and update a few minutes after real activity (see the
indexer-lag notice at the top of the app).

- **Impressions** — a valid **serve** of your creative or lease/campaign, from
  the expected origin. A **house serve** (your own house ad, when nothing
  else is eligible) is counted separately and never as a paid impression.
- **CTR** — payable clicks divided by impressions, shown as a percentage. An
  **invalid click** (stale, over budget, too fast, or rate-limited) is broken
  out separately and never counted toward CTR. A **Lease** ad uses the
  advertiser's own click URL directly, so there is nothing to track: CTR
  reads "—" ("not tracked for leases") until the slot has some CPC activity.
- **eCPM** — earnings (publisher) or spend (advertiser) per 1,000
  impressions, in USDC. Shown as "—" when there were no impressions in the
  window — that is a fact about the window, not a zero.
- **Settled vs. accrued (CPC)** — a **payable click** on a CPC slot owes
  money the moment it happens, but that money only becomes real spend or
  earnings once the **settler** runs `settle_batch`. Until then it is
  **accrued** — an estimate, and unsettled. The panels always show settled
  and accrued as two separate numbers; they are never added into one total.
  The one place they meet is the daily spend chart on Campaigns, which is
  labelled "incl. unsettled" for exactly that reason.
- **Lease vs. CPC settled windowing** — a **Lease** counts on the day its
  **period** starts, not the day you bought it, so buying a Dutch-phase
  period ahead of time only shows up once that period actually starts.
  CPC-settled spend and earnings, by contrast, are **all-time totals** —
  the protocol's `Settled` event carries no timestamp to bucket by day, so a
  settlement always counts regardless of the window you have selected. The
  Earnings/Spend tile is labelled "lease (window) + CPC settled (all-time)"
  as a reminder that it mixes a windowed number with an unwindowed one.

Money throughout is USDC base units, converted to whole cents only for the
sparkline charts — the totals you read are always exact.
