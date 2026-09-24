# OpenAd JIT Index

Living subsystem index and architectural anchors for OpenAd.

## Subsystems

### 1. Documentation (`docs/`)
- `docs/GLOSSARY.md` — Core terminology and domain vocabulary.
- `docs/PROTOCOL.md` — On-chain protocol specification, mathematical invariants, events, deploy order.
- `docs/ARCHITECTURE.md` — System architecture, write/read paths, package relationships, serve contract.
- `docs/CONVENTIONS.md` — Coding rules, package constraints, testing rules, definition of done.
- `docs/ROADMAP.md` — Phased development tasks, pointers, and acceptance criteria.
- `docs/adr/` — Architecture Decision Records (0001–0015; 0016 demo mode and 0017 GCP deploy planned in Phase 6).
- `docs/adr/0007-local-run-scripts.md` — Local run scripts: PowerShell-only, titled terminals, docker-only down, MockUSDC honesty.
- `docs/adr/0012-local-sim-daemon.md` — Opt-in Anvil sim personas `#3–#9`.
- `docs/adr/0013-dev-wallet-injector.md` — DEV-only keyless Anvil EIP-1193 forwarder for headed critique.
- `docs/business/` — (Phase 6) market fit, GTM/marketing, pitch-deck content source (`pitch-deck.md` → hosted slides), demo script, competitive table.
- `docs/qa/` — Dual-persona SME/UX journeys, critique, findings, scorecard (ROADMAP 4.8).

### 2. Smart Contracts (`contracts/`)
- `contracts/src/interfaces/*.vyi` — Canonical contract interfaces (`IAdSlot`, `IMarketplace`, `ICreativeRegistry`).
- `contracts/src/mocks/MockUSDC.vy` — ERC-20 + EIP-2612 permit mock token for tests and local chain.
- `contracts/script/deploy.py` — Protocol deployment pipeline and Anvil setup.
- `contracts/script/artifacts.py` — Schema builder for `contracts/deployments/<chainId>.json`.
- `contracts/moccasin.toml` — Moccasin network and compiler configuration.

### 3. API & Indexer (`api/`)
- `api/src/openad/main.py` — FastAPI application factory, middleware, router mounts.
- `api/src/openad/config.py` — Pydantic settings loading `OPENAD_*` environment variables.
- `api/src/openad/db/` — Database engine (`session.py`), metadata bootstrap (`bootstrap.py`), custom types (`types.py`).
- `api/src/openad/models/` — SQLAlchemy 2.0 ORM models for slots, terms, leases, creatives, approvals, cursor.
- `api/src/openad/schemas/` — Pydantic request/response schemas (`serve.py`, `slot.py`, `health.py`).
- `api/src/openad/indexer/` — Chain indexer worker (`runner.py`, `handlers.py`, `events.py`, `__main__.py`).
- `api/src/openad/services/` — Business logic layers (`serve.py`, `slots.py`).
- `api/src/openad/chain/` — Web3 client factory (`client.py`) and deployment artifact loader (`deployments.py`).

### 4. Web Application (`web/`)
- `web/src/main.tsx` & `web/src/app/` — Application entrypoint, routing, layout providers.
- `web/src/features/` — Feature modules: `marketplace/`, `publisher/`, `advertiser/`.
- `web/src/dev/` — ADR-0013 Anvil injector, EIP-6963 announce, RainbowKit auto-connect (`?devwallet=`).
- `web/src/lib/` — API fetch client (`api.ts`), Wagmi config (`wagmi.ts`), deployments reader (`deployments.ts`), formatting (`format.ts`), `devWalletQuery.ts`.
- `web/scripts/sync-deployments.mjs` — Deployment sync script creating `web/src/generated/deployments/`.

### 5. Embed Component (`embed/`)
- `embed/src/open-ad.ts` — Standalone `<open-ad>` Custom Element (zero dependencies, shadow DOM).
- `embed/src/types.ts` — Serve response types matching `api/src/openad/schemas/serve.py`.
- `embed/scripts/check-size.mjs` — Bundle size gatekeeper (≤ 5 KB gzipped).

### 6. Local Run Scripts (`scripts/`)
- `scripts/setup.ps1` — Idempotent first-time setup: `.env`, docker, `uv sync`, Moccasin wallet import (once), MockUSDC deploy, `openad.db.bootstrap`, `npm install`, web deployment sync. Honest summary: MockUSDC-only until ROADMAP 1.1–1.4.
- `scripts/dev-up.ps1` — Preflight (`.env`, `31337.json`, docker health, port report); starts titled PowerShell windows for api, indexer, web (`-Embed` optional). Does not kill conflicting ports.
- `scripts/dev-down.ps1` — `docker compose down` only (optional `-Reset` drops `pgdata`, `31337.json`, `api/.cache/`). Never kills app processes.
- Root `package.json` — `stack:setup`, `stack:up`, `stack:down`, `stack:sim`, `stack:sim:down` npm wrappers (`powershell -ExecutionPolicy Bypass -File scripts/*.ps1`).

**Local-run decision log (ADR-0007):** PowerShell 5.1 only (no bash twins yet); new titled terminals per process (not background jobs / `concurrently`); `stack:down` stops docker only — close `openad-*` windows or Ctrl+C to stop apps.

### 7. Local sim (`sim/`, ADR-0012)
- `sim/src/main.ts` — opt-in daemon (Anvil #3–#9). Not started by `dev-up`.
- `sim/src/mcp.ts` — MCP stdio adapter to `127.0.0.1:8610`.
- `scripts/sim-up.ps1` / `sim-down.ps1` — titled `openad-sim` window; down is close-the-window.
- `.cursor/skills/sandbox-sme-critique/` — AdTech + crypto business SME (headed critique).
- `.cursor/skills/sandbox-ux-critique/` — ads + crypto UI/UX SME.

### 8. Infrastructure & Tooling (`infra`)
- `docker-compose.yml` — Local Anvil (host 8545) + Postgres 16 (host 15432 → container 5432).
- `.env.example` — Master configuration template for all services.
- `package.json` — Root npm workspaces script runner and `stack:*` local loop entry points.

### 9. Phase 6 — Go-to-market decisions (2026-09-24, JIT_PLAN)
- **Branch per slice:** each slice on its own branch off current `main` (`docs/market-fit-gtm`, `feat/web-demo-mode`, `feat/publisher-growth`, `feat/analytics`, `feat/bash-stack-scripts`, `feat/gcp-deploy`, `docs/launch-polish`), one PR each, merged before dependents start.
- **Demo mode invariant (ADR-0016):** `VITE_DEMO_MODE=1` web build uses seeded in-memory fixtures (via `lib/api.ts` `setRequestHandler`) + wagmi `mock` connector over an in-memory EIP-1193 simulator; fetch guard throws on any API/RPC URL; never opens RPC, never calls the API, never requests real signatures; persistent "Demo — simulated data" banner; demo code tree-shaken from normal builds; static-hostable. Lives in `web/src/demo/`.
- **Analytics:** CTR/eCPM/trends computed off-chain from `serve_events` + indexed leases/settlements; read-only endpoints; no new events, no chain reads in serve path.
- **Deploy (ADR-0017):** GCP Cloud Run (api/indexer/settler/web), Cloud SQL, GCS media cache behind `OPENAD_MEDIA_BACKEND=local|gcs`, Secret Manager for settler key; CI deploy gated on GCP secrets; no mainnet broadcast from CI. Runbook `docs/deploy-gcp.md`.
- **Scripts:** bash twins `scripts/*.sh` amend ADR-0007 (no longer PowerShell-only).
- **No protocol contract changes** in Phase 6; revenue lever is GMV × `fee_bps` (250, cap 1000) to the owner-settable treasury. Slice A step 2 (competitive.md) moved to slice G.
