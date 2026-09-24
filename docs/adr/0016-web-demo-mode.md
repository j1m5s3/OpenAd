# ADR-0016: Web demo mode

- **Status:** Accepted
- **Date:** 2026-09-24
- **Scope:** web

## Context

Market-fit blocker #1 (`docs/business/market-fit.md`): nobody can see OpenAd work without
running Anvil + Postgres + a wallet. There is no zero-backend way to show a publisher earning
and an advertiser buying in one transaction. The build must stay static-hostable, must not add
a runtime dependency or a service worker, and must never touch a real chain, a real wallet, or
the API — the marketplace fee math and glossary vocabulary must still be real so the demo is not
misleading.

## Decision

1. **Flag.** `VITE_DEMO_MODE=1` (string compare `=== '1'`), read once in
   `web/src/demo/flag.ts`: `export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === '1'`.
2. **Boot.** `web/src/main.tsx` does
   `if (DEMO_MODE) { const { installDemo } = await import('./demo/install'); installDemo(); }`
   before importing `App`, mirroring the existing ADR-0013 `installDevWallet` pattern so Rollup
   drops the whole `demo/` chunk from normal builds (the guard is a static `false`).
3. **Reads.** `web/src/lib/api.ts` gets a pluggable request resolver
   (`setRequestHandler(fn)`); the default is the current `fetch` path. Demo mode installs a
   fixture-backed handler (ROADMAP 6.2 step 6). Feature `api.ts` modules are unchanged.
4. **Writes.** A wagmi `injected` connector (RainbowKit wallet "OpenAd Demo Wallet") whose
   target is an in-memory EIP-1193 simulator (`web/src/demo/demoChain.ts`), plus a `custom`
   transport over the same simulator (ROADMAP 6.2 step 7); `injected` rather than `mock` because
   `mock` answers some methods itself instead of asking the provider. `lib/wagmi.ts` exports
   `createRealConfig()`; `main.tsx` builds either it or `demo/wagmiDemo.ts`'s config. Feature
   write code is unchanged. No `http()` transport is constructed in demo mode, and EIP-6963
   discovery is off so a real browser wallet is never offered. The demo registers a synthetic
   chain-31337 deployment (fake addresses + committed `web/src/demo/abis.generated.ts`, from
   `web/scripts/gen-demo-abis.mjs`), since static/CI builds have no deployments artifact.
5. **Network guard.** `installDemo()` wraps `fetch`, `XMLHttpRequest.open`, `WebSocket`,
   `EventSource` and `navigator.sendBeacon` so any request whose URL is not an allowed
   same-origin static asset is blocked: `fetch` logs and rejects with `DemoNetworkError` (it
   never throws synchronously for a bad URL), the others log and throw it synchronously. Denied
   even when same-origin: the `/v1` API paths and the `/anvil` dev RPC proxy path, plus the
   configured `VITE_API_URL` origin outright — a leak fails loudly instead of silently reaching
   a real API or RPC endpoint.
6. **UX.** A persistent `DemoBanner` ("Demo — simulated data, no real funds or chain") renders
   whenever `DEMO_MODE` is on, with a persona-switcher slot filled in a later step.
7. **Invariants.** In a `VITE_DEMO_MODE=1` build the app never opens an RPC connection, never
   calls the API, never signs or requests a signature from a real wallet, and always shows the
   banner. Demo code is tree-shaken out of normal builds. Demo fixtures use glossary vocabulary
   and real fee math (`lib/auction.ts`, 250 bps default fee) so the numbers shown are honest.

## Alternatives considered

- **MSW (Mock Service Worker)** — adds a runtime dependency and a service worker for what is
  meant to be a plain static site; rejected.
- **Separate demo app package** — would duplicate UI and drift from the real app; rejected.
- **Hitting a public testnet** — needs RPC access and a faucet, so it is not zero-backend;
  rejected.

## Consequences

- ROADMAP 6.2. `web/src/demo/` holds the flag, installer, network guard, banner, and (6.2, in
  progress) the fixtures, fixture API adapter, and in-memory chain simulator behind the demo wallet's
  `injected` connector.
- `npm run build:demo` (6.2, in progress) will produce a static `web/dist-demo` bundle (SPA
  fallback) with no RPC URL or API base baked in; CI will build it to guard the tree-shaking
  invariant.
- Demo mode is additive: it changes bootstrapping (`main.tsx`), the request resolver seam in
  `lib/api.ts`, and the wagmi config factory, but no feature-folder business logic.

## References

- ADR-0013 (dev Anvil wallet injector — the dynamic-import-before-boot pattern this reuses).
- `docs/business/market-fit.md` (blocker #1).
- ROADMAP 6.2.
