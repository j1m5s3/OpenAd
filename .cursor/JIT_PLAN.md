# JIT_PLAN — Market fit, demos, growth, analytics, and production deploy (Phase 6)

Created 2026-09-24 10:40 · Mode: CREATE · Base: `45668c6` (main, clean) · Autonomous run (no
plan-approval checkpoint; user granted commit/push/merge/deploy).

Goal (user, verbatim summary): assess market fit; change what blocks it; apply enhancements that
raise earning potential; a marketing plan; demos to show people; pitch deck; docs; production-ready
and deployed. Work split across branches, one PR per slice.

## 1. Market-fit verdict (brief; the full assessment is step 1's deliverable)

**Verdict: technically sound, not yet market-ready.** The protocol is a real differentiator
(non-custodial; LEASE pays the publisher atomically in the buy tx, CPC pays at the settler's
batch; 2.5% default fee vs 30–50% for ad networks; no tracking; LEASE + CPC). Adoption is blocked by product/GTM gaps, not protocol gaps.

- **Beachhead customer.** Supply: crypto-native publishers with engaged technical audiences —
  newsletters (Substack/Beehiiv/Ghost), dev-tool docs, block explorers/dashboards, web3 blogs and
  podcasts' show-notes pages, open-source project sites. Demand: web3 protocols, wallets, L2s,
  dev-tool startups and hackathons that already hold USDC on Base and want a cookieless,
  verifiable, brand-safe placement bought in one transaction. They value: payout in seconds, low
  take rate, no ad-network approval gate, no third-party tracking, on-chain proof of spend.
- **What blocks adoption today.** (1) Nobody can see it work without running Anvil + Postgres +
  a wallet — no demo, no landing page, no value proposition in the README. (2) Publisher
  onboarding ends at "mint a slot"; there is no copy-paste embed code, no shareable slot page,
  no CMS instructions. (3) Advertisers and publishers see no performance numbers (CTR, eCPM,
  spend/earnings trend) — the first question every buyer asks. (4) Run scripts are
  PowerShell-only; no production hosting config (web, GCS media cache, Cloud Run). (5) USDC-only
  with no onramp (accepted: out of scope per ROADMAP; mitigate with guide links, not code).
- **Earning potential levers (no invariant breaks).** Platform revenue = `fee_bps` (250) on LEASE
  and CPC settlement volume to the treasury (owner-settable address, not immutable) — so GMV is the lever. Raise GMV by:
  faster publisher activation (snippet generator, share page), demand confidence (analytics +
  eCPM reference, earnings calculator), and a zero-friction demo that converts pitches. No
  protocol change is proposed; fee stays governed on-chain (max 1000 bps). Optional later
  levers recorded in the assessment only: featured-slot listings (off-chain, paid in USDC by
  normal transfer — needs ADR), publisher referral attribution (off-chain, needs ADR).

## 2. Decisions

- **D1 — Branch per slice.** Each slice is its own branch off the then-current `main`, one PR,
  merged (squash) after local checks + CI before the next dependent slice starts.
- **D2 — Business docs live in `docs/business/`** (market-fit, GTM/marketing, pitch-deck
  content source, demo script, competitive table). Excluded from GitBook guide unless linked.
  The hosted pitch deck (slides Artifact) is built by the orchestrator from
  `docs/business/pitch-deck.md`; the repo holds the source of truth for its content.
- **D3 — Demo mode invariant (ADR-0016).** `VITE_DEMO_MODE=1` build: the web app uses in-memory
  seeded fixtures and a simulated wallet; it **never** opens an RPC connection, never calls the
  API, never signs or requests signatures from a real wallet, and every page shows a persistent
  "Demo — simulated data, no real funds" banner. Demo code is tree-shaken out of normal builds
  (dynamic import behind `import.meta.env.VITE_DEMO_MODE`). Demo fixtures use glossary copy and
  real fee math (`lib/auction.ts`, 250 bps). Static-hostable (`web/dist` with SPA fallback).
- **D4 — Analytics read model.** CTR / eCPM / trends are computed off-chain from existing
  `serve_events` + indexed leases/settlements; read-only API endpoints; no new events, no chain
  reads in serve path. eCPM = earnings / impressions × 1000 in integer base units (floor).
- **D5 — Deploy target GCP (ADR-0017).** Cloud Run services: `api`, `indexer`, `settler`
  (settler holds `OPENAD_SETTLER_KEY` from Secret Manager, may only `settle_batch`); Cloud SQL
  Postgres; GCS bucket for media cache (behind a storage interface, local disk remains default);
  web + demo as static site (Cloud Run nginx image or GCS+CDN). CI deploy job runs only when
  GCP secrets exist; no mainnet broadcast from CI. This environment has no gcloud/creds: the
  deliverable is config + runbook `docs/deploy-gcp.md`; actual deploy is a user-run step.
- **D6 — Cross-platform scripts.** Bash twins `scripts/*.sh` for setup/up/down plus
  `npm run stack:docker` (compose full stack). Supersedes ADR-0007's "PowerShell only" line via
  an ADR-0007 amendment note, not a rewrite.
- **D7 — ROADMAP Phase 6 "Go-to-market"** added in step 1 with tasks 6.1–6.7 mirroring slices;
  each slice's ship step ticks its task.
- **D8 — No protocol contract changes in this plan.** Anything that would need one is recorded
  in the market-fit doc as "future, needs spec + ADR".

## 3. Slices → branches

| Slice | Branch | ROADMAP | Depends on |
| ----- | ------ | ------- | ---------- |
| A Market fit + GTM + pitch source | `docs/market-fit-gtm` | 6.1 | — |
| B Demo mode + static showcase | `feat/web-demo-mode` | 6.2 | A |
| C Publisher growth (embed code, share page) | `feat/publisher-growth` | 6.3 | B (demo fixtures reuse) |
| D Analytics (API + UI) | `feat/analytics` | 6.4 | — (API), B for demo fixtures; H ✓ merged in `57e2aea` |
| E Cross-platform scripts + one-command stack | `feat/bash-stack-scripts` | 6.5 | — |
| F Production deploy (GCP) | `feat/gcp-deploy` | 6.6 | E |
| G Docs polish (README, demo script, guide) | `docs/launch-polish` | 6.7 | A–F |
| H Fix: fresh-DB Alembic chain (found in review) | `fix/alembic-fresh-db` | 6.6 prerequisite | — (merge before D ships and before F) |

## 4. Micro-steps (one line each; ✱ active, [>] active in parallel, ○ pending, ✓ done)

### Slice A — `docs/market-fit-gtm`
- ✓ 1. A: `docs/business/{README,market-fit,gtm-marketing,pitch-deck}.md` + ROADMAP Phase 6 (6.1–6.7). Review FIX r1 (10) → PASS r2.
- → 2. A: moved to slice G as step 31b (competitive table already in pitch deck; standalone doc not needed to ship A).
- ✓ 3. A ship — PR #4 merged `801440e`. (orchestrator, no coder): commit `docs(business): market fit, GTM plan, pitch-deck source; ROADMAP Phase 6` incl. `.cursor/JIT_PLAN.md` + `JIT_INDEX.md` → push `docs/market-fit-gtm` → PR → merge (squash) after CI. Exclude `package-lock.json` drift.

### Slice B — `feat/web-demo-mode` (merged steps; one coder pass each)
- ✓ 4. B: ADR-0016 + scaffolding (flag, lazy install, network guard over fetch/XHR/WS/EventSource/sendBeacon, `setRequestHandler`, `DemoBanner`). Review FIX r1 → PASS r2 (L3 nits open: redundant `/v1/` prefix check; `install.test` restores only fetch — fold into 5+6). `aafaad7`.
- ✓ 5+6. B: demo clock/fixtures/store/demoApi; `lib/auction.ts` gains `dutchPrice`/`remainderPrice`/`feeSplit`/`FEE_BPS`/shared `computeOpenAt` (`auctionOpenAt` clamps at 0 per PROTOCOL §4.2). Review FIX r1 (8) → PASS r2. `5204b86`.
- ✓ 7. B: `demoChain.ts` EIP-1193 simulator, `reducers.ts` (`applyCall → {state,result}`, `DemoState.ledger`), committed `abis.generated.ts`, synthetic 31337 deployment, `wagmiDemo.ts` (injected target, custom transport), `App` takes `config` prop, `app/queryClient.ts`. Opus coder; review PASS r1 (Playwright smoke: buy on `/slots/0` confirmed, wallet down exactly the quote). `09d3209`.
- ✓ 8+9. B: demo flows for both personas, `PersonaSwitcher`, demo fonts/favicon strip, `e2e/demo` Playwright suite (4 tests, frozen clock, strict guard); demoApi 401/403/404 parity; **real bug fixed** in shared `components/Wizard.tsx` (per-step key; stale uncontrolled inputs caused `set_calendar` "period too short" for real users) + regression test. Opus coder; PASS r1. `7e5c328`.
- ✓ 10+11. B: guided tour (started from the banner, not auto-opened), `/why` calculator (`lib/earnings.ts`, exact non-custodial wording, "default 2.5%, capped at 10%"), `/embed-demo` (real element via Vite alias, tsconfig paths and workspace dep; in-process `isServeRoute` responder); PersonaSwitcher `accountsChanged` fix. FIX r1 → verified; 128 web tests, test:demo 7/7. `71e0869`.
- ✱ 12+13. B: prettier; hash router + relative base + base-relative media + demo-only `publicDir` so `dist-demo` runs from any sub-path without fallback (Artifact hosting); `check-demo-bundle.mjs`; Playwright in static sub-path mode; CI (ABI check, build:demo, bundle check, test:demo, scoped prettier); ADR-0016 hosting; ROADMAP 6.2 `[x]` → ship PR; publish demo Artifact; merge main into D and F. **Risk: medium.** **(full spec below)**

### Slice C — `feat/publisher-growth`
- ○ 14+15. C: `EmbedCodePanel` replacing SupplyPage's inline `<pre>` snippet ("Get code": script tag + `<open-ad>` with size presets, copy, HTML/WordPress/Ghost instructions) + shareable slot page (OG meta, "Advertise here" CTA, current price); demo fixtures updated; tests. **Risk: low.**
- ○ 16. C: publisher off-chain profile (site URL, audience blurb, category tags) — model + Alembic + SIWE-guarded PUT + Discover category filter; web form; pytest + vitest. **Risk: medium** (migration, auth).
- ○ 17+18. C: guide `docs/guide/publisher/embed-code.md` + SUMMARY; ROADMAP 6.3 `[x]` → ship. **Risk: low.**

### Slice D — `feat/analytics`
- ✓ 19+20. D: analytics schemas/service/router + `0003` indexes (`IF NOT EXISTS`), ORM `__table_args__` indexes; day bucket `col - col % 86400`; serve match on (slot, calendar_version, period); `by_slot` window-limited; `SlotNotFoundError`/`InvalidWindowError`. FIX r1 → PASS r2; 72 api tests. Committed on `feat/analytics` (`/home/claude/OpenAd-d`). Ship after 21+22.
- ○ 21+22. D (same branch, after slice B merges; `git merge origin/main` first): `PerformancePanel` (stat tiles + inline-SVG sparkline) on Supply and Campaigns; demo handler routes; tests; ROADMAP 6.4 `[x]` → ship. **Risk: low–medium.**

### Slice E — `feat/bash-stack-scripts`
- ✓ 23+24. E: bash twins + `lib.sh` + `stack-docker.sh` + `check-sh.sh` (CI), ADR-0007 amendment, ROADMAP 6.5. Review FIX r1 → PASS r2; CI shellcheck SC1091 fixed (`# shellcheck source=` + `shellcheck -x`, `811bc8e`). PR #5 — **merge pending CI** (orchestrator). Worktree `/home/claude/OpenAd-e` can be removed after merge.

### Slice H — `fix/alembic-fresh-db` (PARALLEL; blocks F and D's ship)
- ✓ 34. H: froze `0001_baseline` to an explicit schema (models @ `95163d9`); `test_migrations.py` covers fresh upgrade, `compare_metadata` parity and round trip, plus Postgres via `OPENAD_TEST_PG_URL`; CONVENTIONS rule added. Opus; PASS r1 (old-path and new-path DDL identical on SQLite and PG16). PR #6 merged `e8a34b8`. Nits (not scheduled): parity doesn't compare server defaults; 0002 isn't ruff-formatted (alembic/ is outside the lint scope).

### Slice F — `feat/gcp-deploy`
- ✓ 25+26. F: ADR-0017 + `docs/deploy-gcp.md` + `MediaStore` (local/GCS, ref validation, cached client) + `openad/health.py` (stdlib liveness listener started only when `PORT` is set; indexer and settler never listened on `$PORT`) + objectUser for the indexer + a service account for the migrate job + WIF attribute-condition. FIX r1 → PASS r2; 80 passed, 4 skipped. `48f84f4`.
- ✓ 27+28. F: api CMD without migrations + compose `migrate`; `web/Dockerfile` + nginx template (5 security headers, CSP per variant, `/healthz`, SPA fallback); `infra/gcp/` (cloudbuild with `_TAG`, services, migrate job); `scripts/deploy-gcp.sh` (prod and CI guards); `deploy.yml` (WIF, push-only same-repo gate, staging only); CI `docker` job. FIX r1 → PASS r2 (real docker build and run of the web image). `279070a`.
- [>] 29. F ship (orchestrator, running): PR, then CI green including the new `docker` job, then merge. The real `gcloud` deploy stays user-run per `docs/deploy-gcp.md`. After merging, ROADMAP 6.6 needs a tick or a note ("artifacts done; live deploy pending user GCP setup"). If B merges first, merge main in before merging.

### Slice G — `docs/launch-polish`
- ○ 30+31. G: README rewrite (value prop, demo link, quickstart bash+PowerShell, docs map) + `docs/business/{demo-script,launch-checklist,competitive}.md` (competitive = old step 2/31b: approx. public list-rate ranges, no fabricated sources). **Risk: low.**
- ○ 32+33. G: ROADMAP 6.x ticked, JIT_INDEX, guide SUMMARY, `docs/qa/scorecard.md` round-4 note → ship; archive plan to `jit_history/2026-09-24-market-fit-launch.md`. **Risk: low.**

## 5. Active step — full spec

### Step 12+13 — `build:demo` for any static host, CI wiring, ship slice B (`feat/web-demo-mode` @ `71e0869`)

**Coder model:** Sonnet. **Risk:** medium.
- The orchestrator will publish `web/dist-demo` as a **multi-file static site on a host with no
  SPA fallback, served from an unknown sub-path** (a claude.ai Artifact), and later as the
  `web-demo` nginx image.
- Three things break there today:
  1. `createBrowserRouter` deep links 404 without a fallback.
  2. Vite's default base `/` makes asset URLs absolute.
  3. Fixture media URIs are absolute (`/demo/creatives/*.svg` in `fixtures.ts` L364–416). They
     break both the React `<img>`s and the `<open-ad>` shadow-DOM image under a sub-path.
- The in-process serve responder (`isServeRoute`) must keep matching when the page lives under a
  sub-path.

**Read first:**
- `web/vite.config.ts`, `web/src/app/{routes.tsx,paths.ts,Layout.tsx}`, `web/src/main.tsx`.
- `web/src/demo/{fixtures,demoApi,demoServe,networkGuard,install}.ts`.
- `web/src/features/marketing/EmbedDemoPage.tsx`.
- `e2e/demo/{demo.config.ts,flows.spec.ts}`.
- `web/package.json` and the root `package.json`, `.github/workflows/ci.yml`.
- `docs/adr/0016-web-demo-mode.md`.

**Files**
1. Formatting first: `npx prettier --write web/src/demo e2e/demo web/src/features/marketing`.
   Commit this as its own formatting-only commit, so review diffs stay clean.
2. Router mode:
   - `web/src/app/routes.tsx` picks `createHashRouter` when `import.meta.env.VITE_ROUTER === 'hash'`,
     else `createBrowserRouter`. It stays a single route table.
   - Add `VITE_ROUTER?` to `vite-env.d.ts`, and a commented line to `.env.example`.
   - Audit every raw `href`, `window.location` and string navigation in `web/src` (Layout
     search → `navigate(...)`, `withDevWalletParam`, EmbedDemoPage). They must work under hash
     routing. Use router APIs (`Link`, `navigate`, `useHref`), never hard-coded `/path` anchors.
3. Base path:
   - `web/vite.config.ts` sets `base: process.env.VITE_BASE ?? '/'`.
   - `build:demo` uses `./`. The normal build is unchanged.
   - Media under a relative base: fixture `uri`s become **base-relative** (`demo/creatives/x.svg`),
     resolved at read time with `new URL(uri, document.baseURI).href` in one helper,
     `demo/assetUrl.ts`, used by `demoApi` and `demoServe`. That produces absolute URLs for
     `<img>`s and the embed shadow DOM, which has its own base.
   - Update the fixture test (it currently asserts a `/demo/` prefix) to assert that resolved
     URLs are same-origin and end in `.svg`.
   - `isServeRoute`: match on `pathname.endsWith('/v1/serve/<id>')` for same-origin URLs, so the
     sub-path works, while keeping cross-origin and other `/v1` paths denied. Add tests for
     sub-path and denied cases.
   - `EmbedDemoPage`: set `api` to `new URL('.', document.baseURI)` without the trailing slash,
     so the embed requests `<sub-path>/v1/serve/<id>`, which the responder answers. The snippet
     shown to users keeps the real `API_URL` placeholder wording from the 10+11 fix.
4. Demo-only public dir: move `web/public/demo/**` → `web/public-demo/demo/**`. `vite.config.ts`
   sets `publicDir: DEMO ? 'public-demo' : 'public'`, keyed on `process.env.VITE_DEMO_MODE`, so
   the normal dist ships no demo SVGs (closes the Backlog item). If `web/public` then doesn't
   exist, that's fine.
5. Scripts:
   - `web/package.json`: `"build:demo": "node scripts/build-demo.mjs"`. This is a tiny Node
     wrapper, with no `cross-env` dependency. It sets `VITE_DEMO_MODE=1`, `VITE_ROUTER=hash` and
     `VITE_BASE=./` in the child env, runs the same sync steps as `build` plus `tsc --noEmit`,
     then `vite build --outDir dist-demo`. `vite.config.ts` reads `process.env.VITE_DEMO_MODE`
     and `VITE_BASE`.
   - Root: `"build:demo": "npm run build:demo -w web"`.
   - `web/.gitignore` / root `.gitignore`: `web/dist-demo`.
   - Slice F's `web/Dockerfile` (not on this branch) keeps working. A plain
     `VITE_DEMO_MODE=1 vite build` still outputs `dist` with the browser router, which is fine
     behind nginx fallback. Note this in ADR-0016.
6. `web/scripts/check-demo-bundle.mjs`, run by CI and callable locally:
   - (a) `dist-demo`: no `localhost:8000` or `127.0.0.1:8545`, except occurrences inside
     whitelisted viem chain-definition literals. The whitelist is by exact surrounding substring
     and documented.
   - (b) `dist-demo`: all `<script src>`/`<link href>` in `index.html` are relative.
   - (c) `dist`: none of the demo markers (`openad-demo`, `DEMO_ABIS`, `PersonaSwitcher`,
     `demoServe`, `tour/steps`) and no `demo/creatives`.
   - Exits non-zero with a clear report.
7. Playwright demo suite in **static sub-path mode**:
   - `e2e/demo/demo.config.ts` `webServer` runs `npm run build:demo` and then serves `web/dist-demo`
     under `/openad-demo/` with **no SPA fallback**. Use a ~30-line Node static server
     `e2e/demo/static-server.mjs` (correct MIME for .js, .css, .svg and .woff2; 404 for unknown
     paths).
   - `baseURL` is `http://localhost:4173/openad-demo/`.
   - A `demoPath(p)` helper maps routes to `#/p`. Update all `goto` and URL assertions.
   - Keep the no-off-origin guard, and add one test: a deep link `…/openad-demo/#/embed-demo`
     loads cold, and the embed image resolves under `/openad-demo/demo/creatives/`.
8. CI (`.github/workflows/ci.yml`):
   - The contracts job, after `mox compile`, runs setup-node, then
     `node web/scripts/gen-demo-abis.mjs --check`.
   - The web job runs `npm run build:demo`, `node web/scripts/check-demo-bundle.mjs`, and
     `npx prettier --check web/src/demo e2e/demo web/src/features/marketing`.
   - The e2e job runs `npm run test:demo -w e2e`, after the existing YAML suite, with browsers
     already installed there.
9. Docs:
   - ADR-0016 "Hosting" amendment: static build (`build:demo`, hash router, relative base, no
     fallback needed); the nginx image variant; the CSP `connect-src 'self'` from slice F.
   - `docs/ARCHITECTURE.md` §7 demo row: `npm run build:demo` → `web/dist-demo`.
   - ROADMAP **6.2 `[x]`** `_Done 2026-09-25._`.
   - Don't touch the JIT files; the planner updates them.
10. Ship. The orchestrator commits (formatting commit + feature commit), pushes
    `feat/web-demo-mode`, opens the PR ("feat(web): zero-backend demo mode (ADR-0016)"), waits for
    all CI jobs including the new ones, and squash-merges or merge-commits. Then:
    - (a) publish `web/dist-demo` as the hosted demo Artifact, from main after merge;
    - (b) `git merge origin/main` into `feat/analytics` (D) and `feat/gcp-deploy` (F).

**Verify**
```bash
cd /home/claude/OpenAd
npm run typecheck && npm run lint && npm run test && npm run build && npm run build:demo
node web/scripts/check-demo-bundle.mjs
ls web/dist | grep -q demo && echo "FAIL demo files in normal dist" || echo ok
grep -o 'src="[^"]*"' web/dist-demo/index.html          # all ./assets/...
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run test:demo -w e2e
npx prettier --check web/src/demo e2e/demo web/src/features/marketing
(cd contracts && uv run mox compile) && node web/scripts/gen-demo-abis.mjs --check
# optional (docker daemon now available): docker compose up -d && npm run test:e2e   # LEASE/CPC YAML suite still green
git status --short
```

**Done when:**
- `dist-demo` works from any sub-path with no server fallback, proven by Playwright including a
  cold deep link.
- The normal `dist` contains no demo code or assets.
- The check script and CI wiring are in place, and CI is green on the PR.
- ROADMAP 6.2 is ticked and ADR-0016 is amended.
- The PR is merged.


## 6. Identity fence (unchanged)

Non-custodial api/web; slots leased not sold; one-tx LEASE buy; Marketplace empty after tx;
CampaignVault holds only open `remaining`; serve never reads chain / never proxies advertiser
media; integer USDC; Unix seconds; spec ↔ interface ↔ code in sync; demo mode never touches a
chain or API (D3).

## 7. Log

- 2026-09-24 10:40 — Plan created (CREATE). Active: step 1.
- 2026-09-24 11:35 — Step 1 DONE (review FIX r1 → PASS r2; treasury is owner-settable, not immutable — §1 fixed; CPC pays at settle batch). Step 2 moved to G (31b). Active: step 3 ship A. Step 4 spec written; step 7 re-scoped to wagmi mock connector + in-memory EIP-1193.
- 2026-09-24 13:10 — Slice A shipped (PR #4 → `801440e`). Step 4 DONE (FIX r1 → PASS r2, `aafaad7`). Re-paced: adjacent steps merged (5+6, 8+9, 10+11, 12+13, 14+15, 17+18, 19+20, 21+22, 23+24, 25+26, 27+28, 30+31, 32+33); old step 31b folded into 30+31. Active: 5+6.
- 2026-09-24 14:20 — Step 5+6 DONE (FIX r1 → PASS r2, `5204b86`; `auctionOpenAt` clamps at 0, only SlotCard uses it). Found: static/CI builds have empty `generated/deployments` → step 7 adds committed `demo/abis.generated.ts` + synthetic 31337 demo deployment; ABI drift check wired in 12+13. Active: 7.
- 2026-09-24 14:45 — REVISE (parallel track): step 23+24 (slice E) runs alongside 7 in worktree `/home/claude/OpenAd-e` on `feat/bash-stack-scripts` off `801440e`; JIT files stay on slice B's branch. Spec written; verification is static (`bash -n`, `--dry-run`, `check:sh`) since there's no docker daemon.
- 2026-09-24 16:05 — Step 7 DONE (Opus coder, PASS r1, `09d3209`). Slice E PASS; PR #5 open, shellcheck SC1091 fix `811bc8e`, merge pending CI. L3s folded: Google Fonts → 8+9 (demo-only strip); reload-resets-demo → ADR note in 8+9; viem foundry literal whitelist → 12+13. Persona switcher pulled forward from 10+11 into 8+9 (flows need both personas). Active: 8+9.
- 2026-09-24 16:30 — REVISE (parallel track 2): 19+20 (slice D API) in worktree `/home/claude/OpenAd-d` on `feat/analytics`; 21+22 on the same branch after slice B merges. Web OpenAPI types are generated at build time and git-ignored, so there's no conflict. Spec written.
- 2026-09-24 17:40 — Step 8+9 DONE (Opus, PASS r1, `7e5c328`). It also fixed a bug in the shared `Wizard.tsx` that affected real users. Slice D 19+20 is in FIX r1. Active: 10+11 (spec written). Follow-ups: the `useSiwe` race is in the Backlog; running prettier on `web/src/demo` is folded into 12+13; the missing SVG file type is not a bug, because the product is raster-only.

## 8. Backlog (found during the run; not scheduled)

- Web image ships ~166 `.map` sourcemaps; set `build.sourcemap: false` (or upload them privately) for prod images. Candidate for slice G or a follow-up.
- `20260914_0002_cpc.py` is not ruff-formatted (`alembic/` is outside the lint scope). Consider widening the ruff scope.
- Parity test doesn't compare server defaults (`compare_server_default`).

- `features/auth/useSiwe.ts`: an in-flight SIWE request can race an account switch (real app and demo). Fix with an abort keyed to the account. Candidate for slice C or a small fix PR.
- `web/public/demo/creatives/*.svg` ship in the normal `dist`. Harmless; could move to a demo-only public directory in 12+13.
- 2026-09-24 18:00 — 19+20 DONE (PASS r2, on `feat/analytics`). Pre-existing bug on main found by the reviewer: `alembic upgrade head` fails on an empty database because 0001 uses `create_all` on the live models. New slice H `fix/alembic-fresh-db` (step 34, parallel, worktree `/home/claude/OpenAd-h`) blocks D's ship and F. Hazard recorded in JIT_INDEX.
- 2026-09-24 18:50 — Slice H DONE (PR #6 → `e8a34b8`, CI green, worktree removed). `feat/analytics` merged main (`57e2aea`): 75 passed, 4 skipped. REVISE: 25+26 (slice F) is parallel in `/home/claude/OpenAd-f`; spec written. Removed the finished 19+20/34 specs from §5 (they're in git history). Active: 10+11 ✱, 25+26 [>].
- 2026-09-24 19:40 — 25+26 DONE (FIX r1 → PASS r2, `48f84f4`). Spec for 27+28 written; replaced the 25+26 spec in §5. Finding: `84532.json`/`8453.json` are not committed yet (no Sepolia deploy), so CI auto-deploys only the static demo; the stack deploy is gated on the deployments file. 10+11 still coding; no report yet.
- 2026-09-25 09:10 — 10+11 DONE (`71e0869`). 27+28 is in FIX r1 (.dockerignore, pip/python in bookworm-slim, nginx add_header inheritance, `_TAG`, deploy gate). New fact: dockerd can run in this container; recorded in JIT_INDEX. 12+13 spec written: `dist-demo` must run on a static host with no fallback under a sub-path, so the orchestrator can publish it as a hosted demo Artifact today. Active: 12+13 ✱, 27+28 [>].
- 2026-09-25 10:20 — 27+28 DONE (`279070a`, PASS r2). Step 29 is shipping (orchestrator). 12+13 is still coding. Backlog: sourcemaps in the web image, 0002 formatting, server-default parity.
