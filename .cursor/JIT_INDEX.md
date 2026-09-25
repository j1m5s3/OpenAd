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
- **Demo ABIs:** `web/src/demo/abis.generated.ts` is committed (generated by `web/scripts/gen-demo-abis.mjs` from `contracts/out`; `--check` in CI) because `generated/deployments` is empty in static/CI builds; demo registers a synthetic chain-31337 deployment with fake addresses at install time.
- **Demo verification:** Playwright demo suite `e2e/demo/` (`npm run test:demo -w e2e`) runs against `vite preview` of the demo build; locally set `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` and `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. Asserts zero outside requests. The demo build strips Google Fonts (a `transformIndexHtml` plugin); a full reload resets the demo store and wallet.
- **Analytics (ARCHITECTURE §3.x, ROADMAP 6.4):** public `GET /v1/analytics/slots/{id}` and `/v1/analytics/advertisers/{addr}`. Impressions count only `lease`/`campaign` serves with `origin_ok`, and CTR uses payable clicks, as integer bps. eCPM is an integer floor in base units per 1000 impressions. CPC is reported as settled (`CampaignSettlement`, totals only, no timestamp) and accrued (Σ `gsp_cpc` of payable clicks) and never summed together. Buckets are UTC days, zero-filled, window ≤ 90 days. Reads only off-chain and indexed tables; no new events. Web `generated/openapi.*` is built from the API at build time and git-ignored.
- **Deploy (ADR-0017):** GCP Cloud Run (api/indexer/settler/web), Cloud SQL, GCS media cache behind `OPENAD_MEDIA_BACKEND=local|gcs`, Secret Manager for settler key; CI deploy gated on GCP secrets; no mainnet broadcast from CI. Runbook `docs/deploy-gcp.md`.
- **Scripts:** bash twins `scripts/*.sh` (+ `lib.sh`, `stack-docker.sh`, `check-sh.sh`) amend ADR-0007: background children with prefixed output + Ctrl+C trap instead of titled windows; every script has `--dry-run`; `npm run check:sh` in CI.
- **Parallel tracks:** a slice may run in its own git worktree (`/home/claude/OpenAd-<slice>`) while another slice codes; JIT files are only edited on the primary track's branch.
- **No protocol contract changes** in Phase 6; revenue lever is GMV × `fee_bps` (250, cap 1000) to the owner-settable treasury. Slice A step 2 (competitive.md) moved to slice G.
- **Migration hazard (found 2026-09-24):** an Alembic revision must never call `Base.metadata.create_all` or import live models. `0001_baseline` did, which broke `upgrade head` on any fresh database. It is fixed in slice H (`fix/alembic-fresh-db`) by freezing 0001 to an explicit schema, guarded by `api/tests/test_migrations.py` (fresh upgrade, model/migration parity through `compare_metadata`, and a downgrade/upgrade round trip). Any model change needs a new revision, or the parity test fails.
- **Real Postgres for Verify:** there's no docker daemon, but Postgres 16 runs locally via `pgserver` in a scratch venv (binaries in `/usr/lib/postgresql/16`). Set `OPENAD_TEST_PG_URL` so `api/tests/test_migrations.py` (and other PG-gated tests) run against it; otherwise they skip. CI does the same with a `postgres:16` service and a "pytest with Postgres" step (PR #15).
- **Media cache (ADR-0017, slice F):** the indexer writes verified media and the api serves it. Behind `MediaStore` (`local` by default, `gcs` via `OPENAD_MEDIA_BACKEND`); `cached_path` holds a local path or a `gs://` ref, and reads dispatch by scheme. Needed because Cloud Run containers don't share disk. Migrations move from the api CMD to a Cloud Run Job.
- **Deploy pipeline (slice F):** `infra/gcp/` (cloudbuild, Cloud Run service/job YAMLs) rendered by `scripts/deploy-gcp.sh` (`--env staging|prod`, `--only demo|stack|all`, `--dry-run`; prod needs `--i-understand-this-is-mainnet` and is refused under `CI=true`). `.github/workflows/deploy.yml` uses WIF only, is skipped when `GCP_WORKLOAD_IDENTITY_PROVIDER` is unset, and deploys staging only. A stack deploy requires a committed `contracts/deployments/<chainId>.json`, and none exists yet, so only the static demo is deployable today. The api image no longer migrates on start (Cloud Run Job `openad-migrate`; compose `migrate` service). A CI `docker` job builds the images, since there's no local daemon.
- **Docker available (2026-09-25):** `dockerd` can be started in this container as root (`nohup dockerd &`, BuildKit OK). Verify steps may build and run images and `docker compose up` Anvil + Postgres (or the full stack) for the real YAML e2e suite. This supersedes the earlier "no docker daemon" note.
- **Demo hosting:** `npm run build:demo` → `web/dist-demo` (hash router, `base: './'`, base-relative demo media, demo-only `publicDir` `web/public-demo`) runs from any sub-path on a static host with no SPA fallback, such as a claude.ai Artifact. Playwright `test:demo` runs in that mode. The nginx `web-demo` image (slice F) is the GCP variant.
- **Hosted pitch deck:** https://claude.ai/artifact/Day12XXUFNi7CJdNpa2MUH (content source `docs/business/pitch-deck.md`). The demo and deck Artifacts stay private until the owner shares them.
- **Hosted demo:** https://claude.ai/artifact/AzkEcWfmUT23GCo2qkWxE7 (built from `web/dist-demo` on main `591e576`). Republish to the same URL after demo-affecting merges.
- **Serve CORS (slice C):** `/v1/serve/*` must answer any origin (`*`, no credentials) so `<open-ad>` works on publisher domains; all other routes keep the credentialed `cors_origins` allowlist. Origin enforcement (paid vs house) is separate. The web build ships the embed at `embed/open-ad.v1.js`.
- **JIT files location:** since slice B merged, the uncommitted JIT edits ride with the branch checked out in the primary tree (`/home/claude/OpenAd`). Step 37 committed them as `2ce0f5b`; later edits ride with `chore/launch-final`.
- **Slot listings (step 16, PR #13):** off-chain `slot_listings`, migration `0004`, not rebuildable from chain. Summary ≤140 characters with no URLs, audience ≤600, up to 3 of 12 categories (`openad/listing_taxonomy.py`). Owner-only `PUT`/`DELETE /v1/slots/{id}/listing` (SIWE). Additive `SlotOut.listing`, `GET /v1/slots?category=`. Shown as "Publisher-provided". Known accepted URL-heuristic gaps are tracked for Phase 7.
- **Migration head:** `0005_auth_prune_indexes` (PR #15; `down_revision` `0004_slot_listings`). Every revision uses explicit DDL and `IF (NOT) EXISTS` for index-only revisions, and parity must pass on SQLite and PG.
- **SIWE binding (D10, step 37, PR #15):** EIP-4361 `domain` = the authority of an allowed origin, and `URI` has the same origin. Allowed origins come from `OPENAD_SIWE_ALLOWED_ORIGINS`, falling back to `OPENAD_CORS_ORIGINS`. Web uses `window.location.host`; the sim signs as the web origin (`OPENAD_SIM_WEB_ORIGIN`). The nonce is consumed atomically after the signature check. Auth rows are pruned from `issue_nonce` at most once per 60 s. `OPENAD_AUTH_RATE_LIMIT_PER_MINUTE` defaults to 0 (off); `OPENAD_TRUSTED_PROXY_HOPS` selects the right-most N-th `X-Forwarded-For` entry. As shipped: strict EIP-4361 ABNF (two empty lines when there's no statement), EIP-55 addresses only, ±300 s clock skew, nonce of 8–64 alphanumerics, message ≤ 4096 characters. Web `permit.ts` and the sim build messages with viem's `createSiweMessage`, which rejects IPv6 literals and single-label hosts other than `localhost`, so a web origin must be `localhost`, an IPv4 address or a dotted hostname. Invalid bodies on `/v1/auth/*` get a house-style 422 `invalid_request`. The limiter stays off in `infra/` until the XFF chain is verified (runbook verify-then-enable steps, max-instances=1 during the test).
- **Capacity and domain (D11, D12; step 38, PR #14):** pools come from `OPENAD_DB_POOL_SIZE`/`OPENAD_DB_MAX_OVERFLOW` (plus timeout 30 s, recycle 1800 s, pre-ping; SQLite ignores them) at all four `Database(url, settings)` sites: api 4 + 2, indexer and settler 2 + 1, the migrate job none (Alembic opens one connection). Cloud Run `maxScale`: api 4, web and web-demo 10. Cloud SQL `max_connections=100` is pinned by flag (check with `gcloud sql instances describe … --format='value(settings.databaseFlags)'`); the budget is 31 steady, 34 with 3 reserved, ≈64 during a rollout overlap. Web and api must share a registrable domain (`SameSite=Lax`; `run.app` is on the PSL), and `deploy-gcp.sh` refuses otherwise unless `--allow-cross-site-auth` is passed. Media fetch: at most 3 redirects, followed manually, every hop https; outside dev, loopback, private, reserved, `*.internal` and `*.localhost` hosts are refused (dev keeps loopback for the sim).
- **Outbound fetch hazard (found 2026-09-25):** httpx `timeout=` is per operation (each read), not a total deadline. Wrap every outbound fetch in `asyncio.timeout`, stream it with a byte cap, and never hold a DB session across network I/O. Today media verification runs inline in the indexer loop, and the domain meta check holds a pooled connection while it fetches (step 39, accepted).
- **Calendar rule for UI (step 40):** periods are open-ended (`start_k = first_period_start + k·period_seconds`). A period is buyable, time-wise, when `max(0, start_k − lead) ≤ now < end_k` and (`sale_end == 0` or `end_k ≤ sale_end`), with LEASE terms, `lead > 0`, not paused and not leased. See the PROTOCOL §4.1–4.2 `buy` checks and `api/src/openad/services/periods.py`. Never derive a UI state or a period list from the first period alone; list periods from the current index.
- **Periods endpoint (step 41, proposed):** `GET /v1/slots/{id}/periods` has no range cap today and reads leases one index at a time.
- **DNS TXT verification:** documented, but `dnspython` isn't a dependency, so `_check_dns` always returns False. The UI uses the meta tag only.
- **Local e2e:** `e2e/demo/demo.config.ts` honours `PLAYWRIGHT_CHROMIUM_PATH`. The main `e2e/playwright.config.ts` gets the same hook in step 36.
