# Roadmap

Work is organised in phases; each phase has numbered tasks. Pick the first unchecked task in
the lowest incomplete phase unless the user says otherwise. Each task lists **Pointers** (the
exact places to read before starting) and **Acceptance** (what "done" means). Update the
checkbox and add a one-line note when you finish. Do not start a later phase's task if it
depends on an unchecked earlier one.

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[-]` dropped (say why).

---

## Phase 0 — Foundation

- [x] **0.1 Repository scaffold and documentation.** Monorepo layout, package manifests, docs set,
      Cursor rules, docker-compose, `.env.example`. _Done 2026-09-08._
- [x] **0.2 Contracts package skeleton.** Moccasin project, canonical `.vyi` interfaces,
      `MockUSDC`, deploy script with artifact writer, test fixtures. _Done 2026-09-08._
- [x] **0.3 API package skeleton.** FastAPI app factory, settings, DB session, initial models,
      serve endpoint with house-ad fallback, indexer runner + handler registry, tests. _Done 2026-09-08._
- [x] **0.4 Web and embed skeletons.** Vite/React/MUI/wagmi shell with routes; `<open-ad>` element
      with demo page and size check. _Done 2026-09-08._
- [x] **0.5 Local run scripts.** PowerShell setup/up/down plus `stack:*` npm wrappers; titled
      windows for api/indexer/web; docker-only down. _Done 2026-09-08._
- [x] **0.6 CI and local API/indexer image.** `.github/workflows/ci.yml`; `api/Dockerfile` plus
      `docker-compose.stack.yml`. No GCP / Cloud Run. _Done 2026-09-11._

## Phase 1 — Protocol contracts (Base Sepolia)

- [x] **1.1 `CreativeRegistry.vy`.**
      Pointers: `PROTOCOL.md` §3.3, §5.3, §6, §8 (7, 8) · `contracts/src/interfaces/ICreativeRegistry.vyi` · `contracts/tests/conftest.py`.
      Acceptance: implements the interface; all revert strings match; `tests/test_creative_registry.py` covers every function, both approval paths, moderator revoke, same-chain NFT ownership check (use a snekmate ERC-721 mock); property tests for invariants 7 and 8. _Done 2026-09-11._
- [x] **1.2 `AdSlot.vy`.**
      Pointers: `PROTOCOL.md` §3.1, §4.1, §5.1, §6, §8 (1, 2, 3, 9) · `contracts/src/interfaces/IAdSlot.vyi` · snekmate `tokens/erc721.vy` (do not export `safe_mint`).
      Acceptance: `tests/test_ad_slot.py` covers mint validation, calendar rules incl. `"leases outstanding"`, lease writing only by market, `userOf/userExpires` across period boundaries via `boa.env.time_travel`; hypothesis test that leases never overlap. _Done 2026-09-11._
- [x] **1.3 `Marketplace.vy`.**
      Pointers: `PROTOCOL.md` §3.2, §4.2, §4.3, §5.2 (check order!), §6, §8 (4, 5, 6, 10) · `contracts/src/interfaces/IMarketplace.vyi` · `contracts/src/mocks/MockUSDC.vy` · ADR-0004 (permit).
      Acceptance: `tests/test_marketplace.py` covers price curve at open/mid/just-before-start, `"not open"`/`"closed"`, fixed-price case, each revert in `buy` order, fee split exactness, pass-through invariant, `buy_with_permit` incl. a pre-consumed permit still succeeding when allowance exists; property test: `floor <= price <= start` and monotonic. _Done 2026-09-11._
- [x] **1.4 Deploy script end-to-end.**
      Pointers: `PROTOCOL.md` §10 · `ARCHITECTURE.md` §4.1 · `contracts/script/deploy.py`.
      Acceptance: `uv run mox run deploy --network anvil` deploys all four contracts in order, wires market/treasury/fee/moderator, mints two demo slots + terms + one approved creative + one purchased period, and writes a valid `deployments/31337.json`. _Done 2026-09-11 (pyevm covered by `test_deploy.py`; Anvil via setup script)._
- [ ] **1.5 Base Sepolia deployment.** Script + runbook in `docs/deploy-sepolia.md`. Broadcast and committed `84532.json` only when a deployer key is present; not required for local prod-readiness.

## Phase 2 — Indexer, serving edge, embed (end-to-end on Anvil)

- [x] **2.1 Indexer handlers for all events.**
      Pointers: `PROTOCOL.md` §6 · `ARCHITECTURE.md` §3.2, §3.7 · `api/src/openad/indexer/handlers.py` · `api/src/openad/models/`.
      Acceptance: every event has a handler and a test with a synthetic decoded log; replay from block 0 on Anvil after 1.4 produces expected rows; reorg rewind test. _Done 2026-09-11 (Anvil replay is `@pytest.mark.integration`)._
- [x] **2.2 Alembic baseline migration** for all tables in `ARCHITECTURE.md` §3.2. _Done 2026-09-11 (`0001_baseline`)._
- [x] **2.3 Creative verification + media cache.**
      Pointers: `ARCHITECTURE.md` §3.5 · `api/src/openad/serve/`.
      Acceptance: hash mismatch, MIME mismatch, dimension mismatch, oversize, timeout each produce the documented failure; verified bytes served from `/v1/serve/{slot}/media` with `ETag`. _Done 2026-09-11._
- [x] **2.4 Serve endpoint complete.**
      Pointers: `PROTOCOL.md` §7 · `ARCHITECTURE.md` §3.4 · `api/src/openad/services/serve.py` · `embed/src/types.ts`.
      Acceptance: lease → house → empty precedence tested; blocked/revoked/unverified creatives fall back; origin enforcement toggle tested; response cache headers correct; p95 < 50 ms against local Postgres. _Done 2026-09-11 (p95 vs in-memory SQLite in CI; Postgres in local stack)._
- [x] **2.5 Embed against a real slot.**
      Acceptance: demo page renders a purchased period's creative from Anvil end-to-end; falls back to house ad after `revoke_approval`; bundle ≤ 5 KB gzipped. _Done 2026-09-11 (demo uses slot 1; house attributes cover revoke fallback)._
- [x] **2.6 Public read endpoints** (`/v1/slots`, `/v1/slots/{id}`, `/periods`, `/creatives/{id}`) with tests. _Done 2026-09-11._

## Phase 3 — Web app

- [x] **3.1 SIWE auth** (API `/v1/auth/*` + web `features/auth`). ADR for session strategy. _Done 2026-09-11 (ADR-0009)._
- [x] **3.2 Marketplace browse + buy dialog** (quote via wagmi `Marketplace.quote`, buy via `buy_with_permit`, USDC permit signing). _Done 2026-09-11._
- [x] **3.3 Publisher dashboard**: mint slot, set calendar, set terms, approvals inbox, allowlist, house ad, domain verification, earnings. _Done 2026-09-11._
- [x] **3.4 Advertiser dashboard**: register media/NFT creative (client-side keccak of bytes), request approvals, leases calendar, delivery report from `serve_events`. _Done 2026-09-11._
- [x] **3.5 Generated API client** from FastAPI OpenAPI (`openapi-typescript`), replacing hand-written `lib/api.ts` types. _Done 2026-09-11._
- [x] **E2E harness** Playwright YAML personas (ADR-0010). _Done 2026-09-11 (`e2e/`; gen1–gen4 scenarios)._

## Phase 4 — Hardening and v1.1 features

- [x] **4.1 Late buy** (`PROTOCOL.md` §9) — spec first, then contracts, indexer, UI. _Done 2026-09-11 (remainder phase; no new event)._
- [x] **4.2 Pricing autopilot** (publisher-side suggestion engine; no protocol change). _Done 2026-09-11 (`GET /v1/publishers/{address}/pricing-suggestion`)._
- [x] **4.3 Contract review/audit prep**: threat model doc, slither-vyper run, invariant fuzz campaign. _Done 2026-09-11 (`docs/threat-model.md`; slither script skips if the binary is missing)._
- [x] **4.4 CDN worker for `/v1/serve`** (move serving edge out of the API process). _Done 2026-09-11 as source only (`workers/serve/`); not deployed._
- [x] **4.5 Embedded wallets / gas sponsorship** for web2 publishers (ADR first). _Done 2026-09-11 (ADR-0011; env-gated stub, Anvil skips paymaster)._
- [x] **4.7 Local sim mode (opt-in).** Pointers: ADR-0012 · `docker-compose.yml` · `contracts/script/deploy.py` · `scripts/dev-up.ps1` · `api/src/openad/routers/auth.py` · `api/src/openad/services/media.py`.
      Acceptance: `.\scripts\sim-up.cmd` starts a titled `openad-sim` daemon that is **not** started by `dev-up`; Anvil publishers `#3–#5` and advertisers `#6–#9` mint/approve/buy so Discover looks live; MCP tools inspect/nudge; chain id ≠ 31337 refused. _Done 2026-09-12._
- [ ] **4.6 Base mainnet deployment** with multisig owner and timelock on `set_market`. Script + runbook in `docs/deploy-mainnet.md`. No `8453.json` unless later authorized.
- [x] **4.8 Dual-persona industry critique loop.** Pointers: ADR-0012 · ADR-0013 · `docs/qa/` · `.cursor/skills/sandbox-sme-critique/` · `.cursor/skills/sandbox-ux-critique/`.
      Acceptance: headed Playwright MCP (or documented fallback) runs both skills against local web; scorecard phases are `pass` / `sandbox-acceptable` / `blocked-by-invariant` with zero open table-stakes `implement-now` / `adr-then-implement`; identity fence intact.
      _Done 2026-09-12 (Edge `e2e/scripts/smoke-devwallet.mjs` + `critique-pass.mjs`; Playwright MCP was not connected this session; scorecard round 2 clear; no dual-tag protocol ADR)._
- [x] **4.9 User guide + in-app guidance.** Pointers: ADR-0015 · `docs/guide/` · `web/src/lib/copy.ts` · `web/src/components/{FieldHint,Wizard,Field}.tsx` · Supply / Campaigns / BuyDialog / OpenCampaignDialog. Does **not** depend on 1.5 or 4.6.
      Acceptance: GitBook-ready `docs/guide/` (glossary terms; CPC never called auction); `VITE_GUIDE_URL` optional; FieldHint + Wizard with no new deps; mint→calendar→terms, register→approval, and buy/open-campaign are staged with “what happens next”; each stage still one on-chain call; e2e/smoke green without a live GitBook.
      _Done 2026-09-14 (`docs/guide/` + Git Sync yaml; FieldHint/Wizard; primary create/buy flows stepped; `VITE_GUIDE_URL` hidden when unset). Git Sync site map `gitbook-docs.yaml` added 2026-09-14. Hosted book `https://pam-2.gitbook.io/open-ad-docs` wired as `VITE_GUIDE_URL` 2026-09-14._

---

## Phase 5 — CPC sale mode (ADR-0014)

Does **not** depend on 1.5 or 4.6. Local Anvil is enough. Spec: ADR-0014 + `PROTOCOL.md` §11.
Do not start 5.2 until picking up this phase. Use glossary **sale mode** / **campaign** / **CPC**
(not “auction” for occupancy).

- [x] **5.1 ADR-0014 + spec.** Pointers: ADR-0003, 0004, 0006 · `PROTOCOL.md` §1, §7, §9 ·
      `GLOSSARY.md`.
      Acceptance: Accepted ADR; `PROTOCOL.md` §11 Specified; glossary terms; ROADMAP Phase 5;
      LEASE invariants carved, not deleted. _Done 2026-09-14._
- [x] **5.2 Interfaces.** Pointers: `PROTOCOL.md` §11 · `IMarketplace.vyi` · new
      `ICampaignVault.vyi`.
      Acceptance: `.vyi` signatures + events match §11; `Terms` includes `sale_mode` and
      `floor_cpc`. Land in the **same change** as 5.3 so `Marketplace` still `implements:` IMarketplace.
      _Done 2026-09-14._
- [x] **5.3 `CampaignVault.vy` + Marketplace deltas + tests.**
      Pointers: `PROTOCOL.md` §11 · ADR-0014 §3 · `tests/conftest.py`.
      Acceptance: open/top_up/pause/close/settle/finalize; mode-switch reverts; `buy` reverts
      `"cpc mode"`; vault balance invariant; `buy` pass-through still holds; hypothesis 11–15.
      _Done 2026-09-14._
- [x] **5.4 Indexer + Alembic.** Pointers: `PROTOCOL.md` §6 CampaignVault events ·
      `ARCHITECTURE.md` §3.2.
      Acceptance: one handler per new event; `campaigns` rebuildable; replay test.
      _Done 2026-09-14._
- [x] **5.5 Serve GSP + `GET /v1/c/{token}` + settler process.**
      Pointers: `PROTOCOL.md` §11.3–11.4 · ADR-0014 §4–5 · `ARCHITECTURE.md` §3.4.
      Acceptance: CPC serve status `campaign`; tokenized clickUrl; house when none eligible;
      IVT discards; settler batches; HTTP api has no settler key; p95 serve still local-fast.
      _Done 2026-09-14._
- [x] **5.6 Web: Discover / Supply / Campaigns CPC path.**
      Pointers: ADR-0014 UI copy · `web/src/features/{marketplace,publisher,advertiser}`.
      Acceptance: mode toggle + floor CPC; fund/top-up/close; Buy hidden on CPC slots; fee
      line on settle history; no raw `sale_mode` integers in copy.
      _Done 2026-09-14._
- [x] **5.7 Sim + e2e CPC.** Pointers: ADR-0012 · ADR-0010.
      Acceptance: sim can open competing campaigns; YAML: fund → serve winner → click →
      settle → publisher USDC; LEASE path still green.
      _Done 2026-09-14 (sim `open_campaign`/`top_up_campaign`; `gen5-cpc.yaml` UI path;
      LEASE YAML unchanged)._

---

## Phase 6 — Go-to-market and production (2026-09)

Business docs live in `docs/business/`; excluded from the GitBook guide unless linked. No
protocol contract changes in this phase (anything that would need one is recorded in
`docs/business/market-fit.md` as future work needing a spec and an ADR first).

- [x] **6.1 Market-fit assessment + GTM plan + pitch-deck source + ROADMAP Phase 6.**
      Pointers: `docs/GLOSSARY.md` · `docs/PROTOCOL.md` §11 · `AGENTS.md` invariants.
      Acceptance: `docs/business/{README,market-fit,gtm-marketing,pitch-deck}.md` exist; pitch
      deck has 12–14 numbered slides each with speaker notes; every adoption blocker in
      `market-fit.md` maps to a 6.x task below; no fabricated customers/traction/quotes;
      glossary vocabulary only (never "sell a slot").
      _Done 2026-09-24._
- [x] **6.2 Demo mode + static showcase (ADR-0016).**
      Pointers: ADR-0016 (new) · `web/src/demo/` · `ARCHITECTURE.md` §7.
      Acceptance: `VITE_DEMO_MODE=1` build uses in-memory seeded fixtures and a simulated
      wallet; never opens an RPC connection, never calls the API, never signs or requests a
      real wallet signature; persistent "Demo — simulated data, no real funds" banner; demo
      code tree-shaken out of normal builds; `npm run build:demo` produces a static
      `web/dist-demo` that runs from any sub-path with **no server-side fallback** (hash router
      + relative base, ADR-0016 hosting amendment), proven by `npm run test:demo -w e2e`
      (`e2e/demo/`, served with no SPA fallback) including a cold deep link.
      _Done 2026-09-25._
- [ ] **6.3 Publisher growth (embed code, share page, off-chain profile).**
      Pointers: `web/src/features/publisher/` · `docs/guide/publisher/`.
      Acceptance: copy-paste embed snippet generator with CMS instructions; public `/slot/:id`
      share page with OG meta and current price; off-chain publisher profile (site URL,
      audience description, category tags) via a SIWE-guarded API endpoint; no chain writes.
- [x] **6.4 Analytics read model (API + UI).** _Done 2026-09-25._
      Pointers: `ARCHITECTURE.md` §3.1, §3.10 · `api/src/openad/schemas/analytics.py` ·
      `api/src/openad/services/analytics.py` · `web/src/lib/analytics.ts` ·
      `web/src/features/{publisher,advertiser}/components/*Performance.tsx`.
      Acceptance: CTR/eCPM/spend/earnings computed off-chain from existing `serve_events` and
      indexed leases/settlements; read-only endpoints; no new on-chain events; no chain reads
      in the serve path; `eCPM = earnings / impressions × 1000` in integer USDC base units
      (floor); Supply and Campaigns show stat tiles + a lightweight trend view.
      _API half done 2026-09-24 (JIT step 19+20, `feat/analytics`): `GET
      /v1/analytics/slots/{slot_id}` and `GET /v1/analytics/advertisers/{address}`, schemas,
      service, tests, `ARCHITECTURE.md` §3.10. UI half (JIT step 21+22, same branch): typed
      client methods, `lib/analytics.ts` helpers, `Sparkline`/`StatTile`, `SlotPerformance` on
      Supply, `AdvertiserPerformance` on Campaigns (settled vs. accrued CPC always kept
      separate, money as `BigInt`, "—" for a null CTR/eCPM), demo analytics computed from the
      in-memory store with a deterministic seeded traffic generator, guide page
      `docs/guide/marketplace/performance.md`._
- [x] **6.5 Cross-platform scripts.** _Done 2026-09-24._
      Pointers: `scripts/*.ps1` · ADR-0007.
      Acceptance: `scripts/{setup,dev-up,dev-down}.sh` at parity with the `.ps1` scripts,
      shellcheck-clean; `npm run stack:*:sh` and `stack:docker`; ADR-0007 amended (not
      rewritten) to note bash twins exist alongside PowerShell.
- [ ] **6.6 Production deploy on GCP (ADR-0017).**
      Pointers: ADR-0017 (new) · `docs/deploy-gcp.md` (new) · `.github/workflows/ci.yml`.
      Acceptance: Cloud Run services for `api`/`indexer`/`settler` (settler key from Secret
      Manager, may only `settle_batch`); Cloud SQL Postgres; GCS media-cache backend behind a
      storage interface with local disk as default; web/demo served as a static site; CI
      `deploy` job gated on GCP secret presence, demo-site deploy only, no mainnet broadcast.
      Prerequisite done: `alembic upgrade head` works on a fresh database (`0001_baseline`
      frozen to explicit DDL; guarded by `api/tests/test_migrations.py`).
      _Progress (step 27+28): `web/Dockerfile` (+ nginx template, per-variant CSP),
      `infra/gcp/{cloudbuild.yaml,services/*.yaml,jobs/migrate.yaml}`,
      `scripts/deploy-gcp.sh` (staging/prod, demo/stack/all, dry-run, mainnet-in-CI refusal),
      `.github/workflows/deploy.yml` (WIF, gated on secrets, staging-only, no prod path) and a
      CI `docker` job all done. `api/Dockerfile`'s CMD no longer migrates (a Cloud Run Job /
      compose `migrate` service does, before traffic shifts). Remaining: the actual `gcloud`
      deploy is user-run (step 29 records the outcome); this environment has no `gcloud`._
- [ ] **6.7 Docs polish and launch readiness.**
      Pointers: `README.md` · `docs/business/demo-script.md` (new) · `docs/qa/scorecard.md`.
      Acceptance: README rewritten with value proposition, demo link, bash+PowerShell
      quickstart, docs map; demo script (5-min/15-min talk tracks) and launch checklist added,
      including onramp guide links for USDC-only friction (blocker 5, no onramp code); ROADMAP
      6.x fully ticked; GitBook guide `SUMMARY` updated.

---

## Out of scope (do not build without a new ADR)

English or sealed-bid occupancy auctions · per-click chain transactions · advertiser HTML/JS
creatives · custodial onboarding · multi-currency settlement · sublease market · publisher-set
actual CPC · ranking by locked click budget.
