# @openad/web

Discover marketplace, Supply (publisher) dashboard, and Campaigns (advertiser) dashboard.
Vite SPA · React 19 · TypeScript · Tailwind · RainbowKit · react-router · TanStack Query · wagmi/viem.

Rules: [`/docs/CONVENTIONS.md`](../docs/CONVENTIONS.md) §5 and `.cursor/rules/web-react.mdc`.
Architecture: [`/docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) §5. ADRs 0008–0011.

## Commands (run from the repo root or this folder)

```bash
npm install                 # once, at the repo root (npm workspaces)
npm run dev -w web          # http://localhost:5173  (also: npm run dev:web at the root)
npm run typecheck -w web
npm run lint -w web
npm run test -w web         # vitest
npm run build -w web        # -> dist/
npm run sync:deployments -w web
npm run sync:openapi -w web
```

Environment: `VITE_API_URL`, `VITE_CHAIN_ID`, `VITE_WALLETCONNECT_PROJECT_ID` from the repo-root `.env`.

## Layout

```text
src/
  main.tsx                 mount + RainbowKit CSS + Tailwind
  app/                     App (providers), Layout (Discover / Supply / Campaigns)
  components/              SlotCard, WalletRail, IndexerLagBanner
  features/
    marketplace/           Discover + slot page + buy dialog
    publisher/             Supply
    advertiser/            Campaigns
    auth/                  SIWE after connect
  lib/
    api.ts                 fetch client typed from generated OpenAPI
    wagmi.ts               RainbowKit getDefaultConfig
    deployments.ts         getContract(chainId, name)
    format.ts              USDC / time
    permit.ts              EIP-2612 + SIWE helpers
  styles/                  Tailwind tokens
  generated/               git-ignored (deployments + openapi.ts)
```
