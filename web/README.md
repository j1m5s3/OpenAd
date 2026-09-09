# @openad/web

Marketplace, publisher dashboard, and advertiser dashboard. Vite SPA · React 19 · TypeScript ·
MUI · react-router · TanStack Query · wagmi/viem.

Rules: [`/docs/CONVENTIONS.md`](../docs/CONVENTIONS.md) §5 and `.cursor/rules/web-react.mdc`.
Architecture: [`/docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) §5.

## Commands (run from the repo root or this folder)

```bash
npm install                 # once, at the repo root (npm workspaces)
npm run dev -w web          # http://localhost:5173  (also: npm run dev:web at the root)
npm run typecheck -w web
npm run lint -w web
npm run test -w web         # vitest
npm run build -w web        # -> dist/
npm run sync:deployments -w web   # copies contracts/deployments/*.json into src/generated/
```

Environment: `VITE_API_URL`, `VITE_CHAIN_ID` from the repo-root `.env` (see `.env.example`).

## Layout

```text
src/
  main.tsx                 mount
  app/                     App (providers), Layout (nav shell), routes
  components/              ConnectButton (wagmi connectors, chain switch)
  features/
    marketplace/           useSlots/useSlot query hooks (api.ts), MarketplacePage
    publisher/             PublisherPage (ROADMAP 3.3)
    advertiser/            AdvertiserPage (ROADMAP 3.4)
  lib/
    api.ts                 typed /v1 client (types mirror api/src/openad/schemas)
    wagmi.ts               chains (foundry, baseSepolia, base), connectors, targetChainId
    deployments.ts         getContract(chainId, name) from the generated artifact
    format.ts              formatUsdc/parseUsdc (bigint base units), addresses, times
  theme/                   the one MUI theme
  generated/               git-ignored output of scripts/sync-deployments.mjs
```

## Rules of the road

- Reads come from the API through TanStack Query; never enumerate chain state in the browser.
- Writes go through wagmi hooks with `getContract(targetChainId, …)`; the only live read is
  `Marketplace.quote` for the buy dialog.
- Money stays `bigint` until `lib/format.ts`. Named exports only.
