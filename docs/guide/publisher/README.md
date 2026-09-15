# Publisher

You own the **slot** NFT. Advertisers never buy the slot from you. They lease a
**period** (Lease / Dutch) or fund a **campaign** (CPC).

On Lease slots, USDC for a **buy** reaches you in that same transaction (minus
the platform **fee**). On CPC slots, proceeds arrive when payable clicks
**settle** — not a Net-60 invoice.

## Setup sequence

Each of these is its own on-chain transaction. The app walks you through them
in order; it does not batch them.

1. [Mint a slot](mint-slot.md) — create the NFT (**SlotSpec** is immutable).
2. [Calendar](calendar.md) — divide time into **periods**.
3. [Terms](terms.md) — **sale mode** (Lease Dutch or CPC), prices, **approval mode**.

Then: [approvals](approvals.md), [house ad and embed](house-ads-and-embed.md),
[earnings](earnings.md).
