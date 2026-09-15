# Mint a slot

Minting creates a **slot** NFT you own. The **SlotSpec** cannot change later:

- **Domain** — host where this slot lives (shown on Discover).
- **Width / height** — CSS pixels. Advertiser **creatives** should match.
- **Kind** — Display, Newsletter, Physical, or Other. A label for buyers, not a
  different contract.

After mint, the slot exists but cannot be sold until you set a **calendar** and
**terms**. Your wallet signs `mint_slot`. The indexer then lists the slot on
Supply and Discover.
