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
      `web/dist-demo` that runs from any sub-path with **no server-side fallback** (hash router + relative base, ADR-0016 hosting amendment), proven by `npm run test:demo -w e2e`
      (`e2e/demo/`, served with no SPA fallback) including a cold deep link.
      _Done 2026-09-25._
- [x] **6.3 Publisher growth (embed code, share page, off-chain profile).** _Done 2026-09-25._
      Pointers: `web/src/features/publisher/` · `docs/guide/publisher/`.
      Acceptance: copy-paste embed snippet generator with CMS instructions; public `/slot/:id`
      share page with OG meta and current price; off-chain publisher profile (site URL,
      audience description, category tags) via a SIWE-guarded API endpoint; no chain writes.
      Delivered: serve CORS fixed (`ServeCorsMiddleware`, `docs/ARCHITECTURE.md` §3.4); the web
      build ships a versioned embed script (`embed/open-ad.v1.js`, `lib/embedSnippet.ts`);
      `EmbedCodePanel` (platform tabs + "Advertise here" badge) on Supply; `SlotPage` has a Share
      row (copy link + X/Farcaster) and static `og:*`/`twitter:card` defaults on `index.html`;
      publisher-provided **slot listings** — `slot_listings` table (migration `0004`),
      `openad/listing_taxonomy.py` (fixed category taxonomy), owner-only
      `PUT`/`DELETE /v1/slots/{id}/listing` (validated: control characters, URLs in the summary,
      unknown/too-many categories), `SlotOut.listing` (additive) and `GET /v1/slots?category=`,
      a `ListingEditor` on Supply, a Discover category filter, and `SlotCard`/`SlotPage` badges;
      `docs/guide/publisher/{embed-code,listing}.md`.
      **Acceptance amended, 2026-09-25:** the share page is `/slots/:id`, not `/slot/:id`; OG is
      static site-wide defaults rather than per-slot metadata (per-slot OG needs server or edge
      rendering — Phase 7); the "off-chain publisher profile" shipped as a per-slot **listing**
      (summary, audience, up to 3 categories) instead of a separate publisher-level profile,
      because the site itself is the slot's on-chain `domain` and there is no separate site-URL
      field to collect.
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
- [x] **6.6 Deploy artifacts (ADR-0017).** _Done 2026-09-25._
      Pointers: ADR-0017 · `docs/deploy-gcp.md` · `.github/workflows/ci.yml`.
      Acceptance: Cloud Run service configs for `api`/`indexer`/`settler` (settler key from
      Secret Manager, may only `settle_batch`); Cloud SQL Postgres; GCS media-cache backend
      behind a storage interface with local disk as default; web/demo served as a static site;
      CI `deploy` job gated on GCP secret presence, staging/demo only, no mainnet broadcast.
      Prerequisite done: `alembic upgrade head` works on a fresh database (`0001_baseline`
      frozen to explicit DDL; guarded by `api/tests/test_migrations.py`).
      Delivered: `web/Dockerfile` (+ nginx template, per-variant CSP),
      `infra/gcp/{cloudbuild.yaml,services/*.yaml,jobs/migrate.yaml}`,
      `scripts/deploy-gcp.sh` (staging/prod, demo/stack/all, dry-run, mainnet-in-CI refusal),
      `.github/workflows/deploy.yml` (WIF, gated on secrets, staging-only, no prod path) and a
      CI `docker` job. `api/Dockerfile`'s CMD no longer migrates (a Cloud Run Job / compose
      `migrate` service does, before traffic shifts). The actual `gcloud` deploy is user-run —
      see **6.10**.
- [x] **6.7 Docs polish and launch readiness.** _Done 2026-09-25._
      Pointers: `README.md` · `docs/business/demo-script.md` · `docs/qa/scorecard.md`.
      Acceptance: README rewritten with value proposition, demo link, bash+PowerShell
      quickstart, docs map; demo script (2/5/15-minute talk tracks) and launch checklist added,
      including onramp guide links for USDC-only friction (blocker 5, no onramp code); ROADMAP
      6.x fully ticked; GitBook guide `SUMMARY` updated.
      Delivered: `docs/guide/advertiser/getting-usdc-on-base.md` (onramp guide, linked from
      `advertiser/README.md`, `advertiser/buy-a-period.md`, the guide `SUMMARY` and
      `docs/business/launch-checklist.md`); README "What's in the box" and status line; two more
      deterministic screenshots (`buy-receipt.png`, `discover-categories.png`); business-doc and
      `docs/qa/scorecard.md` updates; the ROADMAP Phase 7 backlog below.
      **Acceptance amended, 2026-09-25:** two corrections to the acceptance text above, to match
      what was actually built rather than what was originally planned. (1) "ROADMAP 6.x fully
      ticked" does not hold: **6.10** (the live GCP deployment) is deliberately left open as a
      user-run step, not something this repository can tick on its own — see 6.10 below; every
      other 6.x item is `[x]`. (2) The demo script's talk tracks are listed as "2/5/15-minute",
      not "5-min/15-min" — the 2-minute hallway track already existed going into this step and
      was missing from the original acceptance wording; it is not a new addition here.
      **PR #19 (2026-09-25):** Discover's state, the slot card's timing copy and the slot page's
      period window now follow the open-ended calendar (`docs/PROTOCOL.md` §4.1) instead of
      anchoring to the first period. Before it, every LEASE slot read "Ended" once its first
      period ended, and a calendar older than 15 periods showed nothing buyable on the slot
      page.
- [x] **6.8 Auth hardening (SIWE binding, nonce/session hygiene).** _Done 2026-09-25._
      Pointers: ADR-0009 (2026-09-25 amendment) · `docs/threat-model.md` T15, T16 ·
      `api/src/openad/{siwe,ratelimit}.py` · `api/src/openad/services/auth.py` ·
      `web/src/features/auth/useSiwe.ts` · `web/src/lib/permit.ts` · `sim/src/{api,siwe}.ts` ·
      `.github/workflows/ci.yml` (api job) · `docs/deploy-gcp.md` §11.
      Acceptance: a strict EIP-4361 parser (the exact ABNF layout, EIP-55 addresses, nonces of
      8 to 64 alphanumerics, messages of at most 4096 characters); the SIWE `domain` must be
      the authority of an allowed origin (`OPENAD_SIWE_ALLOWED_ORIGINS`, else
      `OPENAD_CORS_ORIGINS`) and its `URI` that same origin, so a message relayed from another
      domain gets 401 and its nonce stays unused; chain id and an `Issued At` window with
      5 minutes of skew; the nonce is consumed atomically (one conditional `UPDATE`) only
      after the signature checks out; used or expired nonces and expired sessions are pruned
      from `POST /v1/auth/nonce` at most once a minute per process (migration `0005` indexes,
      parity on SQLite and Postgres, which CI now runs as a `postgres:16` service); an opt-in
      per-instance rate limit on nonce and verify (`OPENAD_AUTH_RATE_LIMIT_PER_MINUTE`,
      default off, `OPENAD_TRUSTED_PROXY_HOPS`); the web app and the sim build the message
      with viem's `createSiweMessage`, the web app with `window.location.host` and the sim as
      the web origin (`OPENAD_SIM_WEB_ORIGIN`). Tests: `api/tests/test_auth_hardening.py`.
      Deferred: the limiter stays off on Cloud Run until the `X-Forwarded-For` chain is
      verified in staging (`docs/deploy-gcp.md` §11); Cloud Armor for a global limit.
- [x] **6.9 Capacity and deploy hardening (DB pool budget, Cloud Run scale caps, same-site
      domain, media redirect hops).** _Done 2026-09-25._
      Pointers: `api/src/openad/db/session.py` · `api/src/openad/config.py` ·
      `api/src/openad/services/media.py` · `infra/gcp/services/*.yaml` ·
      `infra/gcp/jobs/migrate.yaml` · `docs/deploy-gcp.md` ("Connection budget", §9) ·
      ADR-0017 amendment · `docs/threat-model.md` T17, T18, T19 · `scripts/deploy-gcp.sh`.
      Acceptance: `Database` sizes its pool from settings (`OPENAD_DB_POOL_SIZE`,
      `OPENAD_DB_MAX_OVERFLOW`, `OPENAD_DB_POOL_TIMEOUT`, `OPENAD_DB_POOL_RECYCLE`,
      `pool_pre_ping=True`) at all four call sites (`api`, indexer, settler,
      `db/bootstrap.py`), SQLite unaffected; Cloud Run `maxScale` set for `api` (4) and `web`/
      `web-demo` (10 each), with `api` pool 4/2, indexer and settler 2/1 each, and no pool env
      on the `migrate` job (`alembic/env.py` opens exactly one connection itself); a documented,
      cited connection budget with a steady-state total of 31 connections (34 counting
      Postgres's 3 superuser-reserved slots), leaving 16 spare in steady state even if
      `max_connections` were as low as 50, plus a separately documented rollout-overlap worst
      case (≈64); `max_connections=100` set explicitly when the Cloud SQL instance is created
      (`--database-flags`) and verified with `gcloud sql instances describe` (no database
      connection) before deploying; web and api required to share a registrable domain in
      production (`SameSite=Lax`), guarded by `scripts/deploy-gcp.sh` refusing a cross-site
      `--only stack|all` deploy unless `--allow-cross-site-auth` is passed; every media redirect
      hop (not just the first URL) re-validated for scheme and, outside dev/test, for a blocked
      hostname (after stripping trailing dots) or an IP literal that is not globally routable or
      is multicast, reserved or IPv6 site-local (including legacy numeric forms and IPv4-mapped
      IPv6); T17 added; all checks green. Outbound-fetch bounds shipped separately in **PR #17**:
      one overall deadline on media fetches, a per-pass budget for indexer verification, and both
      `POST /v1/creatives/{id}/verify` and the domain meta check release their pooled DB
      connection before fetching, with both fetchers reading raw bytes under their caps
      (`Accept-Encoding: identity`) and the meta check additionally bounded by a per-slot
      cooldown — recorded as **T18** (`docs/threat-model.md`). **PR #18** further caps
      `GET /v1/slots/{id}/periods` at 60 periods per request (a wider window gets a house-style
      422 `invalid_window`) and reads its leases in one batched query instead of one per period
      index — recorded as **T19**.
- [ ] **6.10 Live GCP deployment (user-run).**
      Pointers: `docs/deploy-gcp.md` · `docs/business/launch-checklist.md`.
      Acceptance: a GCP project exists and the runbook (§1–§10) has been followed; the Workload
      Identity Federation secrets are set for CI deploy; contracts are deployed to Base Sepolia
      and `contracts/deployments/84532.json` is committed; staging smoke checks pass
      (`/v1/health`, a `/v1/serve/{slot}` response, the embed rendering on a real publisher
      origin); web and api are mapped under one registrable domain (`docs/deploy-gcp.md` §9); the
      auth rate limit is turned on once the `X-Forwarded-For` chain is verified in staging (6.8
      shipped it off by default — follow §11's verify-then-enable steps).

---

## Phase 7 — Post-launch backlog

Found during Phase 6; recorded for later. No Phase 6 task depends on any of these, and none
blocks a testnet/staging launch. **7.10** (the independent security audit) does block a
**mainnet** deploy (`docs/business/launch-checklist.md`); none of the others do.

- [ ] **7.1 Per-slot Open Graph previews.** Needs server-side or edge rendering — the SPA cannot
      set crawler-visible meta at request time. Pointers: `web/index.html`,
      `docs/ARCHITECTURE.md` §5.
- [ ] **7.2 Publish `@openad/embed` to npm or a CDN.** Today the web build hosts
      `embed/open-ad.v1.js` itself. Pointers: `embed/package.json`, `docs/ARCHITECTURE.md` §6.
- [ ] **7.3 Slot listing moderation**, and clearing or flagging a listing on an on-chain slot
      transfer (a listing survives `Transfer` today, so a new owner inherits text they didn't
      write, still labelled "Publisher-provided"). Pointers: `api/src/openad/services/offchain.py`,
      `api/src/openad/indexer/handlers.py`.
- [ ] **7.4 Listing URL-heuristic gaps.** Spaced dots, `[.]`, bare IPs, `@handles` and U+00B7 all
      evade the summary's URL check; accepted for now. Pointers:
      `api/src/openad/services/offchain.py` (`_looks_like_url`).
- [ ] **7.5 `SupplyPage` slot fallback** when a publisher has no slots (the `['1']` default).
      Pointers: `web/src/features/publisher/SupplyPage.tsx`.
- [ ] **7.6 Analytics refinements.** A neutral CTR hint on a CPC slot with impressions but no
      clicks (today it reuses the LEASE "not tracked" hint); advertiser CTR over CPC impressions
      only, not diluted by LEASE impressions; a separate "Booked (upcoming)" tile for leases not
      yet started. Pointers: `api/src/openad/services/analytics.py`, `web/src/lib/analytics.ts`.
- [ ] **7.7 Migration, lint and docs-formatting scope.** `compare_metadata` parity doesn't cover
      server defaults; widen the ruff scope to include `alembic/` (`0002_cpc.py` is unformatted);
      CI's `prettier --check` step covers only `web/src/demo`, `e2e/demo`,
      `web/src/features/marketing` and `web/src/app/routes.tsx`, so the root `format:check`
      script (all of `web/`, `embed/` and `docs/`) never runs in CI, and `docs/` table alignment
      already fails at base on `ARCHITECTURE.md` and `docs/threat-model.md`; some code comments
      cite JIT step numbers (e.g. "step 39", "PLAN step 40") that only the archived plan's
      step → PR map (`.cursor/jit_history/`) resolves. Pointers: `api/tests/test_migrations.py`,
      `api/pyproject.toml`, `.github/workflows/ci.yml`, `package.json` (`format:check`).
- [ ] **7.8 `useSiwe` in-flight race** on an account switch (real app and demo). Pointers:
      `web/src/features/auth/useSiwe.ts`.
- [ ] **7.9 `BuyDialog` unit test** for the `BaseError.shortMessage` error branch. Pointers:
      `web/src/features/marketplace/components/BuyDialog.tsx`.
- [ ] **7.10 Independent security audit** before any mainnet deploy. Pointers:
      `docs/business/launch-checklist.md`.
- [ ] **7.11 Global auth rate limit** (Cloud Armor on a load balancer) instead of the per-instance
      limiter. Pointers: `docs/deploy-gcp.md` §9, §11 · `docs/threat-model.md` T16.
- [ ] **7.12 DNS-rebinding-safe media fetching** (resolve the host once, then fetch by the pinned
      IP) — the T17 residual risk. Pointers: `api/src/openad/services/media.py`,
      `docs/threat-model.md` T17.
- [ ] **7.13 Media-fetch and deploy-guard follow-ups from 6.9.** A prod-mode test that public IP
      literals (`8.8.8.8`, `[2001:4860:4860::8888]`, `[::ffff:8.8.8.8]`, `ads.example.`) are
      accepted; `deploy.yml`'s `--only stack` passing real `API_URL`/`WEB_URL` to the same-site
      guard instead of placeholders; a Public-Suffix-List-aware same-site guard (multi-part
      suffixes such as `co.uk`, `web.app`); `host_of` verified on a real macOS bash 3.2.
      Pointers: `api/tests/`, `.github/workflows/deploy.yml`, `scripts/deploy-gcp.sh`.
- [ ] **7.14 Bounded-concurrency media verification, and a per-verify limit.** PR #17 bounds each
      fetch and each verification pass, but not how many run concurrently; it also leaves
      `POST /v1/creatives/{id}/verify` with no per-address or per-session limit (T18 residuals).
      Pointers: `api/src/openad/indexer/runner.py`, `api/src/openad/routers/creatives.py`.
- [ ] **7.15 Auth follow-ups from 6.8.** A test that percent-encoded URIs/resources are accepted;
      OpenAPI still documents FastAPI's default 422 shape for `/v1/auth/verify`; rename
      `openad.errors.InvalidRequestError`, which clashes conceptually with SQLAlchemy's own; cap
      `SiweIn.signature` length (about 256); `OPENAD_SESSION_SECRET` is read by no code — drop it
      or use it. Pointers: `api/src/openad/siwe.py`, `api/src/openad/schemas/dashboard.py`,
      `api/src/openad/errors.py`, `api/src/openad/config.py`.
- [ ] **7.16 DNS TXT domain verification.** Add `dnspython` (with a resolver lifetime) so
      `_check_dns` can actually succeed, or drop the method from the docs. Pointers:
      `api/src/openad/services/offchain.py`, `docs/ARCHITECTURE.md` §3.6.
- [ ] **7.17 Sim planner period window.** `sim/src/planner/snapshot.ts:48` lists periods 0–4
      only, so sim activity stops after five periods; it should list from the slot's current
      index instead, the way the web app's slot page now does (PR #19). Pointers:
      `sim/src/planner/`.
- [ ] **7.18 Discover "no terms" filter chip, and a defensive zero-period guard.** A slot with no
      sale terms yet reads the new `'no terms'` state (PR #19), which has no Discover filter chip
      — the same pre-existing gap as `'no calendar'`. Separately, `periodsWindowSize` and
      `currentPeriodIndex` (`web/src/lib/auction.ts`) divide by `periodSeconds` with no zero
      guard; a zero period is unreachable today (`set_calendar` and the demo reducer both require
      `periodSeconds >= 3600`), so this is a defensive guard, not a live bug. Pointers:
      `web/src/features/marketplace/DiscoverPage.tsx`, `web/src/lib/auction.ts`.
- [ ] **7.19 Phishing and malware check on click URLs.** Check each `click_url` against a
      URL-reputation service (e.g. Google Safe Browsing, with `OPENAD_SAFE_BROWSING_KEY`) at
      verification and on the scheduled re-check; otherwise drop the setting. Pointers:
      `api/src/openad/services/media.py` (`check_click_url`), `api/src/openad/config.py`,
      `docs/ARCHITECTURE.md` §3.5, `docs/threat-model.md`.

---

## Out of scope (do not build without a new ADR)

English or sealed-bid occupancy auctions · per-click chain transactions · advertiser HTML/JS
creatives · custodial onboarding · multi-currency settlement · sublease market · publisher-set
actual CPC · ranking by locked click budget.
