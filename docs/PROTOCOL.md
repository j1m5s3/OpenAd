# OpenAd Protocol Specification (v1)

Status: **Implemented** (Anvil via ROADMAP 1.4 for LEASE; ROADMAP 5.2–5.3 for CPC /
`CampaignVault`). Live on Base Sepolia (§10; `docs/deploy-sepolia.md`).
Signatures are canonical in `contracts/src/interfaces/*.vyi`. Semantics are canonical here.
If you change one, change the other in the same commit.

Terms are defined in [`GLOSSARY.md`](GLOSSARY.md). Read it first.

---

## 1. Overview

Four Vyper contracts on Base, settled in USDC:

| Contract           | Responsibility                                                                                                    | Owner-of-record            |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `AdSlot`           | ERC-721 collection of slots. Holds each slot's `SlotSpec`, `Calendar`, and `Lease`s. Exposes ERC-4907 read views. | Platform (`set_market`)    |
| `Marketplace`      | Per-slot sale `Terms`, Dutch pricing, `buy` (payment + fee split + lease write).                                  | Platform (fee/treasury)    |
| `CreativeRegistry` | Creatives, publisher approvals/allowlists, moderator revocation.                                                  | Platform (`set_moderator`) |
| `CampaignVault`    | CPC campaign escrow + batch settle (ADR-0014, §11).                                                               | Platform (fee/treasury/settler) |

Design principles (do not violate without an ADR):

1. **Non-custodial.** Publishers and advertisers sign their own transactions. The platform key can only change fee/treasury/moderator/market/settler settings; it can never write leases. HTTP `api/` and `web/` never hold keys that move funds. `CampaignVault` (ADR-0014) may hold campaign USDC; only the **settler** EOA may `settle_batch`.
2. **The slot is permanent; the lease is temporary.** Slots are never sold by the protocol; only periods are leased. Publishers may transfer slot NFTs freely (standard ERC-721); leases and future proceeds follow the token. CPC mode does not write leases.
3. **One transaction to buy (LEASE mode).** Dutch auction, first taker wins, atomic payment + lease. No bids, no escrow, no settle step, no keepers **on `Marketplace`**.
4. **Funds pass through `Marketplace`.** `Marketplace` never holds USDC; each buy pushes the fee to the treasury and the remainder to the publisher. CPC budgets escrow in `CampaignVault` (ADR-0014, §11).
5. **Everything emits an event.** The off-chain indexer must be able to rebuild all read state from logs alone.
6. **The asset outlives the logic.** `AdSlot` is the permanent contract; `Marketplace` and `CampaignVault` are replaceable. No proxies in v1.

---

## 2. Roles and access control

| Action                                                                       | Platform owner | Moderator |     Publisher (slot owner)      |   Advertiser   | `Marketplace` contract |
| ---------------------------------------------------------------------------- | :------------: | :-------: | :-----------------------------: | :------------: | :--------------------: |
| `AdSlot.mint_slot`                                                           |                |           |            anyone ¹             |    anyone ¹    |                        |
| `AdSlot.set_calendar`                                                        |                |           |                ✔                |                |                        |
| `AdSlot.set_lease`                                                           |                |           |                                 |                |   ✔ (only `market`)    |
| `AdSlot.set_market`, `set_base_uri`                                          |       ✔        |           |                                 |                |                        |
| `Marketplace.set_terms`, `set_paused`                                        |                |           |                ✔                |                |                        |
| `Marketplace.buy`, `buy_with_permit`                                         |                |           |                                 |       ✔        |                        |
| `Marketplace.set_fee_bps`, `set_treasury`, `set_campaign_vault`              |       ✔        |           |                                 |                |                        |
| `CreativeRegistry.register_media`, `register_nft`                            |                |           |                                 |     anyone     |                        |
| `CreativeRegistry.request_approval`                                          |                |           |                                 | creative owner |                        |
| `CreativeRegistry.set_approval`, `revoke_approval`, `set_advertiser_allowed` |                |           | any address, scoped to itself ² |                |                        |
| `CreativeRegistry.moderator_revoke`                                          |       ✔        |     ✔     |                                 |                |                        |
| `CreativeRegistry.set_moderator`                                             |       ✔        |           |                                 |                |                        |

¹ Minting is permissionless; the minter becomes the slot owner. Domain ownership is verified off-chain (see `ARCHITECTURE.md` § Domain verification).
² Approvals are keyed by `msg.sender`. A publisher approves with the wallet that owns their slots; `Marketplace.buy` checks approvals against `AdSlot.ownerOf(slot_id)` at buy time.

"Publisher (slot owner)" means `AdSlot.ownerOf(slot_id) == msg.sender`. ERC-721 operators/approvals do **not** confer these rights in v1.

---

## 3. Data model

All structs below are on-chain storage. Field names are the canonical identifiers.

### 3.1 `AdSlot`

```text
SlotSpec                      # immutable after mint
  width:  uint16              # px; > 0 for kind WEB_DISPLAY
  height: uint16              # px; > 0 for kind WEB_DISPLAY
  kind:   uint8               # SlotKind enum
  domain: String[253]         # host the slot lives on, lowercase, no scheme/port; non-empty

SlotKind (uint8)
  0 = WEB_DISPLAY             # image in a page, served by the embed
  1 = NEWSLETTER              # image in an email; served via image URL
  2 = PHYSICAL                # off-line placement; media delivered out of band
  3 = OTHER

Calendar                      # per slot; replaced (not edited) via set_calendar
  version:            uint32  # 0 = no calendar (slot not sellable); first set → 1
  period_seconds:     uint64  # >= MIN_PERIOD_SECONDS (3600)
  first_period_start: uint64  # unix seconds; may be in the past

Lease                         # keyed [slot_id][calendar.version][period_index]
  user:        address        # advertiser; empty address = unleased
  creative_id: uint256        # > 0

Storage
  market:          address                                   # only writer of leases
  specs:           HashMap[uint256, SlotSpec]
  calendars:       HashMap[uint256, Calendar]
  leases:          HashMap[uint256, HashMap[uint32, HashMap[uint256, Lease]]]
  last_leased_end: HashMap[uint256, uint64]                  # max `end` over all leases of the slot, any version
Constants
  MIN_PERIOD_SECONDS = 3600
```

### 3.2 `Marketplace`

```text
Terms                         # per slot; set by publisher; edits affect only future buys / new campaigns
  start_price:   uint256      # LEASE: USDC; >= floor_price. CPC: unused (0)
  floor_price:   uint256      # LEASE: USDC; may be 0. CPC: unused (0)
  lead_seconds:  uint64       # LEASE: > 0. CPC: 0 allowed
  sale_end:      uint64       # LEASE: 0 = no limit. CPC: unused (campaigns have valid_until)
  approval_mode: uint8        # ApprovalMode enum (LEASE buy and CPC open_campaign + serve)
  sale_mode:     uint8        # SaleMode enum
  floor_cpc:     uint256      # CPC only; > 0 when sale_mode == CPC
  paused:        bool

SaleMode (uint8)
  0 = LEASE                   # Dutch / remainder `buy` (default)
  1 = CPC                     # CampaignVault matching; `buy` reverts `"cpc mode"`

ApprovalMode (uint8)
  0 = REQUIRED
  1 = WAIVED

Immutables
  USDC:     address           # 6-decimal ERC-20 with EIP-2612 permit
  AD_SLOT:  address
  REGISTRY: address
Storage
  fee_bps:         uint16            # <= MAX_FEE_BPS
  treasury:        address
  campaign_vault:  address           # wired after CampaignVault deploy; used for CPC→LEASE checks
  terms:           HashMap[uint256, Terms]
Constants
  MAX_FEE_BPS = 1000          # 10%
  BPS_DENOMINATOR = 10_000
```

### 3.3 `CreativeRegistry`

```text
Creative                      # immutable after registration except `revoked`
  advertiser:   address
  kind:         uint8         # CreativeKind enum
  uri:          String[512]   # MEDIA: https:// or ipfs:// URL of the media bytes. NFT_REF: empty.
  content_hash: bytes32       # MEDIA: keccak256 of the exact media bytes. NFT_REF: 0.
  mime:         String[64]    # MEDIA: e.g. "image/png". NFT_REF: empty.
  width:        uint16        # MEDIA: must equal slot width at buy. NFT_REF: 0 (fitted by serving layer).
  height:       uint16        # MEDIA: must equal slot height at buy. NFT_REF: 0.
  click_url:    String[512]   # https:// destination; may be empty for NFT_REF (serving layer defaults to a token page)
  nft_chain_id: uint64        # NFT_REF only
  nft_contract: address       # NFT_REF only
  nft_token_id: uint256       # NFT_REF only
  nft_standard: uint8         # NftStandard enum; NFT_REF only
  revoked:      bool          # set only by moderator_revoke

CreativeKind (uint8)   0 = MEDIA, 1 = NFT_REF
NftStandard (uint8)    0 = NONE, 1 = ERC721, 2 = ERC1155
ApprovalStatus (uint8) 0 = NONE, 1 = REQUESTED, 2 = APPROVED, 3 = REJECTED, 4 = REVOKED

Storage
  next_id:             uint256                                # first id issued is 1
  creatives:           HashMap[uint256, Creative]
  approvals:           HashMap[address, HashMap[uint256, uint8]]   # [publisher][creative_id] -> ApprovalStatus
  allowed_advertisers: HashMap[address, HashMap[address, bool]]    # [publisher][advertiser]
  moderator:           address
```

---

## 4. Time model and pricing

### 4.1 Periods

For slot `s` with calendar `c` (version `v`) and period index `i`:

```text
start(i) = c.first_period_start + i * c.period_seconds
end(i)   = start(i) + c.period_seconds
```

Periods are fixed and non-overlapping by construction. Period indices are unbounded upward;
the sale horizon is bounded by `Terms.lead_seconds` (an auction is not open until
`lead_seconds` before `start`) and optionally `Terms.sale_end`.

The **current period** at time `t` exists iff `c.version > 0` and `t >= c.first_period_start`;
its index is `(t - c.first_period_start) // c.period_seconds`.

### 4.2 Dutch price

For a period with `start`, and terms `T`:

```text
open_at  = start - T.lead_seconds            # saturating at 0
duration = start - open_at                   # == lead_seconds unless saturated
```

`price(s, i)` at time `now`:

- **reverts `"not open"`** if `now < open_at`
- **reverts `"closed"`** if `now >= end`
- if `open_at <= now < start` (Dutch phase), with integer arithmetic (floor division):

```text
price = T.floor_price + (T.start_price - T.floor_price) * (start - now) / duration
```

- if `start <= now < end` (remainder / late buy):

```text
price = T.floor_price * (end - now) / period_seconds
```

Dutch-phase properties: `floor_price <= price <= start_price`; non-increasing in `now`; equals
`start_price` at `open_at` and equals `floor_price` at `start`. Remainder-phase properties:
`0 <= price <= floor_price`; equals `floor_price` at `start` and approaches 0 at `end`. A
fixed-price "rate card" is `start_price == floor_price` (Dutch phase only; remainder still
pro-rates the floor).

### 4.3 Fee split

```text
fee              = price * fee_bps / BPS_DENOMINATOR      # floor division
publisher_amount = price - fee
```

Both transfers happen inside `buy`. `Marketplace` holds no balance afterwards.

---

## 5. Functions

Naming: ERC-standard functions keep their standard camelCase names (`ownerOf`, `userOf`,
`userExpires`, `transferFrom`, `permit`). OpenAd-specific functions are `snake_case`.
Revert reason strings are short, lowercase, and listed per function; tests assert on them.

### 5.1 `AdSlot`

Composition: snekmate `erc721` (+ `ownable`) module. Exports `IERC721`, `IERC721Metadata`,
`IERC721Enumerable`, `owner`. Does **not** export snekmate's minter-gated `safe_mint`;
minting goes through `mint_slot`.

| Function                                                    | Access        | Behaviour                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mint_slot(spec: SlotSpec) -> uint256`                      | anyone        | Requires `spec.domain` non-empty; if `kind == WEB_DISPLAY` requires `width > 0 and height > 0`; requires `kind <= 3`. Mints next token id to `msg.sender`, stores spec. Emits `SlotMinted`. Reverts: `"empty domain"`, `"bad dimensions"`, `"bad kind"`.                                                                           |
| `set_calendar(slot_id, period_seconds, first_period_start)` | slot owner    | Requires `period_seconds >= MIN_PERIOD_SECONDS`; requires `last_leased_end[slot_id] <= block.timestamp` (no active or future lease). Sets `version += 1`. Emits `CalendarSet`. Reverts: `"not owner"`, `"period too short"`, `"leases outstanding"`.                                                                               |
| `set_lease(slot_id, period_index, user, creative_id)`       | `market` only | Requires calendar set; computes `start,end`; requires `end > block.timestamp`; requires lease empty; requires `user != empty` and `creative_id > 0`. Writes lease; `last_leased_end = max(last_leased_end, end)`. Emits `LeaseSet`. Reverts: `"not market"`, `"no calendar"`, `"period ended"`, `"already leased"`, `"bad lease"`. |
| `set_market(market)`                                        | owner         | Sets the sole lease writer. Emits `MarketSet`.                                                                                                                                                                                                                                                                                     |
| `set_base_uri(uri)`                                         | owner         | Metadata base URI (points at the API's slot metadata route).                                                                                                                                                                                                                                                                       |
| `market() -> address`                                       | view          |                                                                                                                                                                                                                                                                                                                                    |
| `period_window(slot_id, period_index) -> (uint64, uint64)`  | view          | `(start, end)` per § 4.1. Reverts `"no calendar"`.                                                                                                                                                                                                                                                                                 |
| `current_period(slot_id) -> (bool, uint256)`                | view          | `(exists, period_index)` for `block.timestamp`.                                                                                                                                                                                                                                                                                    |
| `lease_of(slot_id, period_index) -> Lease`                  | view          | Lease under the **current** calendar version (empty struct if none).                                                                                                                                                                                                                                                               |
| `spec_of(slot_id) -> SlotSpec`                              | view          |                                                                                                                                                                                                                                                                                                                                    |
| `calendar_of(slot_id) -> Calendar`                          | view          |                                                                                                                                                                                                                                                                                                                                    |
| `last_leased_end_of(slot_id) -> uint64`                     | view          |                                                                                                                                                                                                                                                                                                                                    |
| `userOf(tokenId) -> address`                                | view          | ERC-4907 read: current period's lease user, or empty address.                                                                                                                                                                                                                                                                      |
| `userExpires(tokenId) -> uint256`                           | view          | ERC-4907 read: current period's `end` if leased, else 0.                                                                                                                                                                                                                                                                           |

ERC-4907 note: `setUser` is intentionally **not** implemented (leases are only written by the
market). Do not advertise the ERC-4907 interface id via ERC-165; the views are provided for
tooling compatibility only.

### 5.2 `Marketplace`

Composition: snekmate `ownable`. `@nonreentrant` on `buy` and `buy_with_permit`.

| Function                                                                              | Access                  | Behaviour                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `set_terms(slot_id, start_price, floor_price, lead_seconds, sale_end, approval_mode, sale_mode, floor_cpc)` | slot owner | Check order: `"not owner"`; `"bad mode"` (`approval_mode > 1` or `sale_mode > 1`); LEASE `"bad prices"` / `"bad lead"` or CPC `"bad floor cpc"`; `"leases outstanding"` (`LEASE → CPC` while `last_leased_end > now`); `"campaigns open"` (`CPC → LEASE` while `CampaignVault.open_campaigns_of > 0`). `paused` unchanged. Emits `TermsSet`. |
| `set_paused(slot_id, paused)`                                                         | slot owner              | Emits `PausedSet`.                                                                                                                                                                                                                                |
| `USDC()`, `AD_SLOT()`, `REGISTRY()`                                                   | view                    | Immutable addresses.                                                                                                                                                                                                                              |
| `fee_bps() -> uint16`, `treasury() -> address`, `campaign_vault() -> address`         | view                    |                                                                                                                                                                                                                                                   |
| `terms_of(slot_id) -> Terms`                                                          | view                    | Configured iff LEASE and `lead_seconds > 0`, or CPC and `floor_cpc > 0`.                                                                                                                                                                          |
| `price(slot_id, period_index) -> uint256`                                             | view                    | § 4.2. Reverts `"cpc mode"` if `sale_mode == CPC`, else `"no terms"` if `lead_seconds == 0`.                                                                                                                                                       |
| `quote(slot_id, period_index) -> Quote`                                               | view                    | Non-reverting UI helper: `(sellable: bool, reason: String[32], price, fee, open_at, start, end)`. `reason` is the revert string `buy` would produce, or empty.                                                                                    |
| `buy(slot_id, period_index, creative_id, max_price)`                                  | anyone (becomes lessee) | See ordered checks below.                                                                                                                                                                                                                         |
| `buy_with_permit(slot_id, period_index, creative_id, max_price, deadline, v, r, s)`   | anyone                  | Calls `USDC.permit(msg.sender, self, max_price, deadline, v, r, s)` **non-reverting** (a failed permit is ignored; the subsequent `transferFrom` enforces allowance), then behaves as `buy`. Rationale: permit front-running griefing (ADR-0004). |
| `set_fee_bps(fee_bps)`                                                                | owner                   | Requires `<= MAX_FEE_BPS`. Emits `FeeSet`. Reverts `"fee too high"`.                                                                                                                                                                              |
| `set_treasury(treasury)`                                                              | owner                   | Requires non-empty. Emits `TreasurySet`. Reverts `"bad treasury"`.                                                                                                                                                                                |
| `set_campaign_vault(vault)`                                                           | owner                   | Requires non-empty. Emits `CampaignVaultSet`. Reverts `"bad vault"`. Wired after `CampaignVault` deploy (Marketplace cannot take the vault in its constructor).                                                                                    |

`buy` performs these checks **in this order** (tests rely on the order for revert strings):

1. `terms.sale_mode != CPC` else `"cpc mode"`; `terms.lead_seconds > 0` else `"no terms"`; `not terms.paused` else `"paused"`.
2. `(start, end) = AD_SLOT.period_window(slot_id, period_index)`; if `terms.sale_end != 0` require `end <= terms.sale_end` else `"beyond sale end"`.
3. `p = price(...)` (may revert `"not open"` / `"closed"`); require `p <= max_price` else `"price exceeds max"`.
4. `publisher = AD_SLOT.ownerOf(slot_id)`; `c = REGISTRY.get_creative(creative_id)`; require `c.advertiser == msg.sender` else `"not creative owner"`.
5. If `c.kind == MEDIA`: `spec = AD_SLOT.spec_of(slot_id)`; require `c.width == spec.width and c.height == spec.height` else `"dimension mismatch"`.
6. If `terms.approval_mode == REQUIRED`: require `REGISTRY.is_approved_for(publisher, creative_id)` else `"not approved"`. If `WAIVED`: require `REGISTRY.is_active(creative_id) and not REGISTRY.is_blocked_for(publisher, creative_id)` else `"creative blocked"`.
7. `AD_SLOT.set_lease(slot_id, period_index, msg.sender, creative_id)` (may revert `"already leased"`, `"period ended"`).
8. `fee = p * fee_bps / BPS_DENOMINATOR`; if `fee > 0`: `USDC.transferFrom(msg.sender, treasury, fee)`; if `p - fee > 0`: `USDC.transferFrom(msg.sender, publisher, p - fee)`. Use safe-ERC-20 semantics (`default_return_value=True`).
9. Emit `Purchased(slot_id, period_index, msg.sender, publisher, creative_id, p, fee, terms.approval_mode, start, end)`.

Step 7 precedes step 8 deliberately: the lease write is the state change; token transfers are
the external interaction; the whole transaction is atomic either way.

### 5.3 `CreativeRegistry`

Composition: snekmate `ownable`.

| Function                                                                                     | Access                                       | Behaviour                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `register_media(uri, content_hash, mime, width, height, click_url) -> uint256`               | anyone                                       | Requires `content_hash != 0`, `len(uri) > 0`, `len(mime) > 0`, `width > 0`, `height > 0`. Stores `Creative{kind=MEDIA, advertiser=msg.sender}`. Emits `CreativeRegistered`. Reverts: `"bad hash"`, `"bad uri"`, `"bad mime"`, `"bad dimensions"`.                                                                                                                                    |
| `register_nft(nft_chain_id, nft_contract, nft_token_id, nft_standard, click_url) -> uint256` | anyone                                       | Requires `nft_standard in {1,2}`, `nft_contract != empty`. If `nft_chain_id == chain.id` and `nft_standard == ERC721`, requires `IERC721(nft_contract).ownerOf(nft_token_id) == msg.sender` (same-chain proof); cross-chain ownership is verified off-chain. Emits `CreativeRegistered` and `NftCreativeRegistered`. Reverts: `"bad standard"`, `"bad contract"`, `"not nft owner"`. |
| `request_approval(publisher, creative_id)`                                                   | creative owner                               | Requires creative active; status for `[publisher][id]` must be `NONE` or `REJECTED`; sets `REQUESTED`. Emits `ApprovalRequested`. Reverts: `"not creative owner"`, `"inactive"`, `"bad status"`.                                                                                                                                                                                     |
| `set_approval(creative_id, approved: bool)`                                                  | any address (publisher scope = `msg.sender`) | Requires creative exists. Sets `APPROVED` or `REJECTED` for `[msg.sender][id]`. Emits `ApprovalSet`.                                                                                                                                                                                                                                                                                 |
| `revoke_approval(creative_id)`                                                               | any address (scope = `msg.sender`)           | Sets `REVOKED` for `[msg.sender][id]`. Emits `ApprovalSet(status=REVOKED)`.                                                                                                                                                                                                                                                                                                          |
| `set_advertiser_allowed(advertiser, allowed)`                                                | any address (scope = `msg.sender`)           | Emits `AdvertiserAllowed`.                                                                                                                                                                                                                                                                                                                                                           |
| `moderator_revoke(creative_id)`                                                              | owner or moderator                           | Sets `revoked = True`. Emits `CreativeRevoked`. Reverts `"not moderator"`.                                                                                                                                                                                                                                                                                                           |
| `set_moderator(moderator)`                                                                   | owner                                        | Emits `ModeratorSet`.                                                                                                                                                                                                                                                                                                                                                                |
| `moderator() -> address`, `next_id() -> uint256`                                             | view                                         |                                                                                                                                                                                                                                                                                                                                                                                      |
| `get_creative(creative_id) -> Creative`                                                      | view                                         | Reverts `"no creative"` if `id == 0 or id >= next_id`.                                                                                                                                                                                                                                                                                                                               |
| `is_active(creative_id) -> bool`                                                             | view                                         | Exists and `not revoked`.                                                                                                                                                                                                                                                                                                                                                            |
| `is_blocked_for(publisher, creative_id) -> bool`                                             | view                                         | `revoked or approvals[publisher][id] in {REJECTED, REVOKED}`.                                                                                                                                                                                                                                                                                                                        |
| `is_approved_for(publisher, creative_id) -> bool`                                            | view                                         | `is_active and not is_blocked_for and (approvals[publisher][id] == APPROVED or allowed_advertisers[publisher][creative.advertiser])`.                                                                                                                                                                                                                                                |
| `approval_status(publisher, creative_id) -> uint8`                                           | view                                         |                                                                                                                                                                                                                                                                                                                                                                                      |
| `is_advertiser_allowed(publisher, advertiser) -> bool`                                       | view                                         |                                                                                                                                                                                                                                                                                                                                                                                      |

---

## 6. Events

Every state change emits exactly one of these. The indexer (`api/src/openad/indexer/handlers.py`)
has one handler per event; keep the two lists identical.

```text
AdSlot
  SlotMinted(slot_id: indexed uint256, owner: indexed address, width: uint16, height: uint16, kind: uint8, domain: String[253])
  CalendarSet(slot_id: indexed uint256, version: uint32, period_seconds: uint64, first_period_start: uint64)
  LeaseSet(slot_id: indexed uint256, period_index: indexed uint256, user: indexed address, version: uint32, start: uint64, end: uint64, creative_id: uint256)
  MarketSet(market: address)
  BaseURISet(base_uri: String[80])
  Transfer(...)                        # standard ERC-721; indexer tracks current owner (publisher)

Marketplace
  TermsSet(slot_id: indexed uint256, start_price: uint256, floor_price: uint256, lead_seconds: uint64, sale_end: uint64, approval_mode: uint8, sale_mode: uint8, floor_cpc: uint256)
  CampaignVaultSet(vault: address)
  PausedSet(slot_id: indexed uint256, paused: bool)
  Purchased(slot_id: indexed uint256, period_index: indexed uint256, buyer: indexed address, publisher: address, creative_id: uint256, price: uint256, fee: uint256, approval_mode: uint8, start: uint64, end: uint64)
  FeeSet(fee_bps: uint16)
  TreasurySet(treasury: address)

CampaignVault
  CampaignOpened(campaign_id: indexed uint256, advertiser: indexed address, slot_id: indexed uint256, creative_id: uint256, max_cpc: uint256, budget: uint256, valid_from: uint64, valid_until: uint64)
  CampaignToppedUp(campaign_id: indexed uint256, amount: uint256, remaining: uint256)
  MaxCpcSet(campaign_id: indexed uint256, max_cpc: uint256)
  CampaignPausedSet(campaign_id: indexed uint256, paused: bool)
  CloseRequested(campaign_id: indexed uint256, close_after: uint64)
  CampaignFinalized(campaign_id: indexed uint256, refund: uint256)
  Settled(campaign_id: indexed uint256, slot_id: uint256, publisher: address, payable_clicks: uint256, charged: uint256, fee: uint256, batch_id: bytes32)
  SettlerSet(settler: address)
  VaultFeeSet(fee_bps: uint16)
  VaultTreasurySet(treasury: address)
  CloseDelaySet(seconds: uint64)
  MaxBatchChargeSet(max_batch_charge: uint256)

CreativeRegistry
  CreativeRegistered(creative_id: indexed uint256, advertiser: indexed address, kind: uint8, content_hash: bytes32, uri: String[512], mime: String[64], width: uint16, height: uint16, click_url: String[512])
  NftCreativeRegistered(creative_id: indexed uint256, nft_chain_id: uint64, nft_contract: address, nft_token_id: uint256, nft_standard: uint8)
  ApprovalRequested(publisher: indexed address, creative_id: indexed uint256, advertiser: address)
  ApprovalSet(publisher: indexed address, creative_id: indexed uint256, status: uint8)
  AdvertiserAllowed(publisher: indexed address, advertiser: indexed address, allowed: bool)
  CreativeRevoked(creative_id: indexed uint256, by: address)
  ModeratorSet(moderator: address)
```

---

## 7. Serving rule (off-chain, normative)

If indexed `terms.sale_mode == CPC`, skip this section and apply §11.4. Mode switch
forbids an active lease on a CPC slot, so the two rules never both apply.

At time `t`, for slot `s` in **LEASE** mode, the serving edge returns:

1. The **current lease** `L` for `s` (current calendar version, period containing `t`), if any.
2. If `L` exists, its creative `C` is **serveable** iff all of:
   - `C` is verified (media bytes fetched and `keccak256(bytes) == content_hash`; for `NFT_REF`, metadata resolved and image fetched; see `ARCHITECTURE.md`),
   - `REGISTRY.is_active(C)` (not moderator-revoked),
   - `not REGISTRY.is_blocked_for(ownerOf(s), C)`,
   - if `L.approval_mode == REQUIRED`: `REGISTRY.is_approved_for(ownerOf(s), C)`.
     These are evaluated against **indexed** state, never live chain calls.
3. If serveable → serve `C`. Otherwise → serve the publisher's house ad if configured, else "empty".

Consequences: a publisher can stop a running ad by `set_approval(id, False)` or
`revoke_approval(id)`; a moderator by `moderator_revoke(id)`. No refunds are issued on-chain in
v1 (see § 9).

---

## 8. Invariants

Property tests (`contracts/tests/`) must cover each of these.

1. **No overlapping leases.** Within a calendar version, leases are keyed by period index and periods are disjoint. Across versions, `set_calendar` requires `last_leased_end <= now`, so no future lease can exist under an old version when a new one starts.
2. **`last_leased_end`** is ≥ the `end` of every lease ever written for the slot.
3. **Only `market` writes leases**; only `owner` changes `market`.
4. **Price bounds.** Dutch phase (`open_at <= now < start`): `floor_price <= price <= start_price`, non-increasing. Remainder phase (`start <= now < end`): `0 <= price <= floor_price` with `price = floor_price * (end - now) / period_seconds`.
5. **Fee bound.** `fee_bps <= 1000`; `fee + publisher_amount == price`.
6. **Pass-through.** `USDC.balanceOf(Marketplace)` is unchanged by any `buy`.
7. **Creative immutability.** All `Creative` fields except `revoked` are constant after registration.
8. **Approval scoping.** `set_approval`/`revoke_approval`/`set_advertiser_allowed` only ever modify state under `[msg.sender]`.
9. **Lease validity.** Every lease has `user != empty`, `creative_id > 0`, and was written with `end > block.timestamp` at write time.
10. **Buy atomicity.** Either the lease is written _and_ both transfers succeed, or nothing changes.
11. **Vault conservation.** `CampaignVault` USDC balance = sum of `remaining` over `closed == false` campaigns.
12. **Settle / finalize.** `settle_batch` never increases any `remaining`; `finalize_close` sends exactly the pre-call `remaining` to the advertiser.
13. **Marketplace vs vault.** `Marketplace` balance is unchanged by `buy`. Vault balance changes only on open / top_up / settle / finalize.
14. **No CPC leases.** `CampaignVault` never calls `AdSlot.set_lease`.
15. **Deposits bound payouts.** For each campaign, `charged_usdc + leftover_refund ≤` lifetime deposits.

---

## 9. Known limitations and deferred items

| Item                                                                  | Status          | Notes                                                                                                                   |
| --------------------------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Late buy (buy the remainder of a started period at pro-rated floor)   | Implemented     | § 4.2 remainder phase. No new event; `Purchased` already carries `price`. |
| Dual sale mode + CPC campaigns (`CampaignVault`, GSP, click settle)   | Implemented     | ADR-0014 · §11. Off-chain GSP / click / settler: ROADMAP 5.4–5.7. |
| Calendar change while leases outstanding                              | Deferred (v2)   | Requires calendar epochs. v1 rule: pause, wait for leases to run out, then `set_calendar`.                              |
| On-chain refunds / disputes for **leases**                            | Deferred        | LEASE delivery is time-based. CPC leftover refunds via `finalize_close` (§11).                                          |
| Approval portability on slot transfer                                 | By design       | Approvals are keyed by publisher address; a new owner starts with none.                                                 |
| Full ERC-4907 (`setUser`)                                             | By design       | Read views only.                                                                                                        |
| Pricing autopilot (VRGDA-style adjustment)                            | Implemented     | Publisher-side suggestion API; no protocol change.                                                                      |
| English / sealed-bid **occupancy** auctions                           | Deferred        | ADR-0014 rejects them; CPC matching is not occupancy.                                                                   |
| Operators (ERC-721 `approve`/`setApprovalForAll`) acting as publisher | Deferred        | v1 requires `ownerOf == msg.sender`.                                                                                    |
| Sublease / secondary market for leases                                | Deferred (v2)   | Would require lease transfer in `AdSlot`.                                                                               |

---

## 10. Deployment parameters

| Parameter              | Anvil (31337)                                     | Base Sepolia (84532)                                                                         | Base (8453)                                                                          |
| ---------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| USDC                   | `MockUSDC` from `contracts/src/mocks/MockUSDC.vy` | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` (Circle testnet USDC — verify before deploying) | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (native USDC — verify before deploying) |
| `fee_bps`              | 250                                               | 250                                                                                          | TBD by platform                                                                      |
| `treasury`             | deployer                                          | platform testnet wallet                                                                      | platform multisig                                                                    |
| `moderator`            | deployer                                          | platform testnet wallet                                                                      | platform ops wallet                                                                  |
| `settler`              | deployer, or `OPENAD_SETTLER_ADDRESS`             | dedicated, gas-only EOA in `OPENAD_SETTLER_ADDRESS` (required; never the deployer)           | dedicated, gas-only EOA (`OPENAD_SETTLER_ADDRESS`); never the Safe or a signer       |
| `AdSlot` name / symbol | `OpenAd Slot` / `OASLT`                           | same                                                                                         | same                                                                                 |
| `base_uri`             | `http://localhost:8000/v1/slots/`                 | testnet API URL + `/v1/slots/`                                                               | production API URL + `/v1/slots/`                                                    |

**Live on Base Sepolia (84532)** since block 47313840 (2026-09-26); `contracts/deployments/84532.json`
is canonical:

| Contract           | Address                                      |
| ------------------ | -------------------------------------------- |
| `CreativeRegistry` | `0x463336313783c087afc1111Cb75F58248c0877D5` |
| `AdSlot`           | `0x6Aa6Af46edF7Fa57bF078bb097fa2c8cf59EAA8B` |
| `Marketplace`      | `0x0D91F009AA4005499FaF837312D7185f30514f91` |
| `CampaignVault`    | `0xaf41f2570CceB21DCe350DD831172b339b923950` |

Deployer (owner, treasury, moderator): `0xB4914DA207321C0E79080eA7a3023e8a5A3cB4f3`. Settler:
`0x1F7177305521238bFB3C2D1c86C3323742Fd2621`. `base_uri` is still the deploy script's
placeholder, `https://api.openad.example/v1/slots/`, until the owner calls
`AdSlot.set_base_uri` with the staging API URL (`contracts/script/set_base_uri.py`,
`docs/deploy-sepolia.md` "Metadata base URI").

Deploy order: `CreativeRegistry` → `AdSlot` → `Marketplace(USDC, AdSlot, CreativeRegistry)` →
`CampaignVault(USDC, AdSlot, CreativeRegistry, Marketplace)` → `AdSlot.set_market(Marketplace)` →
`Marketplace.set_campaign_vault(CampaignVault)` → `Marketplace.set_treasury`, `set_fee_bps` →
`CampaignVault.set_treasury`, `set_fee_bps`, `set_settler(<dedicated settler EOA>)` (optional
`set_close_delay`) → `CreativeRegistry.set_moderator`. Marketplace cannot take the vault in its
constructor (vault needs `MARKETPLACE` to read `terms_of`). The deploy script writes
`contracts/deployments/<chainId>.json` (see `ARCHITECTURE.md` § Deployments artifact).

The settler is a dedicated, gas-only EOA. The settler process holds its key
(`OPENAD_SETTLER_KEY`, ADR-0014), and its only protocol role is `settle_batch`. Off Anvil and
pyevm, it is never the deployer or an owner key: `contracts/script/deploy.py` requires its
address in `OPENAD_SETTLER_ADDRESS` and refuses the deployer. Only Anvil and pyevm default the
settler to the deployer. `contracts/script/set_settler.py` rotates it, refusing both the
deployer that the artifact records and the vault's current `owner()`; on Base, where the owner
is a Safe, it prints the Safe transaction instead of sending one. Off chain 31337 the settler
process refuses to start if its key owns `CampaignVault` or is the deployer (`ARCHITECTURE.md`
§ 3.9). Runbook: `docs/deploy-sepolia.md`; threat model T20.

---

## 11. CPC sale mode (Implemented — ADR-0014)

Canonical signatures: `contracts/src/interfaces/ICampaignVault.vyi` and `IMarketplace.vyi`.
Semantics here are binding. Revert strings are exact.

Constants: `CPC_TICK = 10_000` (0.01 USDC); `Q_DENOM = 1_000_000`; first implementation
`q = Q_DENOM` for every campaign; `CLOSE_DELAY_SECONDS` default `3600` (owner-settable,
max `604_800`); `MAX_FEE_BPS = 1000`; `MAX_BATCH_CHARGE` owner-settable (default
`10_000_000_000` = 10_000 USDC).

### 11.1 `Terms` / `Marketplace` deltas

`CampaignVault` constructor takes `MARKETPLACE` as an immutable and reads `terms_of`. Marketplace
owner `set_campaign_vault` emits `CampaignVaultSet` (same pattern as `AdSlot.set_market`).

`set_terms(..., approval_mode, sale_mode, floor_cpc)` (slot owner). Check order: `"not owner"` →
`"bad mode"` (`approval_mode > 1` or `sale_mode > 1`) → LEASE `"bad prices"` / `"bad lead"` or
CPC `"bad floor cpc"` (`floor_cpc == 0`) → `"leases outstanding"` (`LEASE → CPC` while
`last_leased_end > now`) → `"campaigns open"` (`CPC → LEASE` while
`open_campaigns_of(slot_id) > 0`).

Terms are configured iff LEASE and `lead_seconds > 0`, or CPC and `floor_cpc > 0`.

`buy` / `buy_with_permit`: if `sale_mode == CPC`, revert `"cpc mode"` before other checks.
`quote`: `sellable = false`, `reason = "cpc mode"` in that case.

`paused` still gates CPC serve eligibility (indexed). It does not freeze `top_up` / close.

### 11.2 `CampaignVault` data and functions

```text
Campaign
  advertiser:   address
  slot_id:      uint256
  creative_id:  uint256
  max_cpc:      uint256
  remaining:    uint256
  valid_from:   uint64     # 0 = no lower bound
  valid_until:  uint64     # 0 = no upper bound
  paused:       bool
  close_after:  uint64     # 0 = not closing
  closed:       bool
```

| Function | Access | Behaviour |
| --- | --- | --- |
| `open_campaign(slot_id, creative_id, max_cpc, budget, valid_from, valid_until) -> uint256` | advertiser | Checks in order: terms configured and `sale_mode == CPC` else `"no terms"` / `"lease mode"`; not paused (`"paused"`); `max_cpc >= floor_cpc` else `"below floor"`; `budget >= floor_cpc` else `"budget too small"`; `valid_until == 0 or valid_until > valid_from` else `"bad window"`; creative owner / active / dimensions / approval-or-blocked **same strings and order as `buy` steps 4–6**; `transferFrom` `budget` to self; write campaign; emit `CampaignOpened`. |
| `top_up(campaign_id, amount)` | campaign advertiser | Not `closed`; `amount > 0`; `transferFrom`; `remaining += amount`; emit `CampaignToppedUp`. `"not advertiser"` / `"closed"` / `"bad amount"`. |
| `set_max_cpc(campaign_id, max_cpc)` | campaign advertiser | Not `closed`; `max_cpc >=` current slot `floor_cpc`; emit `MaxCpcSet`. |
| `set_paused(campaign_id, paused)` | campaign advertiser | Not `closed`; emit `CampaignPausedSet`. |
| `request_close(campaign_id)` | campaign advertiser | Not `closed`; `close_after == 0` else `"closing"`; set `close_after = now + close_delay`; emit `CloseRequested`. Campaign is ineligible for new serves once `close_after != 0`. |
| `finalize_close(campaign_id)` | anyone | `closed == false`, `close_after != 0`, `now >= close_after` else `"too early"` / `"not closing"`; refund `remaining` to advertiser; `remaining = 0`; `closed = true`; emit `CampaignFinalized`. |
| `settle_batch(campaign_id, payable_clicks, charged_usdc, batch_id)` | settler | `@nonreentrant`. Not `closed`; `batch_id` unused; `0 < charged_usdc <= remaining`; `charged_usdc <= max_batch_charge`; `payable_clicks > 0`. `fee = charged * fee_bps / 10_000`; pay treasury then `ownerOf(slot_id)`; `remaining -= charged`; mark `batch_id`; emit `Settled`. Reverts `"not settler"`, `"closed"`, `"batch used"`, `"bad charge"`. |
| `set_settler`, `set_fee_bps`, `set_treasury`, `set_close_delay`, `set_max_batch_charge` | owner | Same fee bound as Marketplace. `set_close_delay` `"bad delay"` if 0 or `> 604_800`. |

Vault USDC balance equals `sum(remaining)` over non-closed campaigns (invariant 11).

### 11.3 GSP (off-chain, used when recording a payable click)

```text
ad_rank(c) = c.max_cpc * c.q / Q_DENOM
winner_cpc = min(
  winner.max_cpc,
  max(floor_cpc, runner.ad_rank * Q_DENOM / winner.q + CPC_TICK)
)
```

No runner-up → `winner_cpc = min(winner.max_cpc, floor_cpc)`. First implementation:
`q = Q_DENOM` for all, so this is `min(max_cpc, max(floor_cpc, runner.max_cpc + CPC_TICK))`.

Charge at settle is the GSP recorded at **serve** (not at click), summed for payable clicks
in the batch. Settler must not charge more than that sum; the contract does not verify the
click log.

### 11.4 Serve rule (CPC)

At time `t`, slot `s` with `sale_mode == CPC`:

1. If `terms.paused` → house else empty (same as paused LEASE with no lease).
2. Eligible campaigns as ADR-0014 §4 (indexed; never RPC). Skip `close_after != 0`.
3. Highest `ad_rank` (tie: lower `campaign_id`). Creative must be serveable under §7.2
   checks (verified, active, not blocked, approval if REQUIRED).
4. If a winner → `status = "campaign"`, media from verified cache, `clickUrl` =
   `{api}/v1/c/{token}` (HMAC of `slot_id, campaign_id, creative_id, serve_event_id, exp`,
   TTL 3600s, one-time). Record GSP on the serve/click row.
5. Else house else empty.

`GET /v1/c/{token}`: validate payable rules (ADR-0014 §5); if payable, append `click_events`
(`payable=true`); 302 to registered `click_url`. Invalid token → 404, no 302.

### 11.5 Extra invariants (property tests when implemented)

11. `CampaignVault` USDC balance = sum of `remaining` over `closed == false` campaigns.
12. `settle_batch` never increases any `remaining`; `finalize_close` sends exactly the
    pre-call `remaining` to the advertiser.
13. `Marketplace` balance still unchanged by `buy` (LEASE). Vault balance changes only
    on open/top_up/settle/finalize.
14. No `AdSlot.set_lease` from `CampaignVault`.
15. `charged_usdc + leftover_refund ≤` lifetime deposits for that campaign.
