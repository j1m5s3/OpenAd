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
| D Analytics (API + UI) | `feat/analytics` | 6.4 | — (API), B for demo fixtures |
| E Cross-platform scripts + one-command stack | `feat/bash-stack-scripts` | 6.5 | — |
| F Production deploy (GCP) | `feat/gcp-deploy` | 6.6 | E |
| G Docs polish (README, demo script, guide) | `docs/launch-polish` | 6.7 | A–F |

## 4. Micro-steps (one line each; ✱ active, ○ pending, ✓ done)

### Slice A — `docs/market-fit-gtm`
- ✓ 1. A: `docs/business/{README,market-fit,gtm-marketing,pitch-deck}.md` + ROADMAP Phase 6 (6.1–6.7). Review FIX r1 (10) → PASS r2.
- → 2. A: moved to slice G as step 31b (competitive table already in pitch deck; standalone doc not needed to ship A).
- ✱ 3. A ship (orchestrator, no coder): commit `docs(business): market fit, GTM plan, pitch-deck source; ROADMAP Phase 6` incl. `.cursor/JIT_PLAN.md` + `JIT_INDEX.md` → push `docs/market-fit-gtm` → PR → merge (squash) after CI. Exclude `package-lock.json` drift.

### Slice B — `feat/web-demo-mode`
- ○ 4. B: ADR-0016 demo mode + `ARCHITECTURE.md` §7 env row + `.env.example` `VITE_DEMO_MODE`.
- ○ 5. B: `web/src/demo/fixtures.ts` — seeded slots/terms/periods/leases/creatives/campaigns/earnings typed against generated OpenAPI types; unit test shapes + fee math.
- ○ 6. B: `web/src/demo/demoApi.ts` — fetch-layer adapter so `lib/api.ts` resolves from fixtures when demo; test that no `fetch` is called.
- ○ 7. B: `web/src/demo/demoChain.ts` — in-memory EIP-1193 simulator behind wagmi `mock` connector + `custom` transport (eth_chainId/accounts/call/sendTransaction/getTransactionReceipt/signTypedData_v4); decodes calldata with deployment ABIs, mutates fixture store, returns fake hashes; feature code unchanged; tests.
- ○ 8. B: wire Discover/Slot/Buy into demo (buy updates fixture state, receipt shows split publisher/fee).
- ○ 9. B: wire Supply (mint, calendar, approve creative) + Campaigns (register creative, fund CPC) into demo.
- ○ 10. B: `DemoBanner` + guided tour overlay ("You are the publisher → now the advertiser") with persona switcher.
- ○ 11. B: showcase routes `/why` (value prop + earnings calculator: network take 30–50% vs 2.5%, inputs impressions/eCPM) and `/embed-demo` (live `<open-ad>` fed by demo serve JSON); calculator tests.
- ○ 12. B: `npm run build:demo` (root + web) producing static `web/dist-demo` with SPA fallback; test asserting demo bundle contains no RPC URL / API base; CI builds it.
- ○ 13. B ship: full web checks + build + build:demo → PR → merge.

### Slice C — `feat/publisher-growth`
- ○ 14. C: `web/src/features/publisher/components/EmbedCodePanel.tsx` — "Get code" (script tag + `<open-ad slot=…>` + size), copy button, HTML/WordPress/Ghost/Substack-limits instructions; tests.
- ○ 15. C: public shareable slot page polish (`/slot/:id` OG meta, "Advertise here" CTA, current price, audience blurb field shown if set off-chain) — reuse SlotPage; tests.
- ○ 16. C: publisher off-chain profile (site URL, audience description, category tags) — API model + Alembic + SIWE-guarded PUT, Discover filter by category; tests (no chain writes).
- ○ 17. C: guide pages `docs/guide/publisher/embed-code.md` + SUMMARY entry; demo fixtures updated.
- ○ 18. C ship.

### Slice D — `feat/analytics`
- ○ 19. D: spec in `ARCHITECTURE.md` (analytics read model, D4 formulas) + schemas `api/src/openad/schemas/analytics.py`.
- ○ 20. D: `services/analytics.py` + `GET /v1/analytics/slots/{id}` and `/v1/analytics/advertisers/{addr}` (impressions, clicks, CTR, spend/earnings, eCPM, daily buckets); pytest.
- ○ 21. D: web `features/*/components/PerformancePanel.tsx` (stat tiles + sparkline, no chart lib >20 KB) on Supply and Campaigns; demo fixtures; tests.
- ○ 22. D ship.

### Slice E — `feat/bash-stack-scripts`
- ○ 23. E: `scripts/setup.sh`, `dev-up.sh`, `dev-down.sh` (parity with .ps1, shellcheck-clean) + npm `stack:*:sh` + `stack:docker`; ADR-0007 amendment.
- ○ 24. E ship.

### Slice F — `feat/gcp-deploy`
- ○ 25. F: ADR-0017 GCP topology + `docs/deploy-gcp.md` runbook (projects, APIs, Artifact Registry, Cloud SQL, Secret Manager, GCS, Cloud Run, domain, rollback).
- ○ 26. F: media cache storage interface + GCS backend (`OPENAD_MEDIA_BACKEND=local|gcs`), local default; pytest with fake client.
- ○ 27. F: `web/Dockerfile` (nginx static, SPA fallback, demo variant build-arg) + `infra/gcp/cloudbuild.yaml` + `infra/gcp/*.service.yaml` (api/indexer/settler/web) + `scripts/deploy-gcp.sh`.
- ○ 28. F: CI `deploy` job gated on `GCP_WORKLOAD_IDENTITY_PROVIDER` secret presence; demo site deploy only; no mainnet broadcast; api health check post-deploy.
- ○ 29. F ship (orchestrator: actual `gcloud` deploy is user-run — record in outcome).

### Slice G — `docs/launch-polish`
- ○ 30. G: README rewrite (value prop, 60-second demo link, screenshots placeholders, quickstart bash+PowerShell, docs map).
- ○ 31b. G: `docs/business/competitive.md` (moved from step 2) — take-rate/payout/tracking ranges vs major networks, "approx., public list rates", no fabricated sources.
- ○ 31. G: `docs/business/demo-script.md` (5-min and 15-min talk tracks over demo mode: publisher earns, advertiser buys, embed renders, CPC) + `docs/business/launch-checklist.md`.
- ○ 32. G: final pass — ROADMAP 6.x ticked, JIT_INDEX, guide SUMMARY, `docs/qa/scorecard.md` round 4 note for demo mode.
- ○ 33. G ship; archive plan to `jit_history/2026-09-24-market-fit-launch.md`.

## 5. Active step — full spec

### Step 3 — Ship slice A (orchestrator-run, no coder)

`git add docs/business docs/ROADMAP.md .cursor/JIT_PLAN.md .cursor/JIT_INDEX.md` (not
`package-lock.json`) → Conventional Commit with attribution trailer → push → PR → wait CI →
squash-merge → `git switch main && git pull`. Done when: merged on `main`; ROADMAP 6.1 `[x]`.

### Step 4 (next; spec ready) — ADR-0016 demo mode + scaffolding (slice B, `feat/web-demo-mode`)

**Coder model:** Sonnet. **Risk:** medium — the danger is demo code leaking a real network
call or shipping into normal builds. Guard both with tests.

**Branch:** `git switch -c feat/web-demo-mode` from updated `main`.

**Decision recorded in the ADR (so steps 5–12 follow it):**
- Flag: `VITE_DEMO_MODE=1` (string compare `=== '1'`), read once in `web/src/demo/flag.ts`
  (`export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === '1'`).
- Boot: `main.tsx` does `if (DEMO_MODE) { const { installDemo } = await import('./demo/install'); installDemo(); }`
  before importing `App` — mirrors the existing DEV `installDevWallet` pattern, so Rollup drops
  the chunk when the flag is off (static `false`).
- Reads: `lib/api.ts` `request()` gets a pluggable resolver (`setRequestHandler(fn)`), default is
  the current `fetch` path; demo installs a fixture handler (step 6). Feature `api.ts` modules
  untouched.
- Writes: wagmi `mock` connector + `custom` transport backed by an in-memory EIP-1193 simulator
  (step 7); `lib/wagmi.ts` exports a config factory choosing demo vs real. Feature write code
  untouched. No `http()` transport is constructed in demo.
- Network guard: in demo, `installDemo()` wraps `window.fetch` to throw `DemoNetworkError` for any
  URL that is not same-origin static assets — a leak fails loudly, not silently.
- UX: persistent `DemoBanner` ("Demo — simulated data, no real funds or chain") + persona switcher
  slot (filled in step 10).
- Rejected: MSW (runtime dep + service worker for a static site), separate demo app package
  (duplicates UI, drifts), hitting a public testnet (needs RPC + faucet; not zero-backend).

**Files**
1. `docs/adr/0016-web-demo-mode.md` — Status Accepted, context (market-fit blocker #1), decision
   (bullets above), invariants (never RPC, never API, never real signatures, banner always,
   tree-shaken), consequences, rejected alternatives.
2. `docs/ARCHITECTURE.md` §5 web: short "Demo mode (ADR-0016)" paragraph; §7 environments: add
   "Demo (static)" row.
3. `.env.example` — commented `# VITE_DEMO_MODE=1  # static demo build, no API/chain (ADR-0016)`
   near the other `VITE_*` lines.
4. `web/src/vite-env.d.ts` — `readonly VITE_DEMO_MODE?: string;`
5. `web/src/demo/flag.ts`, `web/src/demo/install.ts` (installs fetch guard + banner mount hook;
   request handler/connector hooks are TODO-free no-ops until steps 6–7 — export functions that
   later steps fill), `web/src/demo/networkGuard.ts`, `web/src/demo/DemoBanner.tsx`.
6. `web/src/lib/api.ts` — add `setRequestHandler`/default fetch handler; behaviour unchanged when
   not set.
7. `web/src/main.tsx` — demo branch before `App` import.
8. `web/src/app/Layout.tsx` — render `DemoBanner` when `DEMO_MODE` (lazy import).
9. Tests: `web/src/demo/networkGuard.test.ts` (blocks `http://localhost:8000/v1/...` and
   `http://127.0.0.1:8545`, allows same-origin `/assets/x.js`); `web/src/lib/api.test.ts` or
   extend existing (custom handler used, default path unchanged);
   `web/src/demo/DemoBanner.test.tsx` (text present, role=status).
10. `docs/ROADMAP.md` — 6.2 stays `[ ]`, append "_In progress: ADR-0016 accepted._".

**Verify**
```bash
cd /home/claude/OpenAd
npm run typecheck && npm run lint && npm run test && npm run build
grep -rl "DemoBanner\|networkGuard" web/dist/assets && echo "LEAK: demo in normal build" || echo ok
VITE_DEMO_MODE=1 npm run build -w web && grep -rl "Demo — simulated" web/dist/assets >/dev/null && echo demo-ok
git status --short   # only files listed above
```
(Restore normal `web/dist` after the demo build check; don't commit `dist`.)

**Done when:** ADR-0016 Accepted and linked from ARCHITECTURE; checks green; normal build has
no demo chunk; demo build contains banner; fetch guard test proves API/RPC URLs throw; no
feature-folder files changed.

## 6. Identity fence (unchanged)

Non-custodial api/web; slots leased not sold; one-tx LEASE buy; Marketplace empty after tx;
CampaignVault holds only open `remaining`; serve never reads chain / never proxies advertiser
media; integer USDC; Unix seconds; spec ↔ interface ↔ code in sync; demo mode never touches a
chain or API (D3).

## 7. Log

- 2026-09-24 10:40 — Plan created (CREATE). Active: step 1.
- 2026-09-24 11:35 — Step 1 DONE (review FIX r1 → PASS r2; treasury is owner-settable, not immutable — §1 fixed; CPC pays at settle batch). Step 2 moved to G (31b). Active: step 3 ship A. Step 4 spec written; step 7 re-scoped to wagmi mock connector + in-memory EIP-1193.
