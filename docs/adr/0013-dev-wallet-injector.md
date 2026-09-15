# ADR-0013: Dev-only Anvil wallet injector for headed MCP

- **Status:** Accepted
- **Date:** 2026-09-12
- **Scope:** web, repo

## Context

Headed Playwright MCP sessions need SIWE (`personal_sign`) and `buy_with_permit`
(`eth_signTypedData_v4`) against local Anvil. The e2e mock EIP-1193 provider
(ADR-0010) throws on those methods so CI never holds signing logic. Putting Anvil
private keys in `web/` would violate the non-custodial fence. `anvil_impersonateAccount`
was rejected for the sim daemon (ADR-0012).

## Decision

1. **Query param.** On `import.meta.env.DEV`, localhost/`127.0.0.1`, and
   `VITE_CHAIN_ID` 31337, `?devwallet=<id>` installs `window.ethereum` **before**
   RainbowKit boots (`web/src/main.tsx` dynamic import of `web/src/dev/anvilWallet.ts`).
2. **Addresses only.** The module maps persona ids (`pub-3`–`pub-5`, `adv-6`–`adv-9`,
   plus `e2e-publisher` / `e2e-advertiser` for completeness) to public Foundry
   addresses. It contains **no private keys**. Critique skills wear sim `#3–#9` only.
3. **JSON-RPC forwarder.** `eth_accounts` / `eth_requestAccounts` / `eth_chainId` /
   `net_version` / `wallet_*` stay in-page. All other methods POST to Vite proxy
   `/anvil` → `http://127.0.0.1:8545`. Anvil's unlocked accounts sign
   `personal_sign`, `eth_signTypedData_v4`, and `eth_sendTransaction` node-side.
   `personal_sign` retries swapped `[data, account]` vs `[account, data]`.
4. **RainbowKit.** `web/src/main.tsx` dynamically imports `App` (and therefore
   `getDefaultConfig`) only after the injector is installed. DEV wallets are
   RainbowKit `injectedWallet` only so the MetaMask SDK connector is not used.
   The provider sets `isMetaMask: false` and announces EIP-6963 with rdns
   `dev.openad.anvil`. Auto-connect (`DevWalletAutoConnect`) prefers connector
   id `injected`.
5. **Prod.** Production builds omit the dynamic injector import. The injector
   no-ops if any gate fails. Production RainbowKit still includes
   `injectedWallet` plus `getDefaultWallets()`.

## Alternatives considered

- **Playwright `browser_evaluate` injection** — timing-fragile vs RainbowKit init. Fallback only.
- **Keys in `web/`** — fence violation. Rejected.
- **`anvil_impersonateAccount`** — extra RPC surface vs unlocked Anvil accounts. Rejected
  (same rationale as ADR-0012).
- **Replace ADR-0010 e2e mock with this injector** — out of scope for ROADMAP 4.8.

## Consequences

- ROADMAP 4.8. Local MCP sessions use `http://localhost:5173/…?devwallet=pub-3`.
- Vite `server.proxy['/anvil']` is dev-server-only; Vitest does not start that proxy.
- Pause the sim loop before interactive buys so sim ticks do not race MCP nonces.

## References

- ADR-0010 (e2e mock wallet), ADR-0012 (sim personas `#3–#9`).
- `docs/qa/journeys/README.md`. `.cursor/skills/sandbox-sme-critique/`.
