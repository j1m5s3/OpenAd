# ADR-0011: Optional Turnkey / AppKit embedded wallets (ROADMAP 4.5)

- **Status:** Accepted
- **Date:** 2026-09-11
- **Scope:** web

## Context

ROADMAP 4.5 is embedded wallets and gas sponsorship for web2 publishers. The reference
discovery app uses Turnkey. Live Turnkey orgs and paymasters are vendor/cloud concerns;
this repo must stay runnable without them. The platform remains non-custodial: neither
`api/` nor `web/` may hold keys that move funds or write leases.

## Decision

1. **Default path:** RainbowKit + injected / Coinbase / WalletConnect (ADR-0008).
2. **Optional path:** if `VITE_TURNKEY_ORGANIZATION_ID` and `VITE_TURNKEY_AUTH_PROXY_CONFIG_ID`
   are set, mount Turnkey Embedded Wallet Kit (or Reown AppKit with Turnkey) **beside**
   RainbowKit so email/passkey users get a non-custodial embedded EOA. Signing still
   happens in the wallet kit, not on the API.
3. Without those env vars, the Turnkey provider is not mounted. CI never requires them.
4. **Gas sponsorship** is documented for Base (paymaster) and is a no-op on Anvil
   (native ETH is pre-funded). No API-side sponsorship key.

## Alternatives considered

- **Turnkey-first** — blocks local/CI without a SaaS org. Rejected as the default.
- **Custodial API signer** — violates the non-custodial invariant. Forbidden.

## Consequences

- `.env.example` lists the Turnkey vars as commented optionals.
- ROADMAP 4.6 (Base mainnet broadcast) and GCP deploys stay out of this change.

## References

- ADR-0008, ADR-0009. ROADMAP 4.5.
