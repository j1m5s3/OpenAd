# Terms

**Terms** are how this **slot** is sold. One **sale mode** at a time. Setting
terms is its own transaction.

## Sale mode

**Lease (Dutch)** — each **period** has a Dutch **auction**. Price starts at
**start price**, decays to **floor price** at period start. First **buy** wins
the **lease**. Lead time is how long before the period the auction opens.

**CPC** — advertisers fund **campaigns**. There is no period **buy**. Serve
picks a winner at your **floor CPC**. Matching is not an occupancy auction.

## Floor CPC

On CPC slots, advertisers cannot go below this per payable click. Ignored on
Lease slots.

## Approval mode

**Required** — a **buy** or CPC `open_campaign` needs an **approved** (or
**allowlisted**) **creative**.

**Waived** — any active, non-**blocked** creative may run. Use this when you
trust the advertiser set.

## Pause

Pause sales to stop new buys / new campaigns without deleting the slot.
