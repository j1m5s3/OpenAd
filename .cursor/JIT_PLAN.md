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
| I Fix: buy receipt after confirmation (found in G review) | `fix/buy-receipt` | 6.2 follow-up | #10 merged; merge before G |
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
- ✓ 14+15. C: serve CORS (`*`, no credentials, raw-path exact match on `/v1/serve/*`), versioned `embed/open-ad.v1.js` shipped by the web build (nginx `/embed/` ACAO:*), `embedSnippet.ts`, `EmbedCodePanel` ("Slot to embed"), share row, badge, OG defaults, guide page, `growth.spec.ts`. FIX r1 → PASS r2. `b13eda4`/`3195f17`/`142a3f2`/`d4b6acf`. **PR #10 merged `eba40cd`** (CI 5/5). api 103/4 skipped, web 182, test:demo 13/13.
- ✱ 16. C (`feat/slot-listings`): in **FIX r1**. L1: ListingEditor re-hydrates on refetch and clobbers edits (growth e2e failed 5/5). L2: no catch on save; bidi, zero-width and C1 characters accepted; `.js` false positive in URL detection. L3: NFC before length checks, dedupe before the cap, ignore a bogus `?category`, demo 422 on invalid category. Ships its own PR (guide page, glossary and 6.3 progress already in scope).
- → 17+18. C: **merged into step 36** (same files as 32+33); 16 ships slice C by itself.

### Slice I — `fix/buy-receipt` (PARALLEL; merge before G)
- ✓ 35. I: BuyDialog freezes the signed quote; the receipt shows price paid, split, tx hash and View slot; header has three states; `shortMessage` errors; Buy disabled while quoting. Item 6 diagnosis: **not a bug** (9.2625 = seed 6.3375 + 2.925 proceeds; the screenshot was already post-buy), now guarded by an exact-balance e2e assertion. FIX r1 → PASS r2. **PR #12 merged `d5d46a0`**, CI 5/5. Demo Artifact republished (v2) from `d5d46a0`.

### Slice D — `feat/analytics`
- ✓ 19+20. D: analytics schemas/service/router + `0003` indexes (`IF NOT EXISTS`), ORM `__table_args__` indexes; day bucket `col - col % 86400`; serve match on (slot, calendar_version, period); `by_slot` window-limited; `SlotNotFoundError`/`InvalidWindowError`. FIX r1 → PASS r2; 72 api tests. Committed on `feat/analytics` (`/home/claude/OpenAd-d`). Ship after 21+22.
- ✓ 21+22. D: analytics client, `lib/analytics.ts`, `Sparkline`/`StatTile`, `SlotPerformance`, `AdvertiserPerformance`, demo analytics. LEASE CTR shows "—" (not tracked for leases: direct click_url, no click_events); `bySlot` = lease + settled only. FIX r1 → PASS r2. Web 169, api 95/4 skipped, test:demo 9/9. **PR #9 merged `07eeece`** (plus a CI fix: the web-demo healthz curl uses `--retry-all-errors`). Worktree removed.

### Slice E — `feat/bash-stack-scripts`
- ✓ 23+24. E: bash twins + `lib.sh` + `stack-docker.sh` + `check-sh.sh` (CI), ADR-0007 amendment, ROADMAP 6.5. Review FIX r1 → PASS r2; CI shellcheck SC1091 fixed (`# shellcheck source=` + `shellcheck -x`, `811bc8e`). PR #5 — **merge pending CI** (orchestrator). Worktree `/home/claude/OpenAd-e` can be removed after merge.

### Slice H — `fix/alembic-fresh-db` (PARALLEL; blocks F and D's ship)
- ✓ 34. H: froze `0001_baseline` to an explicit schema (models @ `95163d9`); `test_migrations.py` covers fresh upgrade, `compare_metadata` parity and round trip, plus Postgres via `OPENAD_TEST_PG_URL`; CONVENTIONS rule added. Opus; PASS r1 (old-path and new-path DDL identical on SQLite and PG16). PR #6 merged `e8a34b8`. Nits (not scheduled): parity doesn't compare server defaults; 0002 isn't ruff-formatted (alembic/ is outside the lint scope).

### Slice F — `feat/gcp-deploy`
- ✓ 25+26. F: ADR-0017 + `docs/deploy-gcp.md` + `MediaStore` (local/GCS, ref validation, cached client) + `openad/health.py` (stdlib liveness listener started only when `PORT` is set; indexer and settler never listened on `$PORT`) + objectUser for the indexer + a service account for the migrate job + WIF attribute-condition. FIX r1 → PASS r2; 80 passed, 4 skipped. `48f84f4`.
- ✓ 27+28. F: api CMD without migrations + compose `migrate`; `web/Dockerfile` + nginx template (5 security headers, CSP per variant, `/healthz`, SPA fallback); `infra/gcp/` (cloudbuild with `_TAG`, services, migrate job); `scripts/deploy-gcp.sh` (prod and CI guards); `deploy.yml` (WIF, push-only same-repo gate, staging only); CI `docker` job. FIX r1 → PASS r2 (real docker build and run of the web image). `279070a`.
- ✓ 29. F ship: PR #7 merged `866d7fe`, all 5 CI jobs green (first real docker build of both images). Worktree removed. Live GCP deploy is user-run.

### Slice G — `docs/launch-polish`
- ✓ 30+31. G: README rewrite, `docs/business/{competitive,demo-script,launch-checklist}.md`, `capture-screenshots.mjs` (pinned epoch, byte-identical; `buy-leased.png` instead of buy-confirmed, so it doesn't depend on I), checklist mainnet row and demo-script fixes. FIX r1 → PASS r2. `23b1c5b`, merged main `f27df3c`; **PR #11 merged `c3f39dc`**. Deferred to 36: README "Coming next" still lists the embed panel and share row, which are now on main.
- → 32+33. G: **merged into step 36.**
- ○ 36. Final (`chore/launch-final` off main after `feat/slot-listings` merges, primary tree): ROADMAP 6.3/6.6/6.7 `[x]` with 6.6 split so live deploy is new 6.8 `[ ]`; Phase 7 backlog; sourcemaps off; onramp guide page; SUMMARY; README shipped features and fresh screenshots; business docs, scorecard, ARCHITECTURE §7; planner archives the plan in the same PR. **Risk: low.** **(full spec below)**

## 5. Active step — full spec

### Step 16 — Slot listings: audience description + categories, Discover filter (slice C, `feat/publisher-growth`)

**Precondition (updated 2026-09-25 14:30):** #10 merged. Work on a **fresh branch `feat/slot-listings` off `origin/main`** in the primary tree. D's `0003` is on main, so `down_revision` = 0003. Extend the existing `e2e/demo/growth.spec.ts`. Name the ListingEditor slot select "Slot to describe" to avoid a third "Slot" combobox on Supply.
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


### Step 36 — Launch finalization (replaces 17+18 and 32+33; one branch, one PR, the last step)

**Why merged:** 17+18 (guide, ROADMAP 6.3, ship C) and 32+33 (ROADMAP ticks, README, guide
SUMMARY, qa note, archive) edit the same three files: `docs/ROADMAP.md`, `docs/guide/SUMMARY.md`
and `README.md`. Step 16 already ships its own guide page, glossary term and ROADMAP 6.3
progress line on `feat/slot-listings`. What's left is one docs-and-polish pass.

**Where:** the primary tree `/home/claude/OpenAd`, a fresh branch `chore/launch-final` off
`origin/main` **after `feat/slot-listings` merges**. The JIT files ride along here; the planner
archives the plan in this branch after the coder finishes (see item 10).
**Coder model:** Sonnet. **Risk:** low. It is docs plus a one-line build flag. The main risk is
ticking something that isn't done. Every tick must match what is on main.

**Read first:**
- `docs/ROADMAP.md` Phase 6 as on main. 6.3 has a progress block, 6.6 has a progress block, and
  6.7's acceptance names the README, demo script, launch checklist, **onramp guide links**, 6.x
  fully ticked, and guide SUMMARY.
- `README.md` ("Coming next" section), `docs/business/{README,launch-checklist,demo-script,competitive}.md`.
- `docs/guide/SUMMARY.md` and the guide pages added by C, D and 16.
- `docs/qa/scorecard.md`, `docs/ARCHITECTURE.md` §7, `web/vite.config.ts` (L94
  `build: { sourcemap: true, … }`), `e2e/demo/capture-screenshots.mjs`, and the Backlog in
  `.cursor/JIT_PLAN.md` §8 (read-only).

**Items**
1. **ROADMAP Phase 6:**
   - 6.3 → `[x]` `_Done <date>._`. Condense the progress block into a one-paragraph "Delivered"
     note: embed script and panel, serve CORS, share row and badge, static OG, slot listings and
     category filter. Per-slot OG goes to Phase 7.
   - 6.6: split honestly.
     - 6.6 **"Deploy artifacts (ADR-0017)"** becomes `[x]`: Dockerfiles, `infra/gcp`, deploy
       script, gated WIF workflow, CI docker job, GCS media store, migrate job.
     - A new **6.8 "Live GCP deployment (user-run)"** stays `[ ]`, with its acceptance being the
       runbook steps: GCP project, WIF secrets, Base Sepolia deploy plus a committed
       `84532.json`, staging smoke checks. Pointers go to `docs/deploy-gcp.md` and
       `docs/business/launch-checklist.md`.
   - 6.7 → `[x]` once items 2–6 below land.
   - Add **Phase 7 — Post-launch backlog**, all `[ ]`, one line each with pointers, from JIT §8:
     - per-slot OG via edge or server render;
     - publish `@openad/embed` to npm or a CDN;
     - listing moderation, and clearing or flagging a listing on slot transfer (new owner
       inherits text they didn't write);
     - analytics: neutral CTR hint on CPC slots, advertiser CTR over CPC impressions, a "Booked
       (upcoming)" tile;
     - parity test covering server defaults; ruff scope including `alembic/`;
     - the `useSiwe` in-flight race on account switch;
     - a unit test for the BaseError `shortMessage` branch in BuyDialog;
     - security audit before mainnet.
2. **Sourcemaps off in production builds:** in `web/vite.config.ts`, set
   `sourcemap: process.env.VITE_SOURCEMAP === '1'` (default off). Document it in `.env.example`.
   Check that `web/dist` and `web/dist-demo` contain no `.map` files, and that the embed build is
   unaffected (its own config; leave it alone unless it also emits maps into the web image).
3. **Onramp guide page** (6.7 acceptance, blocker 5): `docs/guide/advertiser/getting-usdc-on-base.md`.
   - Plain steps: buy USDC on a major exchange or onramp and withdraw on the **Base** network;
     or bridge from Ethereum.
   - Link only to **official** docs pages (Base docs, Circle USDC docs) using stable top-level
     URLs. No affiliate links. No fee or availability claims.
   - A warning to double-check the network (Base) and the token contract (native USDC), which
     is the one the app uses.
   - Link it from the advertiser README, "Buy a period", and the business launch checklist.
4. **Guide SUMMARY:** add the onramp page, and make sure every page added by C, D and 16
   (embed-code, performance, listing) is listed exactly once. Add a "Try the demo" line to
   `docs/guide/README.md` with the demo link and the private-access note.
5. **README:**
   - Replace "Coming next" with the shipped features (embed code panel and badge, share row,
     slot listings and category filter, analytics, buy receipt).
   - Keep the demo and deck links with the private note.
   - Status line: "testnet-ready, not audited; live GCP deploy pending (ROADMAP 6.8)".
   - Refresh screenshots: extend `capture-screenshots.mjs` with `buy-receipt.png` (the step 35
     receipt) and `discover-categories.png` (step 16 listing badges and filter), keeping the
     pinned epoch, ≤400 KB each. Swap them into the README if they read better than the current
     ones.
6. **Business docs:**
   - `launch-checklist.md`: move the shipped rows to Done (listings, buy receipt, analytics,
     demo v2 republished), and keep User actions accurate.
   - `demo-script.md`: add a 30-second beat for the buy receipt (price paid plus split) and for
     the Discover category filter in the 5- and 15-minute tracks.
   - `pitch-deck.md`: update the "Traction/roadmap" slide honestly (built vs pending: live
     deploy, audit). Note in the commit that the hosted deck needs a regenerate.
7. **`docs/qa/scorecard.md`:** append a short "Round 4 (2026-09-25): demo mode and launch pass"
   entry: what was checked (demo suite 13+ tests, off-origin guard, receipt, listings), with no
   invented persona verdicts; cite the Playwright suites.
8. **`docs/ARCHITECTURE.md` §7:** the demo row links the hosted demo (private note) and
   `build:demo`; the production row points to 6.8 for the live deploy.
9. **No product code** beyond item 2. If a docs claim turns out false against main, fix the doc,
   not the code, and list it in the commit.
10. **Planner (not the coder), after the coder passes review:** move `.cursor/JIT_PLAN.md` to
    `.cursor/jit_history/2026-09-25-market-fit-launch.md` with an Outcome section (PRs #4–#13+,
    demo and deck links, open user actions), and update `JIT_INDEX.md`. That lands in the same
    PR.

**Verify**
```bash
cd /home/claude/OpenAd
npm run typecheck && npm run lint && npm run test && npm run build && npm run build:demo
find web/dist web/dist-demo -name '*.map' | grep . && echo "FAIL sourcemaps" || echo no-maps
node web/scripts/check-demo-bundle.mjs
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run capture:screenshots -w e2e && find docs/business/assets -name '*.png' -size +400k | grep . && echo "FAIL size" || echo png-ok
npx prettier --check README.md docs/business/*.md
python3 - <<'PY'   # relative links in README, docs/business, docs/guide resolve
import re,os,sys
bad=[]
files=['README.md']+[os.path.join(r,f) for d in ('docs/business','docs/guide') for r,_,fs in os.walk(d) for f in fs if f.endswith('.md')]
for f in files:
    for l in re.findall(r'\]\(([^)#\s]+)', open(f).read()):
        if l.startswith(('http','mailto:')): continue
        if not os.path.exists(os.path.normpath(os.path.join(os.path.dirname(f), l))): bad.append((f,l))
print(bad or 'links ok'); sys.exit(1 if bad else 0)
PY
grep -n "^- \[ \]" docs/ROADMAP.md   # expect only 6.8 + Phase 7 items (+ any pre-existing unrelated open tasks, unchanged)
grep -rniE "sell(s|ing)? (a |the )?slot|trusted by|customers include" README.md docs/business docs/guide && echo REVIEW || echo wording-ok
git status --short
```

**Done when:**
- ROADMAP Phase 6 is truthful: 6.1–6.7 `[x]`, 6.8 open as user-run, Phase 7 backlog listed.
- Production and demo builds ship no sourcemaps.
- The onramp guide page exists and is linked.
- SUMMARY is complete, and the README describes only shipped features, with fresh screenshots.
- Business docs and the scorecard are updated. Links, prettier and wording checks pass.
- After planner archival: PR, CI 5/5, merge. Then the orchestrator republishes the demo Artifact
  if visuals changed, regenerates the hosted deck from `pitch-deck.md`, and gives the user the
  final report (demo, deck, user actions from the launch checklist).


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
- A slot listing survives an on-chain slot transfer, so the new owner inherits text they didn't write, still labelled "Publisher-provided". Clear or flag it on transfer (needs an indexer hook).
- BuyDialog: add a unit test for the BaseError `shortMessage` branch.

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
- 2026-09-25 14:30 — #9 merged (`07eeece`). 14+15 DONE (PASS r2; PR #10 open). G 30+31 is in FIX r1 (screenshots, launch-checklist mainnet path, demo-script accuracy). The G review found a product bug: BuyDialog re-quotes to "0.00 … Not sellable" after a confirmed buy. New slice I, step 35, `fix/buy-receipt`, runs in parallel and merges before G, so the screenshots are re-captured. Step 16 re-checked against main plus #10: it holds, on a fresh `feat/slot-listings` branch. Merge order: #10 → I → 16/17+18 → G 30+31 → G 32+33.
- 2026-09-25 15:20 — #10 merged (`eba40cd`). 16 coding on `feat/slot-listings`; 35 coding in `/home/claude/OpenAd-i`. 30+31 DONE (PASS r2; PR #11). Demo publisher balance finding: `reducers.buy()` does credit the slot owner, so the likely cause is a stale wagmi `balanceOf` read on persona switch, or the screenshot showing a non-owning publisher. Folded into 35 as item 6, with a diagnosis order and an exact-balance Playwright assertion. The 30+31 spec is removed from §5.
- 2026-09-25 16:40 — #11 merged (`c3f39dc`). 35 DONE (#12 → `d5d46a0`; the balance item was not a bug and is now guarded). Demo Artifact v2 republished. Worktrees `-g` and `-i` removed. 16 is in FIX r1. **17+18 and 32+33 merged into one final step 36** (`chore/launch-final`), because they edit the same files. Spec written; 6.6 is split so the live deploy is an honest open 6.8. Backlog: listing on slot transfer, BaseError unit test.
