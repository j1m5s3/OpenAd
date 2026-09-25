# Buy a period

On a **Lease** **slot**, you **buy** one **period** in a single transaction.

The Dutch **auction** opens **lead time** before the period. Price starts at the
publisher’s start price and falls to the floor at period start. Example: start
10 USDC, floor 1 USDC, lead one hour — halfway through the lead, the quote is
about 5.50 USDC. First buy wins.

You sign a USDC **permit** for **exactly** that quote (about one hour deadline).
Then one transaction: **fee** to treasury, remainder to the publisher,
`Marketplace` holds nothing after. Your **creative** is what will **serve**.

A **remainder** buy is a late purchase of leftover time in an already-started
period, when the protocol allows it.

The **lease** expires at period end. Renewal is a new buy, not an escrow.

No USDC on Base in your wallet yet? See [Getting USDC on Base](getting-usdc-on-base.md).
