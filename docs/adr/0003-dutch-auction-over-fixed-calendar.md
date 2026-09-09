# ADR-0003: Dutch auction per period over a publisher-defined calendar

- **Status:** Accepted
- **Date:** 2026-09-08
- **Scope:** contracts

## Context

Ad space is a time-bounded rental, not a permanent asset. We need a price-discovery mechanism
that (a) settles in one transaction, (b) needs no bid escrow, settlement step, or keeper,
(c) naturally supports a fixed-price "rate card", and (d) lets publishers sell recurring
inventory without a transaction per listing.

## Decision

1. Each slot has a **calendar** (`period_seconds`, `first_period_start`) that defines fixed,
   non-overlapping periods. The publisher sets it once; no per-period transaction is needed.
2. Each period is sold by a **Dutch auction** parameterised by the slot's **terms**:
   price starts at `start_price` when the auction opens (`lead_seconds` before the period
   starts) and decays linearly to `floor_price` at period start. The first `buy` wins.
3. **Fixed price is the degenerate case** `start_price == floor_price`. There is no separate
   fixed-price mechanism.
4. The auction closes at period start in v1 (no late buy). Late buy at pro-rated floor is
   specified as v1.1 (`PROTOCOL.md` §9).
5. Leases are keyed by `(slot, calendar version, period index)`; the calendar can only be
   replaced when no lease is active or in the future (`last_leased_end <= now`).

## Alternatives considered

- **English (ascending) auction** — needs bid escrow, an end/settle step, anti-sniping logic,
  and keepers; multiple transactions per buyer. Competition in a Dutch auction shows up as
  "sold early at a high price", which is enough signal for publishers to reprice. Revisit only
  if data shows many simultaneous bidders per period.
- **Sealed-bid second-price** (what ad exchanges use) — commit/reveal is two transactions and
  hostile UX on-chain.
- **One-off listings instead of a calendar** — a transaction per period per slot; unworkable
  for daily inventory.
- **Period-tokens (mint an NFT per slot-period)** — more composable but explodes token count and
  complicates the "slot is the permanent asset" model. ERC-4907-style leases on one slot token
  are simpler.
- **Explicit `(start, end)` leases with overlap checks** — needs interval search on-chain; fixed
  periods make overlap impossible by construction.
- **Calendar epochs** (allow changing the calendar while leases exist) — deferred to v2; v1's
  "no outstanding leases" rule is simple and safe.

## Consequences

- Pricing is a pure function of terms and time; `Marketplace.quote` can be called by the UI
  without a transaction.
- Recurring inventory needs zero publisher transactions after setup.
- A publisher who wants to change period length must pause and wait for leases to run out.
- A future VRGDA-style autopilot can adjust `start_price`/`floor_price` from sales data without
  any protocol change.

## References

- `PROTOCOL.md` §3.1, §3.2, §4.
- EIP-4907 (rentable NFT) for the `userOf`/`userExpires` read views.
- Paradigm, "Variable Rate GDAs" (future pricing autopilot).
