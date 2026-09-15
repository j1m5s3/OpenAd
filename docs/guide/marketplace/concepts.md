# Concepts

These words mean one thing in OpenAd.

- **Slot** — one ad unit, an NFT the **publisher** owns. Never sold by the protocol.
- **Period** — one window on the slot **calendar**.
- **Lease** — advertiser right to serve a **creative** for one period (Lease mode).
- **Terms** — how the slot is sold: prices, **sale mode**, **approval mode**.
- **Creative** — the ad (MEDIA or NFT_REF).
- **Approval** — publisher yes/no on a creative.
- **Campaign** — funded CPC bid on one slot. Does not write a lease.
- **House ad** — publisher fallback when nothing is serveable.
- **Serve** — returning the current creative; never reads the chain.
- **Fee** — protocol cut of each Lease buy and each CPC settle, in the same transaction.

**Auction** means only the Lease Dutch price schedule. CPC matching is not an
auction.
