# Publisher seat arc

Operate Supply as a **publisher** (space provider) using sim `pub-3` unless a
later phase already used that wallet. Wear this seat from both the business SME
and UX skills. Read [`README.md`](README.md) first.

Routing: defects → `docs/qa/findings/`; critique → `docs/qa/critique/`.

## P0 — Setup

1. Playwright MCP (or stop headed MCP). Stack once. Pause sim.
2. Open a critique file header (stack, journey, `devwallet=pub-3`).
3. Navigate `http://localhost:5173/supply?devwallet=pub-3`. Connect injected.

Lenses: is Anvil connect obvious, or does it read as a developer fixture?

## P1 — First impression and connect

Unsigned Discover, then connected Supply. Wallet rail, SIWE banner, glossary
(slot / period / lease / terms).

## P2 — Mint slot

Mint a slot (domain, width, height, kind). Confirm indexer shows it on Supply
and Discover. Kind must be understandable (display vs a raw `0`).

## P3 — Calendar and terms

Set calendar (period length, first start) and terms (sale mode Lease Dutch or
CPC, start/floor USDC or floor CPC, lead, approval mode). Would a yield manager
trust Unix seconds and numeric enums?

## P4 — Approvals inbox and allowlist

Approve or reject a pending creative. Allowlist an advertiser. Compare to GAM
creative review / ads.txt-style trust, not a hex form.

## P5 — House ad and domain verification

Save a house ad. Start domain verification. Is the token copy-pasteable? Does
the publisher see what visitors get when no lease is serveable?

## P6 — Earnings and pricing suggestion

Earnings in USDC base-units formatted. Pricing suggestion vs a yield tool.
Instant USDC (same-tx fee split) vs Net-60 — praise or gap?

## P7 — Embed, pause, indexer lag, mobile

Embed demo `:5174`. Pause sales. Indexer lag banner. Mobile viewport of Supply.
