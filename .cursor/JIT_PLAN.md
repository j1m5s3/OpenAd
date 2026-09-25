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
- ✓ 12+13. B: prettier-only commit `085cf2c`; feature `ef04b17`. Hash router, relative base, base-relative media, `public-demo`, `build-demo.mjs` (process.execPath, no npx), `check-demo-bundle.mjs` (context-anchored whitelist, negative test), Playwright in static sub-path mode (8/8), CI wiring, ADR-0016 hosting, ROADMAP 6.2 `[x]`. FIX r1 → PASS r2. Main merged `f6f1b46`. **PR #8 merged `591e576`** (CI 5/5). Demo published: https://claude.ai/artifact/AzkEcWfmUT23GCo2qkWxE7 (deck `DEMO_URL` filled).

### Slice C — `feat/publisher-growth`
- [>] 14+15. C (PARALLEL with 21+22; primary tree `/home/claude/OpenAd`, `feat/publisher-growth` @ `591e576`): **serve CORS fix (probable prod blocker)**, versioned embed script shipped by the web build, `EmbedCodePanel` (platform tabs + badge), shareable slot page, static OG defaults, guide page, `e2e/demo/growth.spec.ts`. Overlaps D only in `SupplyPage.tsx`: **merge D first**. In FIX r1: L1 nginx `/embed/` needs `Access-Control-Allow-Origin: *` (cross-origin `type=module` script fetch), plus tighter serve CORS path matching. **Risk: medium.**
- ○ 16. C (next after 14+15 PASS and #9 merged into C): **slot listings**: `slot_listings` off-chain table, taxonomy enum, owner-only `PUT/DELETE /v1/slots/{id}/listing`, additive `SlotOut.listing`, `GET /v1/slots?category=`, migration 0004 after D's 0003; `ListingEditor`, Discover category filter, `SlotCard`/`SlotPage` display, demo support. **Risk: medium.** **(full spec below, pre-written)**
- ○ 17+18. C: guide `docs/guide/publisher/embed-code.md` + SUMMARY; ROADMAP 6.3 `[x]` → ship. **Risk: low.**

### Slice D — `feat/analytics`
- ✓ 19+20. D: analytics schemas/service/router + `0003` indexes (`IF NOT EXISTS`), ORM `__table_args__` indexes; day bucket `col - col % 86400`; serve match on (slot, calendar_version, period); `by_slot` window-limited; `SlotNotFoundError`/`InvalidWindowError`. FIX r1 → PASS r2; 72 api tests. Committed on `feat/analytics` (`/home/claude/OpenAd-d`). Ship after 21+22.
- ✓ 21+22. D: analytics client, `lib/analytics.ts`, `Sparkline`/`StatTile`, `SlotPerformance`, `AdvertiserPerformance`, demo analytics. LEASE CTR shows "—" (not tracked for leases: direct click_url, no click_events); `bySlot` = lease + settled only. FIX r1 → PASS r2. Web 169, api 95/4 skipped, test:demo 9/9. **PR #9 open, CI running.**

### Slice E — `feat/bash-stack-scripts`
- ✓ 23+24. E: bash twins + `lib.sh` + `stack-docker.sh` + `check-sh.sh` (CI), ADR-0007 amendment, ROADMAP 6.5. Review FIX r1 → PASS r2; CI shellcheck SC1091 fixed (`# shellcheck source=` + `shellcheck -x`, `811bc8e`). PR #5 — **merge pending CI** (orchestrator). Worktree `/home/claude/OpenAd-e` can be removed after merge.

### Slice H — `fix/alembic-fresh-db` (PARALLEL; blocks F and D's ship)
- ✓ 34. H: froze `0001_baseline` to an explicit schema (models @ `95163d9`); `test_migrations.py` covers fresh upgrade, `compare_metadata` parity and round trip, plus Postgres via `OPENAD_TEST_PG_URL`; CONVENTIONS rule added. Opus; PASS r1 (old-path and new-path DDL identical on SQLite and PG16). PR #6 merged `e8a34b8`. Nits (not scheduled): parity doesn't compare server defaults; 0002 isn't ruff-formatted (alembic/ is outside the lint scope).

### Slice F — `feat/gcp-deploy`
- ✓ 25+26. F: ADR-0017 + `docs/deploy-gcp.md` + `MediaStore` (local/GCS, ref validation, cached client) + `openad/health.py` (stdlib liveness listener started only when `PORT` is set; indexer and settler never listened on `$PORT`) + objectUser for the indexer + a service account for the migrate job + WIF attribute-condition. FIX r1 → PASS r2; 80 passed, 4 skipped. `48f84f4`.
- ✓ 27+28. F: api CMD without migrations + compose `migrate`; `web/Dockerfile` + nginx template (5 security headers, CSP per variant, `/healthz`, SPA fallback); `infra/gcp/` (cloudbuild with `_TAG`, services, migrate job); `scripts/deploy-gcp.sh` (prod and CI guards); `deploy.yml` (WIF, push-only same-repo gate, staging only); CI `docker` job. FIX r1 → PASS r2 (real docker build and run of the web image). `279070a`.
- ✓ 29. F ship: PR #7 merged `866d7fe`, all 5 CI jobs green (first real docker build of both images). Worktree removed. Live GCP deploy is user-run.

### Slice G — `docs/launch-polish`
- [>] 30+31. G (PARALLEL with C; new worktree `/home/claude/OpenAd-g`, `docs/launch-polish` off `origin/main` after #9): README rewrite (demo and deck links, private note), `docs/business/{competitive,demo-script,launch-checklist}.md`, screenshots via `e2e/demo/capture-screenshots.mjs`. Must not touch ROADMAP, ARCHITECTURE, guide or code. **Risk: low–medium.** **(full spec below)**
- ○ 32+33. G (after C merges; merge main in): README "Coming next" → available features from C; ROADMAP 6.x ticked; ARCHITECTURE and guide lines deferred from 30+31; including **6.6 note: "deploy artifacts done (PR #7); live deploy pending the user's GCP project, WIF secrets and a committed `84532.json`"**; web prod image `build.sourcemap: false` (Backlog); JIT_INDEX, guide SUMMARY, `docs/qa/scorecard.md` round-4 note → ship; archive plan to `jit_history/2026-09-24-market-fit-launch.md`. **Risk: low.**

## 5. Active step — full spec

### Step 14+15 — Publisher growth: embed code that works anywhere, shareable slot page, "Advertise here" badge (slice C, PARALLEL with D)

**Where:** the primary tree `/home/claude/OpenAd`, branch `feat/publisher-growth` off `origin/main`
@ `591e576`. The uncommitted JIT file edits live here and are committed with slice C; the coder
must not stage `.cursor/`.
**Coder model:** Sonnet. **Risk:** medium, because of a **probable production blocker** found
while planning:
- The API's `CORSMiddleware` allows only `settings.cors_origins` (the web app origins), with
  credentials.
- `routers/serve.py` sets no CORS header of its own.
- So `<open-ad>` on a publisher's own domain gets a browser CORS failure on
  `GET /v1/serve/{id}` and falls back to house.
- Tests don't catch it: TestClient ignores CORS, and e2e runs same-origin or on localhost
  allowlisted origins.

A second gap: publishers have no real script URL to paste. The Supply snippet omits a
`<script>`, and 10+11 left a placeholder comment.

**Read first:**
- `api/src/openad/main.py` (CORS middleware), `api/src/openad/routers/serve.py`,
  `api/src/openad/serve/origin.py`, `api/src/openad/config.py` (`cors_origins`), `api/tests/test_serve.py`.
- `embed/package.json` and `embed/vite.config.*` (outputs `dist/open-ad.js` ES module plus
  `open-ad.iife.js`), `embed/src/open-ad.ts` (attributes: `slot-id`, `api`, `width`, `height`,
  `house-src`, `house-href`).
- `web/src/features/publisher/SupplyPage.tsx` L245–253 (the inline snippet `<section>`).
- `web/src/features/marketplace/SlotPage.tsx`, `web/src/features/marketing/EmbedDemoPage.tsx`.
- `web/package.json` `build`, `web/scripts/build-demo.mjs`, `web/vite.config.ts`, `web/index.html`.
- `docs/guide/publisher/house-ads-and-embed.md`, `docs/business/gtm-marketing.md` (the badge
  tactic).
- ADR-0014 on click redirects; the serve invariants in `AGENTS.md`.

**A. Serve CORS (api)**
1. Public serve endpoints (`GET /v1/serve/{slot_id}` and `/v1/serve/{slot_id}/media`) answer any
   origin: `Access-Control-Allow-Origin: *`, **no credentials**, `Vary: Origin`, and an `OPTIONS`
   preflight that works (the embed sends no custom headers, so it's usually a simple request;
   still handle preflight).
   - Every other route keeps the credentialed allowlist unchanged.
   - Implement it either as a small path-scoped middleware placed **outside** the existing
     `CORSMiddleware`, or by excluding `/v1/serve` from it. Pick whichever is simpler and
     provably correct; note that Starlette's `CORSMiddleware` would otherwise echo credentialed
     headers only for allowlisted origins.
   - Origin enforcement (`serve_enforce_origin`) is unrelated and unchanged: CORS says who may
     read the response; origin checks decide paid vs house.
2. Tests in `api/tests/test_serve_cors.py`:
   - An arbitrary `Origin: https://publisher.example` on `/v1/serve/1` gets `*` and no
     `Access-Control-Allow-Credentials`.
   - Preflight gets 200 with the allowed methods.
   - `/v1/publishers/...` from a non-allowlisted origin gets no ACAO.
   - An allowlisted origin on non-serve routes keeps credentials.
3. `docs/ARCHITECTURE.md` §3.4: add one paragraph on serve CORS. Add a line to
   `docs/threat-model.md` covering why `*` is safe here: public data, no cookies, no
   credentials.

**B. A real embed script URL (web build)**
4. The web build ships the embed. `web/package.json` gets `"prebuild": "npm run build -w embed"`,
   or `build`/`build-demo.mjs` call it first; the embed build is fast and size-gated. A tiny
   Vite plugin, or a post-build copy in `vite.config.ts` `closeBundle`, copies
   `embed/dist/open-ad.js` → `dist/embed/open-ad.v1.js` (and `dist-demo/embed/…`).
   - Serve it with nginx caching. `/embed/*` gets `Cache-Control: public, max-age=86400`; if
     editing `web/nginx/default.conf.template` is needed, keep it tiny.
   - The snippet URL is `VITE_EMBED_SCRIPT_URL ?? new URL('embed/open-ad.v1.js', document.baseURI)`.
     Add it to `vite-env.d.ts` and `.env.example`.
   - Record this in ADR-0017 as a one-line amendment ("web origin hosts the versioned embed
     script"). A CDN or npm publish can come later.
5. `web/src/lib/embedSnippet.ts` (pure, tested): `buildSnippet({ slotId, apiUrl, scriptUrl,
   width, height, houseSrc?, houseHref? })` returns
   `<script type="module" src="…"></script>\n<open-ad slot-id="…" api="…" width="…" height="…"></open-ad>`,
   with attribute values HTML-escaped. Presets: 300×250, 728×90, 320×50, and the slot's own size
   when known.

**C. Publisher UI**
6. `web/src/features/publisher/components/EmbedCodePanel.tsx`:
   - A slot select from the publisher's slots and a size preset.
   - The live snippet (from `buildSnippet`) with a Copy button (clipboard API in try/catch, with
     a fallback that selects the text).
   - Tabs with short instructions: "Any HTML site", "WordPress (Custom HTML block)", "Ghost (HTML
     card)", "Notion / Substack", the last one plainly stating that custom scripts aren't
     supported there, and suggesting a linked banner or the badge.
   - A "Preview" link to `/embed-demo?slot=<id>`.
   - Replace **only** the existing `<section>` in `SupplyPage.tsx` (L245–253) with
     `<EmbedCodePanel … />`. This is the one unavoidable overlap with slice D, which mounts
     `SlotPerformance` in a different part of the same file.
7. `EmbedDemoPage.tsx` reuses `buildSnippet`, replacing its placeholder comment with the real
   script URL. It also accepts `?slot=` to preselect.

**D. Shareable slot page + badge**
8. `SlotPage.tsx` gets a "Share" row with:
   - Copy link (the absolute slot URL, which works with hash routing via `useHref` +
     `document.baseURI`).
   - A prefilled X/Farcaster intent link (plain `https://twitter.com/intent/tweet?text=…&url=…`
     and `https://warpcast.com/~/compose?text=…`, opened with `rel="noopener"`, no SDKs).
   - An "Advertise here" CTA explaining the current price and next period (reuse existing data).
   - Set `document.title` to `"<domain> — ad slot on OpenAd"`.
9. The "Advertise here via OpenAd" badge:
   - `web/public/badge/advertise-here.svg`: small, original, and in the **normal** `public/`
     (it's a product asset). Confirm that `public-demo` from 12+13 still gets it, or copy it
     there.
   - A "Badge" tab in `EmbedCodePanel` with the snippet
     `<a href="<slot URL>"><img src="<web origin>/badge/advertise-here.svg" alt="Advertise here via OpenAd" width=… height=…></a>`.
     It works on Substack, GitHub READMEs and anywhere else scripts can't run.
10. `web/index.html`: static default `og:title`, `og:description`, `og:type`, `twitter:card=summary`.
    Per-slot OG previews need server rendering: record that in the Backlog (JIT) and say it in the
    commit, not in product copy.

**E. Docs + tests**
11. `docs/guide/publisher/embed-code.md` covers where to get the code, each platform, the badge,
    troubleshooting (house ad shows → domain verification or no lease; nothing shows → the
    script URL or CSP on the host site). Link it from `docs/guide/SUMMARY.md` and the publisher
    README. Update `house-ads-and-embed.md` to point to it.
12. Vitest:
    - `embedSnippet.test.ts`: escaping, presets, house attributes optional.
    - `EmbedCodePanel.test.tsx`: slot and size change the snippet, copy is called, the
      Substack tab shows the no-scripts note.
    - `SlotPage` share row: the link is absolute and hash-safe.
13. Playwright in a **new** file `e2e/demo/growth.spec.ts`, not `flows.spec.ts`, which D is
    extending:
    - As the publisher, open Supply, the embed code panel and copy, then assert that the snippet
      contains `embed/open-ad.v1.js` and `slot-id`.
    - Fetch that script URL relative to the page; it returns 200 with a JS MIME type.
    - The badge SVG loads.
    - The slot page shows the Share row.
    - The off-origin guard still holds.
14. ROADMAP 6.3 progress note: "embed code, serve CORS, share page, badge done; publisher
    profile (16) next".

**Overlap with slice D (merge order):**
- `SupplyPage.tsx` is edited by both, in different hunks. **Merge D first**, then
  `git merge origin/main` into C.
- `docs/ROADMAP.md` and `docs/guide/SUMMARY.md` get appended lines on both sides; keep both.
- Everything else is disjoint: C does not touch `lib/api.ts`, the demo analytics files,
  `demoApi.ts`, `CampaignsPage.tsx` or `flows.spec.ts`.

**Verify**
```bash
cd /home/claude/OpenAd
(cd api && uv run ruff check && uv run ruff format --check && uv run mypy src && uv run pytest -q)
npm run typecheck && npm run lint && npm run test && npm run build && npm run build:demo
test -f web/dist/embed/open-ad.v1.js && test -f web/dist-demo/embed/open-ad.v1.js && echo embed-shipped
node web/scripts/check-demo-bundle.mjs
npx prettier --check web/src/demo e2e/demo web/src/features/marketing web/src/app/routes.tsx
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run test:demo -w e2e
# optional real cross-origin proof (docker available): run api on :8000, serve a page from another port with the snippet, assert the embed renders a non-house creative or at least a 200 serve fetch with ACAO:*
git status --short   # .cursor/ must not be staged by the coder
```

**Done when:**
- Serve is readable from any origin without credentials, and the other routes are unchanged.
  Tests prove both.
- The web build ships a versioned embed script and the snippet references it.
- The panel, badge, share row and guide page exist.
- Demo Playwright passes.
- Checks are green.
- Ship after D merges: merge main in, PR, CI, merge. Step 16 (publisher profile) and 17+18
  (guide + ship) follow on the same branch.


### Step 16 — Slot listings: audience description + categories, Discover filter (slice C, `feat/publisher-growth`)

**Precondition:** 14+15 PASS, and #9 (slice D) merged into `feat/publisher-growth`
(`git merge origin/main`). This is needed because the new migration must chain after D's `0003`.
**Coder model:** Sonnet. **Risk:** medium. It adds a new off-chain table, a migration (the parity
test from slice H must stay green), a SIWE-guarded write, and user-generated text shown to other
users.

**Why:** advertisers currently choose slots by domain and size alone. The market-fit doc names
audience fit as the first buyer question. A publisher-written listing (who reads this page, what
it's about) plus a fixed category taxonomy gives Discover a real filter, with no protocol change.
It is off-chain and **not rebuildable from chain**. Mark it so, like the other `offchain.py`
tables.

**Read first:**
- `api/src/openad/models/offchain.py` (the `HouseAd` pattern) and `api/src/openad/services/offchain.py`.
- `routers/slots.py` (`put_house_ad`: `auth_service.get_session` + `require_slot_owner`; `list_slots`
  filters) and `services/slots.py` (`SlotOut` building).
- `schemas/slot.py`, `api/alembic/versions/` (the head is D's `0003` after the merge).
- `api/tests/test_migrations.py` (parity), `tests/test_public_reads.py`, `tests/test_auth.py`.
- Web: `features/marketplace/{DiscoverPage.tsx,SlotPage.tsx,api.ts}`, `components/SlotCard.tsx`,
  `features/publisher/SupplyPage.tsx` and `components/`, `lib/api.ts`.
- Demo: `demo/{fixtures,demoApi,store}.ts`.
- `docs/ARCHITECTURE.md` §3.2 (the table list) and `docs/GLOSSARY.md`.

**Design**
- Table `slot_listings` in `models/offchain.py`:
  - `slot_id` (PK, FK `slots.slot_id`)
  - `summary: String(140)`, the one-line pitch
  - `audience: Text` (≤ 600 chars, enforced in the schema)
  - `categories: String(200)`: comma-joined, validated against the taxonomy, max 3, stored
    sorted and lower-case
  - `updated_at`
  - Index on `categories` isn't useful. The filter uses `LIKE '%,cat,%'` against a
    `','||categories||','` expression, which is portable across SQLite and Postgres. Fine at
    this scale; add a comment.
- Taxonomy (`openad/listing_taxonomy.py`, single source; exported to the web through OpenAPI as
  an enum): `defi`, `nft`, `infrastructure`, `developer-tools`, `wallets`, `layer-2`, `gaming`,
  `dao-governance`, `security`, `news-media`, `education`, `other`.
- Write: `PUT /v1/slots/{slot_id}/listing`, `SlotListingIn {summary, audience, categories[]}`.
  - Auth is the same as house-ad: session plus `require_slot_owner`.
  - Text is normalised: strip, collapse whitespace, reject control characters, and reject URLs
    in `summary` (no link spam; the domain is already shown).
  - Returns `SlotListingOut`.
  - `DELETE` clears the listing.
- Read: `SlotOut` gains `listing: SlotListingOut | None`. This is additive, so existing clients
  are unaffected. `GET /v1/slots` gains `category: <enum> | None`, and the list endpoint joins
  the listing.
- Migration `api/alembic/versions/20260925_0004_slot_listings.py`: explicit `op.create_table`, no
  model imports (CONVENTIONS rule from slice H). `down_revision` = D's 0003 id.
- UI copy labels the listing "Publisher-provided", because it is self-described and not
  verified. Rendering is plain text: React escaping only, no markdown, no links.

**Files**
1. API: the model, taxonomy module, schemas (`schemas/slot.py`), service functions in
   `services/offchain.py` (get/set/delete listing), router endpoints, `list_slots` filter plus
   join, and the migration.
2. Tests in `api/tests/test_slot_listings.py`:
   - PUT requires a session, and the owner only (403 for another address, 401 without a session).
   - Validation: an unknown category, more than 3 categories, overlong text, a URL in the
     summary, control characters. Each returns 422 with the existing error style.
   - Round trip in `GET /v1/slots/{id}`.
   - Category filter hits and misses, including the prefix trap (`defi` must not match
     `defi-x`).
   - DELETE works.
   - `test_migrations.py` parity still passes; run it on Postgres too via pgserver
     (JIT_INDEX).
3. Web:
   - `lib/api.ts`: `putSlotListing`, `deleteSlotListing`, `listSlots({category})`. This is the
     only `lib/api.ts` edit; D's lines are already merged.
   - `features/publisher/components/ListingEditor.tsx`: slot select, summary (counter), audience
     (counter), up to 3 category chips, save and clear. Uses the SIWE flow like house-ad. Mount
     it in `SupplyPage.tsx` next to the house-ad card.
   - `features/marketplace/DiscoverPage.tsx`: a category filter (chips or a select) synced to
     the `?category=` URL param, and it must work under hash routing.
   - `SlotCard.tsx`: summary plus category badges when present.
   - `SlotPage.tsx`: an "About this audience" block with the "Publisher-provided" label.
4. Demo:
   - Fixtures get listings for most slots, with fictional audiences such as "Solidity developers
     reading our weekly security digest".
   - `demoApi` handles the PUT and DELETE routes (persona must own the slot, otherwise 403, the
     same as the real API) and `category` filtering.
   - Fixture and demoApi tests updated.
5. Tests:
   - Vitest: `ListingEditor` (validation counters, max 3 chips, save calls the API), Discover
     category filter (URL param round trip), `SlotCard` badges.
   - Playwright `e2e/demo/growth.spec.ts`: as the publisher, edit a listing and add a category.
     Then as the advertiser, filter Discover by that category and find the slot. The off-origin
     guard still holds.
6. Docs:
   - `docs/ARCHITECTURE.md` §3.2: a `slot_listings` row, off-chain and not rebuildable, "back
     up".
   - `docs/GLOSSARY.md`: **listing** is the publisher-provided audience description and
     categories for a slot. It is not the slot itself, and it is never on-chain.
   - `docs/guide/publisher/listing.md` plus a SUMMARY link.
   - ROADMAP 6.3 progress note.
7. Backlog note (planner): listing text moderation (reuse the moderator role?). Out of scope
   here.

**Verify**
```bash
cd /home/claude/OpenAd
(cd api && uv run ruff check && uv run ruff format --check && uv run mypy src && uv run pytest -q)
(cd api && OPENAD_TEST_PG_URL=<pgserver url> uv run pytest -q tests/test_migrations.py tests/test_slot_listings.py)   # see JIT_INDEX
(cd api && rm -f /tmp/fresh.db && OPENAD_DATABASE_URL=sqlite+aiosqlite:////tmp/fresh.db uv run alembic upgrade head)   # match config.py var name
npm run typecheck && npm run lint && npm run test && npm run build && npm run build:demo
node web/scripts/check-demo-bundle.mjs
npx prettier --check web/src/demo e2e/demo web/src/features/marketing web/src/app/routes.tsx
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run test:demo -w e2e
git status --short   # .cursor/ not staged by the coder
```

**Done when:**
- Listings can be written only by the slot owner and are validated.
- Listings are returned additively on `SlotOut`, and Discover filters by category.
- The demo supports it end to end.
- The migration chains after 0003 and parity passes on SQLite and Postgres.
- Glossary, ARCHITECTURE and the guide are updated.
- Checks are green.
- 17+18 then finishes slice C (guide index, ROADMAP 6.3 `[x]`, ship).


### Step 30+31 — README, demo script, competitive doc, launch checklist, screenshots (slice G, PARALLEL with C)

**Where:** a new worktree `/home/claude/OpenAd-g`, branch `docs/launch-polish` off `origin/main`,
created after #9 merges, so main has slices A, B, D, E, F and H. JIT files are not edited there.
**Coder model:** Sonnet. **Risk:** low–medium.
- These are docs, but they are the most-read, outward-facing text. The main risks are
  overclaiming (features that aren't on main yet, invented market numbers, traction) and naming
  competitors' rates as fact.

**Hard scope, to avoid conflicts with slice C:**
- **May edit or create:** `README.md`; new files under `docs/business/`;
  `docs/business/README.md` (the index); `docs/business/pitch-deck.md` (only the Slide 9 speaker
  note pointer and `DEMO_URL` placeholders); new `docs/business/assets/*.png`; and a new
  `e2e/demo/capture-screenshots.mjs`.
- **Must not touch:** `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`, `docs/guide/**` (including
  SUMMARY), `web/**`, `api/**`, or `e2e/demo/*.spec.ts`. Lines needed there go to 32+33.
- **Features not on main yet** (slice C: embed code panel, serve CORS, share and badge, listings)
  are **not** described as available. At most, a "Coming next" line in README, reworded or
  removed in 32+33.

**Links (use exactly):**
- Live demo: https://claude.ai/artifact/AzkEcWfmUT23GCo2qkWxE7
- Pitch deck: https://claude.ai/artifact/Day12XXUFNi7CJdNpa2MUH
- Wherever they appear, add: "Private until the owner shares it. If the link asks you to sign in
  or request access, ask the OpenAd team for access."

**Read first:**
- `docs/business/{README,market-fit,gtm-marketing,pitch-deck}.md`: stay consistent with the
  verdict, ICP, fee wording ("default 2.5%, capped at 10% on-chain"), payout wording (LEASE:
  atomic in the buy transaction; CPC: at each settler batch), and non-custodial wording (LEASE
  never holds funds; CPC budgets are escrowed in `CampaignVault` until settled or closed).
- `web/src/demo/tour/steps.ts` (6 steps: "Discover, as the advertiser", "The Dutch price is
  falling", "Buy the period", "Switch to the publisher", "CPC campaigns", "Your creative is
  live", ending on `/why`).
- `web/src/demo/fixtures.ts` personas: advertisers **Nimbus Wallet** and **Fastlane L2**;
  publishers **Basecamp Weekly (newsletter)**, **Voidkit Docs (dev-tool docs)** and
  **ChainScope Explorer (dashboard)**.
- `web/src/demo/PersonaSwitcher.tsx`, `web/src/features/marketing/{WhyPage,EmbedDemoPage}.tsx`,
  `e2e/demo/demo.config.ts` (the static sub-path server and `demoPath`).
- The current `README.md`, `AGENTS.md` (commands and invariants), `docs/deploy-gcp.md`,
  `scripts/*.sh`, `docs/GLOSSARY.md`.

**Files**
1. `README.md` rewrite, about 150 lines max:
   - A one-line value proposition and a 3-bullet "why" for publishers and for advertisers.
   - **Try it now:** the demo link, the private note, and "Take the tour" from the banner.
   - Pitch deck link.
   - "How it works": LEASE and CPC in 4 lines each, glossary terms linked to
     `docs/GLOSSARY.md`, and the invariants in plain words.
   - Screenshots: 3–4 images from `docs/business/assets/`.
   - Quickstart: bash (`scripts/setup.sh`, `dev-up.sh`), Windows (`scripts\setup.cmd`), and a
     one-command docker stack (`npm run stack:docker`).
   - "Run the demo locally" (`npm run build:demo` and serve `web/dist-demo`).
   - "Deploy" (`docs/deploy-gcp.md`), a docs map (keep the existing Documentation section's
     links), repository layout (updated), status ("testnet-ready; not audited; no production
     deployment yet"), and License (unchanged).
   - No badges that point at nonexistent services. Keep valid commands only; check each against
     `package.json` and `scripts/`.
2. `docs/business/competitive.md`:
   - A top banner: "Approximate, publicly reported ranges as of 2026; verify before external
     use. No figure here is from a customer."
   - Compare **by category** (traditional display networks, crypto-native ad networks,
     newsletter or sponsorship marketplaces, direct or agency-sold deals, and OpenAd) across
     these dimensions: take rate, payout timing, custody of funds, tracking in the serve path,
     approval gate and minimums, pricing mechanism, spend transparency, fiat support, audience
     targeting, and demand/fill today.
   - Company names may appear only as "examples of the category", never next to a specific
     rate.
   - Must include an honest "Where OpenAd loses today" section: USDC-only (no fiat onramp),
     cold-start demand and fill, limited targeting (slot-level; listings coming), no audited
     contracts yet, no independent measurement or IVT vendor.
   - End with "How we answer these objections", keyed to ROADMAP items or backlog.
   - The deck's Slide 9 summary must remain consistent with it. Update only the speaker-note
     pointer in `pitch-deck.md` ("See `competitive.md`"), and replace any `<DEMO_URL>`
     placeholder in that file with the live link.
3. `docs/business/demo-script.md`, for live pitches:
   - **Pre-flight:**
     - Artifact shared with the audience, or you present it yourself.
     - Chrome, window ≥1280px, zoom 100–110%.
     - Know that a full reload resets the demo store and disconnects the demo wallet (by
       design).
     - Personas are fictional.
     - "Simulated data, no real funds or chain" is shown on the banner; say it out loud once.
   - **Three talk tracks** with timings, each a numbered click path using the demo's real
     labels and hash routes (`#/`, `#/slots/<id>`, `#/campaigns`, `#/supply`, `#/embed-demo`,
     `#/why`), plus "say this" lines and the "proof point" visible on screen:
     - **2-minute** (hallway): the tour steps 1–3 and 6, then `/why` with one calculator input.
     - **5-minute** (investor or partner): the full 6-step tour, then Supply performance tiles
       as the publisher.
     - **15-minute** (publisher or advertiser deep dive): the manual path without the tour.
       Advertiser Nimbus Wallet buys a LEASE period (price falling, wallet down by exactly the
       quote), then opens a CPC campaign as Fastlane L2. Switch to Basecamp Weekly: approvals,
       earnings = price − fee, performance panel. Then `/embed-demo` (the real `<open-ad>`
       element, no chain reads), and `/why` with the audience's own numbers.
   - **Q&A crib:** is it real money? custody? what if nobody buys a period (Dutch floor, house
     ad)? click fraud (IVT discards, settler batches)? fiat? audits? why Base and USDC? how do
     you make money (fee on GMV, capped on-chain)? All answers must match market-fit and
     PROTOCOL wording.
   - **Recovery:** the wallet disconnected (Connect → "OpenAd Demo Wallet"), the tour closed
     ("Take the tour" in the banner), state looks odd (reload resets).
   - **Follow-up email template:** demo link, deck link and a CTA, with placeholders only and
     no invented names.
4. `docs/business/launch-checklist.md`: a table with item, owner (**User** / Done / Next PR) and
   a link.
   - **Done:** demo live, deck, docker images built in CI, deploy artifacts, analytics, run
     scripts.
   - **User actions:**
     - Share the demo and deck Artifacts.
     - Create a GCP project and follow `docs/deploy-gcp.md`.
     - Set the GitHub WIF secrets.
     - Deploy contracts to Base Sepolia and commit `84532.json`.
     - A security audit before mainnet.
     - Legal (ToS, privacy, advertiser content policy): placeholders; say "consult counsel".
     - Domain and email.
     - Mainnet deploy with manual approval.
   - **Next PRs:** slice C features, Backlog items from the plan (sourcemaps off in the prod
     image, listing moderation, analytics refinements).
   - Also a "First 30 days" metric list consistent with `gtm-marketing.md`.
5. `e2e/demo/capture-screenshots.mjs`, a script, not a test:
   - Uses Playwright's library API with the same static sub-path server as `demo.config.ts`
     (import or reuse `static-server.mjs`) against a fresh `npm run build:demo`, honouring
     `PLAYWRIGHT_CHROMIUM_PATH`.
   - Captures at 1280×800 with deterministic state (frozen demo clock via the same mechanism
     the suite uses):
     - `discover.png`;
     - `slot-dutch-price.png`;
     - `buy-confirmed.png`;
     - `publisher-supply-performance.png`;
     - `embed-demo.png`;
     - `why-calculator.png`.
   - Writes to `docs/business/assets/`, each PNG ≤ 400 KB (reduce with `quality`/`scale:'css'`,
     or crop).
   - Add npm script `capture:screenshots` in `e2e/package.json`. That's a one-line
     `package.json` edit, which is fine since C doesn't touch `e2e/package.json`; if it does,
     defer.
   - README embeds 3–4 of them.
6. `docs/business/README.md`: index entries for `competitive.md`, `demo-script.md`,
   `launch-checklist.md` and `assets/`, plus both live links with the private note.

**Verify**
```bash
cd /home/claude/OpenAd-g
npm install && npm run build:demo
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run capture:screenshots -w e2e
ls -la docs/business/assets/*.png && find docs/business/assets -name '*.png' -size +400k | grep . && echo "FAIL too big" || echo sizes-ok
npx prettier --check README.md docs/business/*.md
# relative links resolve:
python3 - <<'PY'
import re,os,sys
bad=[]
for f in ['README.md']+[os.path.join('docs/business',x) for x in os.listdir('docs/business') if x.endswith('.md')]:
    for l in re.findall(r'\]\(([^)#]+)', open(f).read()):
        if l.startswith(('http','mailto:')): continue
        p=os.path.normpath(os.path.join(os.path.dirname(f), l))
        if not os.path.exists(p): bad.append((f,l))
print(bad or 'links ok'); sys.exit(1 if bad else 0)
PY
grep -rniE "sell(s|ing)? (a |the )?slot|guarantee|trusted by|customers include" README.md docs/business && echo "REVIEW wording" || echo wording-ok
grep -c "AzkEcWfmUT23GCo2qkWxE7" README.md docs/business/demo-script.md docs/business/README.md
git status --short   # no ROADMAP/ARCHITECTURE/guide/web/api changes
```

**Done when:**
- README sells the product accurately, with the demo and deck links and the private note.
- Screenshots are generated reproducibly by the script and are small.
- `competitive.md` is category-based, honest, and consistent with Slide 9.
- The demo script gives 2/5/15-minute tracks keyed to the real tour steps and personas.
- The launch checklist separates user actions from done work.
- Links and prettier pass, and no out-of-scope files changed.
- 32+33 later adds the ROADMAP/ARCHITECTURE/guide lines, rewords "Coming next" after C merges,
  and archives the plan.


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

- Analytics: a CPC slot with impressions but no clicks shows the "not tracked for leases" hint; use a neutral hint instead (web only).
- Analytics: advertiser CTR is diluted by LEASE impressions. It should be CTR over CPC impressions (needs an API field).
- Analytics: a "Booked (upcoming)" tile for leases whose period starts after now, kept separate (needs an API field).
- Slot listing text moderation (moderator role?), after step 16.

- Per-slot Open Graph previews need server-side rendering or an edge function (the SPA can't set crawler-visible meta). Static defaults land in 14+15.
- Publish `@openad/embed` to npm / a CDN (today the web origin hosts `embed/open-ad.v1.js`).

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
- 2026-09-25 11:30 — 12+13 DONE (PASS r2; main merged `f6f1b46`; PR #8 opening). Slice F SHIPPED (PR #7, `866d7fe`). ROADMAP 6.6 note assigned to slice G (32+33) along with the sourcemap backlog item. 21+22 spec written. Active: 21+22 (after #8 merges and main is merged into `feat/analytics`).
- 2026-09-25 12:15 — PR #8 merged (`591e576`); demo Artifact live at https://claude.ai/artifact/AzkEcWfmUT23GCo2qkWxE7. 21+22 coding in `/home/claude/OpenAd-d`. The primary tree is now on `feat/publisher-growth` (JIT edits ride with slice C). 14+15 spec written as a parallel step; while planning it I found that serve has no public CORS, so embeds on publisher domains would fail in browsers. The fix is in 14+15. Merge order: D, then C.
- 2026-09-25 13:05 — 21+22 DONE (PASS r2; PR #9 open). 14+15 is in FIX r1 (nginx `/embed/` ACAO, serve CORS path match). Step 16 pre-specced: slot listings plus a category filter, migration 0004 after D's 0003. Merge order: #9 → merge main into C → finish 14+15 → 16. Analytics L3s added to the Backlog.
- 2026-09-25 13:40 — 30+31 (slice G) specced as a parallel step in `/home/claude/OpenAd-g`. Scope: README plus new business docs and screenshots only; ROADMAP, ARCHITECTURE, guide and code are deferred to 32+33 to avoid conflicts with C. Deck: https://claude.ai/artifact/Day12XXUFNi7CJdNpa2MUH.
