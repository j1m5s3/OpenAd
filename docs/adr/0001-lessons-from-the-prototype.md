# ADR-0001: Lessons from the 2022–2023 prototype

- **Status:** Accepted
- **Date:** 2026-09-08
- **Scope:** repo

## Context

OpenAd redesigns an earlier prototype (`ad-api-BACKEND`: Flask + web3.py + Solidity on Goerli;
`ad-api-FE-nextjs`: Next.js 13; a separate DB microservice). The prototype proved the concept
(slot as NFT, Dutch auction, media pointer readable by a page) but its architecture would not
have survived contact with real users. This ADR records what we learned so nobody reintroduces
the same patterns.

## Decision

The prototype is **reference only**. Its code is not ported. The following observations are
binding constraints on the redesign:

1. **The prototype was custodial.** One platform private key deployed contracts, minted slots,
   and set ad pointers on behalf of users; `setNftAdInfo` was `onlyOwner` (contract owner =
   platform), so owning the NFT did not confer the right to place media. → OpenAd is
   non-custodial; the NFT lease _is_ the right; the platform key can only change
   fee/treasury/moderator/market settings (`PROTOCOL.md` §1 principle 1).
2. **Ad space was modelled as a permanent asset.** The Dutch auction sold the NFT outright with
   no duration or expiry. → Slots are permanent and owned by the publisher; periods are leased
   and expire automatically (`PROTOCOL.md` §1 principle 2, §4.1).
3. **One contract per publisher, one contract per auction, compiled at request time** by
   string-substituting the Solidity source. → Three singleton contracts, compiled and tested
   ahead of time, deployed once per chain (`ARCHITECTURE.md` §4).
4. **The ad-serving path made two RPC calls per request.** → Serving reads only indexed state
   and a verified media cache (`ARCHITECTURE.md` §2, §3.4).
5. **No moderation, no fee, ETH-only, `selfdestruct`.** → Publisher approvals + moderator
   revoke; `fee_bps` in `buy`; USDC only; no `selfdestruct`.
6. **Prototype-grade auth** (password in URL path, JWT secret `'secret'`). → SIWE sessions; no
   passwords at all.
7. **A directory named `components ` (trailing space) was never committed** and the front-end
   components were lost. → `CONVENTIONS.md` §8 forbids whitespace-suffixed names; CI should
   check.

## Alternatives considered

- **Port and refactor the prototype.** Rejected: the custodial model and permanent-asset model
  are foundational, not incidental; a port would inherit both.

## Consequences

Nothing from the prototype is reused except the product thesis and the "creative may itself be
an NFT" idea (now `CreativeKind.NFT_REF`).

## References

- Prototype locations (local, not in this repo): `C:\source\mixed-lang\old-ad-nft\ad-api-BACKEND`,
  `C:\source\mixed-lang\old-ad-nft\ad-api-FE-nextjs`.
