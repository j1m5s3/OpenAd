# ADR-0004: Approve-then-buy creative gating, and non-reverting permit

- **Status:** Accepted
- **Date:** 2026-09-08
- **Scope:** contracts, api

## Context

Publishers must be able to control what appears on their property (brand safety, malware,
scams), but the buy must remain a single atomic transaction without escrow or disputes. Buys
are paid with USDC `permit`, which is vulnerable to front-running griefing (anyone can submit
a signed permit before the intended transaction, making the intended one revert).

## Decision

**Creative gating**

1. Approval is decoupled from the auction. Advertisers register a creative once and request
   approval from a publisher; the publisher approves, rejects, or allowlists the advertiser.
   Approvals are keyed by publisher **address** and reusable across all that publisher's slots.
2. Per-slot terms carry an `approval_mode`: `REQUIRED` (buy needs approved/allowlisted creative)
   or `WAIVED` (buy needs an active, non-blocked creative). The mode in force at purchase is
   recorded in the `Purchased` event and governs serving for that lease.
3. Publishers can stop a running ad by `set_approval(id, false)` or `revoke_approval(id)`;
   moderators by `moderator_revoke(id)`. Serving honours these within one indexer cycle. No
   on-chain refund in v1.
4. Creatives are immutable after registration (except `revoked`), so an approval always refers to
   exactly the bytes hashed at registration. Content integrity is enforced off-chain by hash
   verification before serving (`ARCHITECTURE.md` §3.5).

**Permit**

5. `buy_with_permit` calls `USDC.permit` **without reverting on failure** (Vyper `raw_call` with
   `revert_on_failure=False`), then proceeds; the subsequent `transferFrom` enforces allowance.
   Users sign the permit for `max_price`; the exact price charged is `≤ max_price`.

## Alternatives considered

- **Buy-then-approve with escrow** — funds held until the publisher approves; needs timeouts,
  refund paths, and a decision on inaction (auto-approve is unsafe, auto-refund penalises the
  advertiser). Possible later as an opt-in mode.
- **Per-slot approvals** — more granular but forces re-approval for every slot; per-publisher
  scope with an optional allowlist is the practical middle.
- **Reverting permit** — simpler code, but griefable.

## Consequences

- First-time advertisers wait for approval before they can buy; the UI must make requesting
  approval a first-class flow.
- `Marketplace` depends on `CreativeRegistry` views (`is_approved_for`, `is_blocked_for`,
  `is_active`, `get_creative`).
- Leftover allowance after a buy (`max_price - price`) is acceptable and documented in the UI.

## References

- `PROTOCOL.md` §3.3, §5.2 (buy check order), §5.3, §7.
- EIP-2612.
