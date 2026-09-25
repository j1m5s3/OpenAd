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
- **D9 — Harden before the final docs pass (2026-09-25 03:35 UTC).**
  - Step 37 (auth) and step 38 (capacity and deploy) merge before step 36, so the launch docs
    describe the hardened state.
  - ROADMAP numbering: 6.8 is auth hardening (37), 6.9 is capacity and deploy hardening (38),
    and 6.10 is the live GCP deploy (user-run, left open by 36).
  - Phase 7 is the post-launch backlog.
- **D10 — SIWE binding rule (37, ADR-0009 amendment).**
  - A SIWE message is accepted only if its EIP-4361 `domain` equals the authority (host:port)
    of an allowed origin and its `URI` has that same origin.
  - Allowed origins come from `OPENAD_SIWE_ALLOWED_ORIGINS`, falling back to
    `OPENAD_CORS_ORIGINS`.
  - Clients (web, sim) sign as the **web** origin, never as the API origin.
  - Nonces are consumed atomically, only after the signature checks out.
  - The auth rate limit is opt-in, per instance, and keyed by the right-most trusted
    `X-Forwarded-For` hop.
  - Amended in 37's fix round 1 (orchestrator, 2026-09-25): messages follow the EIP-4361 ABNF
    strictly (two empty lines when there is no statement, which is what viem's
    `createSiweMessage` emits); addresses must be EIP-55 checksummed; clock skew is ±300 s.
- **D11 — Web and api share a registrable domain in production (38).** The session cookie is
  `SameSite=Lax`, and `*.run.app` hosts are separate sites. Required by the runbook and guarded
  by `deploy-gcp.sh` (`--allow-cross-site-auth` overrides). The guard compares the last two DNS
  labels, so it falsely accepts hosts under multi-part public suffixes (`co.uk`, `web.app`);
  documented, not fixed.
- **D12 — Connection budget (38, ADR-0017 amendment).** Cloud SQL `max_connections` is pinned to
  100 by a database flag, not left to the tier default. The api runs at most 4 instances × a
  pool of 4 + 2 overflow; the indexer and settler get 2 + 1 each; the migrate job uses Alembic's
  single connection. That is 31 steady, 34 with Postgres's 3 reserved, and ≈64 during a rollout
  overlap. Raising `maxScale` or any pool means redoing the budget in `docs/deploy-gcp.md` §3.

## 3. Slices → branches

| Slice | Branch | ROADMAP | Depends on |
| ----- | ------ | ------- | ---------- |
| A Market fit + GTM + pitch source | `docs/market-fit-gtm` | 6.1 | — |
| B Demo mode + static showcase | `feat/web-demo-mode` | 6.2 | A |
| C Publisher growth (embed code, share page) + listings | `feat/publisher-growth` (#10), `feat/slot-listings` (#13) | 6.3 | B (demo fixtures reuse) |
| D Analytics (API + UI) | `feat/analytics` | 6.4 | — (API), B for demo fixtures; H ✓ merged in `57e2aea` |
| E Cross-platform scripts + one-command stack | `feat/bash-stack-scripts` | 6.5 | — |
| F Production deploy (GCP) | `feat/gcp-deploy` | 6.6 | E |
| G Docs polish (README, demo script, guide) | `docs/launch-polish` | 6.7 | A–F |
| I Fix: buy receipt after confirmation (found in G review) | `fix/buy-receipt` | 6.2 follow-up | #10 merged; merge before G |
| H Fix: fresh-DB Alembic chain (found in review) | `fix/alembic-fresh-db` | 6.6 prerequisite | — (merge before D ships and before F) |
| J Auth hardening (SIWE binding, nonce/session hygiene, rate limit) | `fix/auth-hardening` | 6.8 | #13 merged |
| K Capacity and deploy hardening (pool budget, scale caps, same-site, media hops) | `feat/ops-hardening` (#14) | 6.9 | #13 merged; merge after J |
| L Outbound-fetch bounds (**proposed**: indexer media deadline, domain-check fetch) | `fix/outbound-fetch-bounds` | noted under 6.9 by 36 | #14 merged; merge before Final |
| Final: launch finalization (old 17+18 + 32+33) | `chore/launch-final` | 6.3/6.6/6.7 ticks, 6.10, Phase 7 | J, K and (if accepted) L merged |

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
- ✓ 16. C: slot listings. Summary ≤140 characters with no URLs, audience ≤600, up to 3 of 12 categories, owner-only `PUT`/`DELETE /v1/slots/{id}/listing`, additive `SlotOut.listing`, `?category=`, migration `0004`, `ListingEditor` ("Slot to describe"), Discover filter, badges, demo support, guide `publisher/listing.md`, glossary. Reviews: R1 FIX (hydration race clobbering edits; Unicode Cc/Cf accepted), R2 FIX (ZWJ URL bypass; `.rs`/`.py` TLD allowlist), R3 (Opus) PASS (listing e2e 60/60 under `--repeat-each=20`). `c1a3a93` feature + `35281a3` JIT, main merged `496422e`. Checks: api 126 passed / 1 skipped (with PG), web 209, e2e 13/13, demo 14/14. **PR #13 merged `abb2b81`**. L3s accepted and moved to Phase 7: URL-heuristic gaps, SupplyPage `['1']` fallback.
- → 17+18. C: **merged into step 36** (same files as 32+33); 16 ships slice C by itself.

### Slice I — `fix/buy-receipt` (PARALLEL; merge before G)
- ✓ 35. I: BuyDialog freezes the signed quote; the receipt shows price paid, split, tx hash and View slot; header has three states; `shortMessage` errors; Buy disabled while quoting. Item 6 diagnosis: **not a bug** (9.2625 = seed 6.3375 + 2.925 proceeds; the screenshot was already post-buy), now guarded by an exact-balance e2e assertion. FIX r1 → PASS r2. **PR #12 merged `d5d46a0`**, CI 5/5. Demo Artifact republished (v2) from `d5d46a0`.

### Slice D — `feat/analytics`
- ✓ 19+20. D: analytics schemas/service/router + `0003` indexes (`IF NOT EXISTS`), ORM `__table_args__` indexes; day bucket `col - col % 86400`; serve match on (slot, calendar_version, period); `by_slot` window-limited; `SlotNotFoundError`/`InvalidWindowError`. FIX r1 → PASS r2; 72 api tests. Committed on `feat/analytics` (`/home/claude/OpenAd-d`). Ship after 21+22.
- ✓ 21+22. D: analytics client, `lib/analytics.ts`, `Sparkline`/`StatTile`, `SlotPerformance`, `AdvertiserPerformance`, demo analytics. LEASE CTR shows "—" (not tracked for leases: direct click_url, no click_events); `bySlot` = lease + settled only. FIX r1 → PASS r2. Web 169, api 95/4 skipped, test:demo 9/9. **PR #9 merged `07eeece`** (plus a CI fix: the web-demo healthz curl uses `--retry-all-errors`). Worktree removed.

### Slice E — `feat/bash-stack-scripts`
- ✓ 23+24. E: bash twins + `lib.sh` + `stack-docker.sh` + `check-sh.sh` (CI), ADR-0007 amendment, ROADMAP 6.5. Review FIX r1 → PASS r2; CI shellcheck SC1091 fixed (`# shellcheck source=` + `shellcheck -x`, `811bc8e`). **PR #5 merged `8887adb`.** Worktree removed.

### Slice H — `fix/alembic-fresh-db` (PARALLEL; blocks F and D's ship)
- ✓ 34. H: froze `0001_baseline` to an explicit schema (models @ `95163d9`); `test_migrations.py` covers fresh upgrade, `compare_metadata` parity and round trip, plus Postgres via `OPENAD_TEST_PG_URL`; CONVENTIONS rule added. Opus; PASS r1 (old-path and new-path DDL identical on SQLite and PG16). PR #6 merged `e8a34b8`. Nits (not scheduled): parity doesn't compare server defaults; 0002 isn't ruff-formatted (alembic/ is outside the lint scope).

### Slice F — `feat/gcp-deploy`
- ✓ 25+26. F: ADR-0017 + `docs/deploy-gcp.md` + `MediaStore` (local/GCS, ref validation, cached client) + `openad/health.py` (stdlib liveness listener started only when `PORT` is set; indexer and settler never listened on `$PORT`) + objectUser for the indexer + a service account for the migrate job + WIF attribute-condition. FIX r1 → PASS r2; 80 passed, 4 skipped. `48f84f4`.
- ✓ 27+28. F: api CMD without migrations + compose `migrate`; `web/Dockerfile` + nginx template (5 security headers, CSP per variant, `/healthz`, SPA fallback); `infra/gcp/` (cloudbuild with `_TAG`, services, migrate job); `scripts/deploy-gcp.sh` (prod and CI guards); `deploy.yml` (WIF, push-only same-repo gate, staging only); CI `docker` job. FIX r1 → PASS r2 (real docker build and run of the web image). `279070a`.
- ✓ 29. F ship: PR #7 merged `866d7fe`, all 5 CI jobs green (first real docker build of both images). Worktree removed. Live GCP deploy is user-run.

### Slice G — `docs/launch-polish`
- ✓ 30+31. G: README rewrite, `docs/business/{competitive,demo-script,launch-checklist}.md`, `capture-screenshots.mjs` (pinned epoch, byte-identical; `buy-leased.png` instead of buy-confirmed, so it doesn't depend on I), checklist mainnet row and demo-script fixes. FIX r1 → PASS r2. `23b1c5b`, merged main `f27df3c`; **PR #11 merged `c3f39dc`**. Deferred to 36: README "Coming next" still lists the embed panel and share row, which are now on main.
- → 32+33. G: **merged into step 36.**
### Slice J — `fix/auth-hardening` (after #13; primary tree)
- ✱ 37. J: SIWE domain/URI binding to allowed origins (a strict EIP-4361 parser in `openad/siwe.py`); atomic single-use nonce; auth-table pruning plus migration `0005` indexes; opt-in per-instance auth rate limit with the `trusted_proxy_hops` rule; web `location.host`; the sim signs as the web origin; ADR-0009 amendment; threat model T15/T16; ROADMAP 6.8 `[x]`. **Risk: high. Opus.** **(full spec below)**

### Slice K — `feat/ops-hardening` (after #13; worktree `/home/claude/OpenAd-o`; parallel with 37, merge after it)
- ✓ 38. K: pools at all four `Database(...)` sites (api 4 + 2, indexer and settler 2 + 1, migrate job no pool env); `maxScale` api 4, web and web-demo 10; `max_connections=100` pinned by flag, budget 31 steady / 34 with reserved / ≈64 in a rollout overlap; same-site guard in `deploy-gcp.sh` (`--allow-cross-site-auth`); media hops validated (≤3, https, private and reserved hosts refused outside dev); T17; ROADMAP 6.9 `[x]`. R1 FIX (2 L1) → R2 FIX → R3 (Opus) PASS, L3 only. `4370d09` (base `abb2b81`), **PR #14 open**, CI pending; merges after 37 (the orchestrator merges main in first). api 154 passed / 4 skipped (157 / 1 with PG); `check:sh` and YAML ok. **(as-shipped record below)**

### Slice L — `fix/outbound-fetch-bounds` (**proposed** by the planner 2026-09-25; after #14; the orchestrator decides)
- ○ 39. L: one overall deadline on media fetches and a per-pass budget for indexer verification, so a slow-drip media host can't stall block indexing; the domain meta check releases its DB connection before fetching, is bounded (deadline, body cap, 38's hop rules) and gets a per-slot cooldown; T18. **Risk: medium.** **(compact spec below)** If declined, it goes to Phase 7 with the §8 severity note.

### Final — `chore/launch-final` (after 37, 38 and, if accepted, 39 merge)
- ○ 36. Final (primary tree, off `origin/main`). It covers:
  - ROADMAP: 6.3 `[x]` with a dated amended-acceptance note; 6.6 split into artifacts `[x]` and a new **6.10** live deploy `[ ]` (6.8 and 6.9 come from 37 and 38); 6.7 `[x]`; a Phase 7 backlog.
  - Sourcemaps off; the `PLAYWRIGHT_CHROMIUM_PATH` hook in the main e2e config.
  - Onramp guide page; guide README and SUMMARY.
  - README "What's in the box" (including the hardening and the same-site domain requirement) and two new deterministic screenshots.
  - Business docs (the launch checklist gains the custom-domain, XFF and budget user actions), ARCHITECTURE §7 truth fixes, a scorecard automated-checks section, AGENTS.md pointers.
  - The runbook's DB-password flow (§3/§5) and a DNS TXT truth fix, both routed from 38.
  - The planner archives the plan in the same PR.
  **Risk: low.** **(full spec below, re-sequenced)**

## 5. Active step — full spec

### Step 37 — Auth hardening: SIWE domain binding, atomic nonce use, auth-table pruning, auth rate limit (slice J)

**Where:** the primary tree `/home/claude/OpenAd`, branch `fix/auth-hardening`. The orchestrator
creates it after #13 merges: `git fetch && git switch -c fix/auth-hardening origin/main`. The
uncommitted JIT edits carry over; the coder does **not** stage `.cursor/`.
**Coder model:** **Opus.** **Risk: high.**
- This is the only authentication path for off-chain writes: house ads, domain verification and
  listings.
- A mistake either reopens the hole or locks every publisher out.
- It also touches three clients: web, sim and the api tests.
- It runs in parallel with step 38 (done, PR #14). **Merge 37 first**, then merge main into 38;
  step 38 lists the expected conflicts.

**Amendments (fix round 1; the orchestrator's decisions on the R1 findings, 2026-09-25).** They
supersede the Design and Tests text below where the two differ:
- A1. `parse_siwe` follows the EIP-4361 ABNF strictly: the address line, an empty line, then
  either a statement line and an empty line or, with no statement, a second empty line. viem's
  `createSiweMessage` (2.56.3 in this tree) emits exactly this, and the web, sim and test
  helpers emit the same layout.
- A2. Addresses must be EIP-55 checksummed; an all-lowercase address is rejected.
- A3. Clock skew is ±300 s: `Issued At` ∈ `[now − NONCE_TTL − 300, now + 300]`, and `Not Before`
  ≤ `now + 300`.
- A4. Nonce `[A-Za-z0-9]{8,64}` (64 is the column size); `SiweIn.message` ≤ 4096 characters.
- A5. Pruning runs as two `DELETE` statements (nonces, then sessions).
- A6. A SQLite `before_cursor_execute` test proves the nonce is consumed by one conditional
  `UPDATE`.
- A7. CI: the api job gets a `postgres:16` service and sets `OPENAD_TEST_PG_URL`, so the PG-gated
  tests (migrations, auth) run in CI.

**The vulnerability (confirmed by the planner against the tree):**
- `services/auth.py:31-37` `_parse_siwe` regex-searches the first `0x` address, `Nonce:` and
  `Chain ID:` anywhere in the message. It never checks the EIP-4361 domain line, URI, version or
  timestamps.
- Relay attack:
  1. A phishing site calls our `POST /v1/auth/nonce` server-side.
  2. It asks the victim to sign a well-formed SIWE message for **its own** domain. The wallet
     shows no mismatch, because the domain matches the phishing page.
  3. It POSTs the message and signature to our `/v1/auth/verify`.
  4. Our API accepts it and mints a session for the victim's address. The attacker can then
     edit the victim's house ads and listings.
- Also, the nonce is consumed with a read-then-write (`services/auth.py:51-61`), so two
  concurrent verifies with the same nonce can both pass.
- `POST /v1/auth/nonce` inserts a row per call and nothing deletes used or expired nonces.
  Expired `sessions` rows are deleted only on logout (`services/auth.py:78-84`).
- ADR-0009 has drifted from the implementation. It says the API uses the Python `siwe` library
  and an HMAC cookie payload; the code uses regex parsing and a random server-side session id.

**Read first:**
- `api/src/openad/services/auth.py`, `api/src/openad/routers/auth.py`, `api/src/openad/models/auth.py`.
- `api/src/openad/config.py` (`cors_origins` L43, `cors_origin_list` L75, `is_dev`),
  `api/src/openad/errors.py`, `api/src/openad/main.py` (error handler, CORS).
- `api/tests/test_auth.py` and `api/tests/test_slot_listings.py`. Both build `_siwe()` with
  domain `localhost`, URI `http://localhost:5173` and a **fixed past** `Issued At`, so they must
  change.
- `api/tests/test_migrations.py` and `api/alembic/versions/20260925_0004_slot_listings.py`
  (head `0004_slot_listings`).
- `web/src/features/auth/useSiwe.ts:31-37` (domain = `window.location.hostname`),
  `web/src/lib/permit.ts:42-61` (`buildSiweMessage`), `web/src/lib/permit.test.ts`.
- `sim/src/api.ts:134-150`. The sim signs with domain `'localhost'` and **URI = the API base
  URL**, which the new rules reject. Also `sim/src/siwe.ts` (`siweLooksValid`).
- `docs/adr/0009-siwe-sessions.md`, `docs/threat-model.md` (table ends at T14),
  `docs/ARCHITECTURE.md` (the auth section), `.env.example`, `infra/gcp/services/api.yaml`
  (env block), `docs/deploy-gcp.md`.

**Design**
1. **Strict EIP-4361 parser** in a new `api/src/openad/siwe.py`: pure functions, no DB, no new
   dependency. `parse_siwe(message) -> SiweMessage` (a frozen dataclass).
   - Line 1: `^(?P<domain>[^\s/]+) wants you to sign in with your Ethereum account:$`.
   - Line 2: the address, `^0x[0-9a-fA-F]{40}$`, EIP-55 checksummed only (A2). Store it
     lower-cased.
   - Line 3: empty. Then either a one-line statement and an empty line, or a second empty line
     when there is no statement (A1).
   - Then, in this exact order, exactly once each: `URI: <abs-uri>`, `Version: 1`,
     `Chain ID: <int>`, `Nonce: <[A-Za-z0-9]{8,64}>` (A4), `Issued At: <RFC 3339>`.
   - Optional fields, in the EIP-4361 order: `Expiration Time:`, `Not Before:`, `Request ID:`,
     `Resources:` followed by `- <uri>` lines.
   - Reject unknown or duplicate lines, CR characters, and anything after the last field.
   - Errors raise `UnauthorizedError("malformed SIWE message")`. Keep messages generic.
2. **Validation** in `verify_siwe`, in this order: parse, bind, chain, time, signature, consume
   nonce, create session.
   - **Bind:** the allowed origins are `settings.siwe_origin_list`, a new setting
     `siwe_allowed_origins: str | None`, falling back to `cors_origin_list`.
     - `domain` must equal `urlsplit(origin).netloc` for some allowed origin.
     - The `URI` origin (`scheme://netloc`) must equal that **same** allowed origin.
     - Otherwise `UnauthorizedError("domain not allowed")`.
   - **Chain:** `Chain ID == settings.chain_id` (as today). `Version == "1"`.
   - **Time (A3):** `Issued At` must be within `[now − NONCE_TTL − 300, now + 300]` seconds.
     `Expiration Time`, if present, must be > now. `Not Before`, if present, must be ≤ now + 300.
   - **Signature:** `Account.recover_message(encode_defunct(text=message))` must equal the
     parsed address (as today).
   - **Consume nonce atomically, only after the signature checks out:**
     `UPDATE auth_nonces SET used = true WHERE nonce = :n AND used = false AND created_at >= :now - NONCE_TTL`.
     Require `rowcount == 1`, otherwise `UnauthorizedError("invalid nonce")`. Then insert the
     session in the same transaction.
3. **Clients use the authority, including the port** (EIP-4361 `domain` is an RFC 3986
   authority):
   - `web/src/features/auth/useSiwe.ts`: `domain: window.location.host`, with `uri`
     unchanged (`window.location.origin`).
   - `sim/src/api.ts`: sign as the **web app** origin. Add a sim setting `webOrigin`, default
     `http://localhost:5173` (env `SIM_WEB_ORIGIN`), so domain = its host and uri = that
     origin, not the API base URL.
   - Update `sim/src/siwe.ts` `siweLooksValid` to the new shape.
   - The demo (`demoApi` authVerify) needs no change. Confirm the demo suite still passes.
4. **Auth-table pruning:**
   - `prune_auth(session, now)` deletes `auth_nonces` where `used` or
     `created_at < now − NONCE_TTL`, and `sessions` where `expires_at < now`.
   - Call it from `issue_nonce` at most once per 60 s per process (a module-level monotonic
     timestamp, injectable for tests).
   - Add `index=True` on `AuthNonce.created_at` and `Session.expires_at`, plus a migration
     `20260925_0005_auth_prune_indexes.py`: explicit DDL with `CREATE/DROP INDEX IF (NOT)
     EXISTS` like 0003, and `down_revision = "0004_slot_listings"`. The parity test must stay
     green on SQLite and Postgres (pgserver; JIT_INDEX).
5. **Best-effort auth rate limit** in a new `api/src/openad/ratelimit.py`:
   - A per-process token bucket keyed by client, used as a FastAPI dependency on
     `POST /v1/auth/nonce` and `POST /v1/auth/verify` only.
   - When exceeded: 429 `{"error":"rate_limited","message":…}` with `Retry-After`.
   - Bounded memory: an LRU of at most 10 000 keys.
   - Settings:
     - `auth_rate_limit_per_minute: int = 0` (**0 = disabled**, the default, so local dev and
       any unknown proxy setup are unaffected);
     - `trusted_proxy_hops: int = 0`. The client key is `request.client.host` when it's 0;
       otherwise it's the N-th entry from the **right** of `X-Forwarded-For`, falling back to
       `client.host` if the header is shorter. Spoofed left-side entries must not matter.
   - `infra/gcp/services/api.yaml`: add `OPENAD_AUTH_RATE_LIMIT_PER_MINUTE=30` and
     `OPENAD_TRUSTED_PROXY_HOPS=1` **only if** the coder can confirm from Cloud Run
     documentation that Google's front end appends the real client IP as the right-most
     `X-Forwarded-For` entry for direct Cloud Run ingress. If that can't be confirmed, leave
     both unset (limiter off) and add a `docs/deploy-gcp.md` step: "verify the XFF chain in
     staging logs, then enable".
   - Either way, `deploy-gcp.md` states the limit is per instance and recommends Cloud Armor
     rate limiting on the load balancer for a global limit.
6. **Settings and docs:**
   - `.env.example` gets commented lines for `OPENAD_SIWE_ALLOWED_ORIGINS`,
     `OPENAD_AUTH_RATE_LIMIT_PER_MINUTE` and `OPENAD_TRUSTED_PROXY_HOPS`.
   - `docs/ARCHITECTURE.md` auth section: the binding rule, the pruning, the limiter.
   - `docs/adr/0009-siwe-sessions.md`: an "Amendment (2026-09-25)" that records the actual
     implementation (in-house strict EIP-4361 parser instead of the `siwe` package; a random
     256-bit server-side session id instead of an HMAC payload), the domain/URI binding to
     allowed origins, atomic nonce use, pruning, and the proxy-hops rule. Don't rewrite the
     original decision text.
   - `docs/threat-model.md`:
     - **T15** "SIWE message relayed from another domain": domain and URI bound to allowed
       origins; single-use atomic nonce with a 10-minute TTL; chain id; issued-at window.
     - **T16** "Auth table growth / nonce flooding": pruning plus the per-instance limiter,
       with Cloud Armor recommended.
   - `docs/ROADMAP.md`: add **6.8 "Auth hardening (SIWE binding, nonce/session hygiene)"**
     `[x]` `_Done 2026-09-25._` after 6.7, with pointers and acceptance matching this step.
     Step 38 adds 6.9; step 36 adds 6.10 for the live deploy.

**Tests** (`api/tests/test_auth_hardening.py`, plus updates to the existing helpers)
- Move the `_siwe()` helpers to one shared test helper that uses a fresh `Issued At` and domain
  `localhost:5173`, and update `test_auth.py`, `test_slot_listings.py` and any other user of it.
  Test keys come from `Account.create()`, as today; no keys in `src/`.
- **Relay:** a valid signature, a real nonce and domain `evil.example` with URI
  `https://evil.example` → 401, and the nonce is **still unused**. Also 401 for:
  - URI origin allowed but domain different;
  - domain allowed but URI on another origin;
  - a scheme mismatch (`http` vs `https`);
  - `localhost` without the port while the allowed origin has `:5173`.
  - The allowed origin → 200 plus a cookie.
- **Parser:**
  - reordered fields, a duplicate `Nonce:` or an unknown line → reject;
  - an address inside the statement is ignored (line 2 is authoritative);
  - `Version: 2`, a CRLF message, trailing junk → reject;
  - `Issued At` older than the TTL, or in the future beyond the skew → reject;
  - `Expiration Time` in the past, or `Not Before` in the future → reject;
  - a `Resources:` list parses.
- **Nonce:** a second verify with the same nonce → 401. A direct test of the atomic consume
  shows `rowcount` 0 on reuse, plus the `before_cursor_execute` test (A6).
- **Pruning:** used and expired nonces and expired sessions are removed; live ones stay; the
  throttle means a second call within 60 s doesn't prune; and nonce issuance still works when
  the prune deletes rows.
- **Rate limit:**
  - disabled by default;
  - with 3/min: the 4th request gets 429 and `Retry-After`;
  - independent keys are independent;
  - `hops=0` ignores XFF;
  - `hops=1` uses the right-most entry, so spoofed left entries don't matter;
  - the LRU cap holds;
  - it only applies to the two auth routes.
- **Migrations:** `test_migrations.py` passes with 0005 on SQLite and with `OPENAD_TEST_PG_URL`.
- **Web:** `permit.test.ts` covers a message with host plus port. If a `useSiwe` test exists,
  it asserts `window.location.host`.
- **Sim:** the sim unit tests are updated for `webOrigin`.

**Constraints**
- No keys in `api/` or `web/` source; the AGENTS invariants hold.
- Error bodies use the house style.
- No change to `SameSite=Lax` or `Secure` behaviour.
- No new runtime dependency.
- No behaviour change to non-auth routes.
- Keep `siwe_allowed_origins` unset in `docker-compose*.yml`: the default follows
  `OPENAD_CORS_ORIGINS`.

**Verify**
```bash
cd /home/claude/OpenAd
(cd api && uv run ruff check src tests && uv run ruff format --check src tests && uv run mypy src && uv run pytest -q)
(cd api && OPENAD_TEST_PG_URL=<pgserver url> uv run pytest -q tests/test_migrations.py tests/test_auth.py tests/test_auth_hardening.py)
(cd api && rm -f /tmp/fresh.db && OPENAD_DATABASE_URL=sqlite+aiosqlite:////tmp/fresh.db uv run alembic upgrade head && echo fresh-ok)
npm run typecheck && npm run lint && npm run test && npm run build && npm run build:demo
node web/scripts/check-demo-bundle.mjs
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run test:demo -w e2e
grep -n "_ADDR.search\|_NONCE.search\|_CHAIN.search" api/src/openad/services/auth.py && echo "FAIL old regex parser still used" || echo parser-ok
grep -n "location.hostname" web/src/features/auth/useSiwe.ts && echo "FAIL hostname" || echo host-ok
git status --short   # .cursor/ not staged
```
Optional (docker available): `docker compose up -d`, start the api, run
`npm run sim:once`-style sim sign-in (or `e2e/scripts/smoke-devwallet.mjs`), and confirm a real
SIWE round trip returns 200 from `http://localhost:5173`.

**Done when:**
- A relayed SIWE message for a foreign domain is rejected, and the nonce isn't burned.
- Allowed-origin sign-in works from web, sim and tests.
- Nonce use is atomic.
- Used and expired auth rows are pruned, and 0005 passes parity on SQLite and Postgres.
- The limiter exists, is off by default, and is enabled on Cloud Run only if the XFF semantics
  are confirmed.
- ADR-0009 is amended, T15 and T16 are added, and ROADMAP 6.8 is `[x]`.
- All checks are green. Ship: PR, CI 5/5, merge, **before** 38 and 36.


### Step 38 — Capacity and deploy hardening (slice K): DONE, as-shipped record

**Status:** R3 (Opus) PASS. Commit `4370d09` on `feat/ops-hardening` (base `abb2b81`) in
`/home/claude/OpenAd-o`, pushed; **PR #14** is open with CI pending. After 37 merges, the
orchestrator merges main into it, re-verifies, then merges #14. JIT files are not edited there.
The pre-implementation compact spec is in git history with this plan. The record below is what
shipped, including the orchestrator's amendments.

**Merging after 37** (38's commit checked against 37's working tree at 05:17 UTC):
- Textual conflicts are expected only in two files:
  - `docs/ROADMAP.md`: both insert after L212. Keep 6.8, then 6.9.
  - `docs/threat-model.md`: both insert after the T14 row and after the residual-risk list. Keep
    T15, T16, T17 in order, and every residual line.
- `.env.example`, `config.py`, `main.py`, `docs/ARCHITECTURE.md` and `docs/deploy-gcp.md` are
  edited by both, in separate hunks.
- 38's `Database(url, settings=None)` stays compatible with 37's `Database(PG_URL)` test.
- After the merge, CI's api job also runs the PG-gated tests (37's A7).

**As shipped (spec amendments are the orchestrator's decisions):**
- **Pools:**
  - api: `OPENAD_DB_POOL_SIZE=4`, `OPENAD_DB_MAX_OVERFLOW=2` (the spec said 5/5).
  - indexer and settler: 2 + 1 each.
  - migrate job: **no** pool env, because Alembic's `env.py` opens its own single connection (the
    spec said 1/0).
  - Common: timeout 30 s, recycle 1800 s, and `pool_pre_ping` for non-SQLite; SQLite keeps
    `StaticPool`.
  - `Database(url, settings=None)` is wired at all four sites. It takes a `PoolSettings`
    protocol, so the settler's separate settings class works too.
- **Cloud Run:** api `maxScale` 4; web **and web-demo** `maxScale` 10.
- **Cloud SQL:** runbook §3 creates the instance with `--database-flags=max_connections=100`.
  The pre-deploy check is `gcloud sql instances describe openad-<ENV>
  --format='value(settings.databaseFlags)'`; `psql` can't reach a private-IP instance from a
  laptop.
- **Budget:** 31 connections steady, 34 with Postgres's 3 reserved, and ≈64 during a rollout
  overlap (old and new revisions both up). All of these are under 100.
- **Media hops** (`services/media.py`):
  - At most 3 redirects, followed manually. Every hop must be https (http only in dev).
  - **Outside dev only,** these hosts are blocked:
    - `localhost`, `*.localhost` and `*.internal`;
    - IP literals that are not `is_global`, or are multicast, reserved or `fec0::/10`
      site-local;
    - legacy numeric forms, caught by an `inet_aton` fallback;
    - IPv4-mapped IPv6, which is unwrapped first.
  - Trailing dots are normalised, and hosts with whitespace or control characters are refused.
  - Dev keeps loopback, because the sim serves media from `http://127.0.0.1` (ADR-0012).
  - A malformed URL now gives `failed:fetch`. It used to raise, which starved the indexer's
    verification loop.
- **`scripts/deploy-gcp.sh`:**
  - The same-site guard runs for `--only stack|all`, and `--allow-cross-site-auth` overrides it.
  - `host_of` lowercases and strips userinfo and port. It is bash 3.2 compatible (`tr`, not
    `${x,,}`).
  - Documented limit: it falsely accepts hosts under multi-part public suffixes (`co.uk`,
    `web.app`).
- **Docs and roadmap:** T17 and ROADMAP 6.9 `[x]` as specced; ADR-0017 is amended with the
  budget.

**Checks at `4370d09`:**
- api: ruff, format and mypy clean.
- pytest: 154 passed / 4 skipped; 157 / 1 with PG.
- `bash -n` and `check:sh` (shellcheck) pass; the YAML parses.

**Reviews:**
- R1 FIX:
  - L1: a malformed URL raised and starved verification.
  - L1: blocking loopback in dev broke the sim.
  - L2: the refusal tests didn't catch a broken hop check.
  - L2: hostname and numeric bypasses.
  - L2: the budget was an exact fit with no spare, and its reserved-connections explanation was
    backwards.
  - L2: §8's manual commands were not updated.
- R2 FIX:
  - bash-4 `${u,,}` in `deploy-gcp.sh`;
  - the runbook's `max_connections` check couldn't run against a private-IP instance;
  - a trailing-dot bypass.
- R3: the coder was escalated to Opus. PASS, L3 only (§8).

**Re-verify after merging main** (in `/home/claude/OpenAd-o`):
```bash
(cd api && uv run ruff check src tests && uv run ruff format --check src tests && uv run mypy src && uv run pytest -q)
(cd api && OPENAD_TEST_PG_URL=<pgserver url> uv run pytest -q)
bash -n scripts/deploy-gcp.sh && npm run check:sh
grep -n '^| T1[5-7] ' docs/threat-model.md                  # T15, T16, T17 once each, in order
grep -n '^- \[x\] \*\*6\.[89] ' docs/ROADMAP.md               # 6.8 before 6.9
git diff --name-only origin/main...HEAD | grep '^\.cursor/' && echo "FAIL JIT files on K" || echo jit-ok
```


### Step 39 — Bound outbound fetches (slice L, **proposed**, compact spec)

_Planner finding, 2026-09-25, verified against `4370d09`. Not yet accepted: the orchestrator
decides whether it runs before 36 or goes to Phase 7._

**Where:**
- After #14 merges, on a fresh branch `fix/outbound-fetch-bounds` off `origin/main`, reusing the
  `/home/claude/OpenAd-o` worktree. JIT files are not edited there.
- It reuses 38's `_hop_allowed` and 37's `RateLimitedError`.
- It edits no ROADMAP line (36 records it under 6.9), so 36's coder can start in parallel.
  Merge 39 first.

**Coder model:** Sonnet, with an Opus review. **Risk: medium.** It changes the indexer loop and a
user-facing route. The failure mode is availability, not funds.

**Evidence:**
- **Media verification can stall indexing.**
  - `services/media.py` `fetch_media` only has httpx per-operation timeouts
    (`FETCH_TIMEOUT_S = 10`, applied to each read). A host that sends a small chunk every few
    seconds, and stays under `max_media_bytes` (2 MiB), never times out.
  - `verify_pending` is sequential and runs inline in the indexer's `run_once`
    (`indexer/runner.py:225`), after each block range.
  - Every on-chain `CreativeRegistered` queues a fetch (`indexer/handlers.py:491`), and
    registering a creative is permissionless.
  - So one cheap transaction can stall block indexing indefinitely, and new leases never reach
    serve.
- **The domain meta check can exhaust the api's DB pool.**
  - `services/offchain.py:204` `_check_meta` uses `follow_redirects=True` and reads the whole
    body.
  - It runs inside `POST /v1/slots/{id}/domain-verification?check=true` while the request's
    session holds a pooled connection (`get_session` and `require_slot_owner` have already
    queried).
  - Minting a slot is permissionless, so one wallet can pin all `4 × (4 + 2) = 24` api
    connections with about 24 slow requests.
  - Serve reads the DB on every request (`routers/serve.py`), so it then fails after
    `pool_timeout`. 38's smaller pools make this cheaper.

**Items**
1. `fetch_media`: one overall deadline around connect, every hop and the body
   (`asyncio.timeout`). A new setting, `media_fetch_deadline_seconds: int = 30`; when it's hit,
   return `VERIFY_FAILED_TIMEOUT`.
2. Indexer: `_verify_pending` gets a pass budget (`verify_pass_budget_seconds: int = 20`).
   Creatives it doesn't reach stay pending for the next pass, so indexing resumes after at most
   one budget plus one deadline. Bounded concurrency is Phase 7.
3. `check_domain_verification`: read the domain and token, then end the transaction (commit) so
   no pooled connection is held. Run the network check, then write the result in a new
   transaction.
4. `_check_meta`:
   - https only (http only in dev);
   - redirects followed manually with 38's `_hop_allowed`, at most 3;
   - an overall 10 s deadline;
   - the body streamed, stopping at 256 KiB or at `</head>`.
5. Per-slot cooldown for `check=true`: at most one check per 30 s, based on `last_checked_at`.
   Otherwise 429 `rate_limited` with `Retry-After` (37's `RateLimitedError`).
6. Docs:
   - `docs/threat-model.md` **T18** "Outbound fetch stall (slow-drip media or verification
     host)";
   - ARCHITECTURE's verification paragraph names the deadline and the pass budget;
   - `.env.example` gets the two settings.

**Tests:**
- An httpx `MockTransport` whose body is an async stream that sleeps between chunks, with a
  small deadline, gives `failed:timeout` within the deadline.
- The pass budget stops the loop and leaves the rest pending.
- In prod mode, `_check_meta` refuses an http or private-IP redirect, and stops at the body cap.
- No transaction is open while the check runs (`session.in_transaction()` is False).
- The cooldown returns 429 with `Retry-After`.

**Verify**
```bash
(cd api && uv run ruff check src tests && uv run ruff format --check src tests && uv run mypy src && uv run pytest -q)
(cd api && OPENAD_TEST_PG_URL=<pgserver url> uv run pytest -q)
grep -n "follow_redirects=True" api/src/openad/services/*.py && echo FAIL || echo redirects-ok
```

**Done when:**
- A slow-drip media host costs the indexer at most one deadline per creative, and never blocks
  block indexing for longer than one budget plus one deadline.
- The domain check holds no DB connection during network I/O and is bounded.
- T18 is added.
- All checks are green.
- Ship: PR, CI, merge before 36.


### Step 36 — Launch finalization (replaces 17+18 and 32+33; one branch, one PR, the last step)

_Refreshed 2026-09-25 03:35 UTC against `feat/slot-listings` @ `496422e`, which is what main will
contain once #13 merges. Re-sequenced in the same pass: **36 now runs after the hardening steps
37 and 38 (and 39, if accepted) merge**, so its docs describe the hardened state. Facts refreshed
again after STEP_DONE 38._

**Why merged:** 17+18 (guide, ROADMAP 6.3, ship C) and 32+33 (ROADMAP ticks, README, guide
SUMMARY, qa note, archive) edit the same files: `docs/ROADMAP.md`, `docs/guide/SUMMARY.md` and
`README.md`. Step 16 shipped its own guide page (`docs/guide/publisher/listing.md`, already in
SUMMARY), the glossary term and a 6.3 progress block. What's left is one truthful docs and
polish pass.

**Where:** the primary tree `/home/claude/OpenAd`, branch `chore/launch-final`. The orchestrator
creates it after **37, 38 and (if accepted) 39** have merged: `git fetch && git switch -c chore/launch-final origin/main`. The
planner's JIT edits are uncommitted in the primary tree and carry over, because main's JIT files
equal `35281a3`'s. If git refuses the switch, stash, switch, then pop. The coder does **not**
stage `.cursor/`. The planner's archive commit (item 13) lands in the same PR.
**Coder model:** Sonnet. **Risk:** low.
- It's docs, plus a one-line build flag and a one-line e2e config hook.
- The main risk is ticking or claiming something that isn't on main. Check every tick and every
  README claim against the tree.

**Facts to use as-is:**
- Slot listing: summary ≤140 characters, no URLs; audience ≤600; up to 3 of 12 fixed categories
  (`openad/listing_taxonomy.py`); owner-only `PUT`/`DELETE /v1/slots/{id}/listing`;
  `GET /v1/slots?category=`; labelled "Publisher-provided"; off-chain, not rebuildable from
  chain.
- Buy receipt (step 35): the dialog keeps the signed quote and shows "Lease confirmed", price
  paid, publisher and fee split, tx hash and "View slot".
- Demo: https://claude.ai/artifact/AzkEcWfmUT23GCo2qkWxE7 (v2 from `d5d46a0`). Deck:
  https://claude.ai/artifact/Day12XXUFNi7CJdNpa2MUH. Both are private until the owner shares
  them.
- PRs: #4 A, #5 E, #6 H, #7 F, #8 B, #9 D, #10 C1, #11 G, #12 I, #13 C2, #14 K (38, capacity and
  deploy hardening), then J (37, auth hardening) and L (39) if accepted. Take the numbers from
  `git log`.
- After 37 and 38: SIWE is bound to allowed origins (strict EIP-4361, EIP-55 addresses, ±300 s
  skew); nonce use is atomic; auth rows are pruned; an opt-in per-instance auth rate limit
  exists; **web and api must share a registrable domain** (SameSite=Lax), and `deploy-gcp.sh`
  refuses otherwise unless `--allow-cross-site-auth` is passed; every media redirect hop is
  validated (host blocking applies outside dev only, because the sim uses loopback, ADR-0012).
  ROADMAP 6.8 and 6.9 are `[x]` from those steps.
- Capacity (38, as shipped): pools api 4 + 2, indexer and settler 2 + 1, the migrate job one
  Alembic connection; `maxScale` api 4, web and web-demo 10; Cloud SQL `max_connections=100`
  pinned by flag; budget 31 steady, 34 with 3 reserved, ≈64 during a rollout overlap. Quote
  `docs/deploy-gcp.md` §3 rather than restating numbers from memory.
- DNS TXT domain verification is documented (`docs/ARCHITECTURE.md` L268,
  `docs/guide/marketplace/faq.md` L12) but can't succeed: `dnspython` isn't a dependency, so
  `_check_dns` returns False on ImportError. The web UI only uses the meta tag.
- `docs/deploy-gcp.md` §3 creates the `openad` DB user with
  `--password="$(openssl rand -base64 32)"`, which is never shown or stored, yet §5 needs
  `<PASSWORD>` for `openad-database-url-<ENV>`. Base64 output can also contain `+`, `/` and `=`,
  which break the URL unless percent-encoded.
- `84532.json` and `8453.json` are **not committed**; there has been no testnet deploy.
- `web/dist` currently emits 170 `.map` files and `web/dist-demo` 82. The published demo Artifact
  therefore carries maps too.
- `e2e/playwright.config.ts` has no `PLAYWRIGHT_CHROMIUM_PATH` hook, unlike
  `e2e/demo/demo.config.ts` (L14, L35).

**Read first:**
- `docs/ROADMAP.md` Phase 6: 6.3 has progress blocks from steps 14+15 and 16 and ends "17+18
  finishes this item"; 6.6 has a progress block; 6.7's acceptance.
- `README.md`: the "Coming next" section at L124–128 is now false.
- `docs/business/{README,launch-checklist,demo-script,competitive,market-fit,pitch-deck}.md`.
- `docs/guide/{README,SUMMARY}.md`, `docs/guide/advertiser/{README,buy-a-period}.md`.
- `docs/qa/scorecard.md` (persona-round tables, not a changelog).
- `docs/ARCHITECTURE.md` §7: the environment table says `84532.json`/`8453.json` "(committed)",
  and the "Production (GCP)" row has the wrong cell count.
- `web/vite.config.ts` L94 (`build: { sourcemap: true, … }`) and the embed copy plugin around
  L15–39.
- `embed/vite.config.ts` L9.
- `e2e/demo/capture-screenshots.mjs`, `e2e/playwright.config.ts`, `e2e/demo/demo.config.ts`.
- `AGENTS.md` ("Where things are" table and Commands).
- JIT §8 Backlog (read-only).
- What 37, 38 (and 39) changed, as merged: the ADR-0009 and ADR-0017 amendments,
  `docs/threat-model.md` T15–T17 (T18 with 39), and `docs/deploy-gcp.md` (connection budget,
  `max_connections` flag, same-site domain requirement, rate-limit note).

**Items**
1. **ROADMAP 6.3 → `[x]` `_Done 2026-09-25._`:**
   - Replace the two progress blocks with one "Delivered" paragraph: serve CORS, versioned
     embed script and `EmbedCodePanel` with CMS tabs and badge, `/slots/:id` Share row, static
     OG defaults, slot listings and category filter.
   - Add a short, dated "Acceptance amended" line saying what differs from the original text and
     why:
     - the route is `/slots/:id`;
     - OG is static defaults, with per-slot OG in Phase 7 (needs server or edge rendering);
     - the "publisher profile" shipped per slot as a **listing**, where the site is the slot's
       on-chain domain and there is no separate site-URL field.
   - Drop "17+18 finishes this item".
2. **ROADMAP 6.6, split honestly:**
   - 6.6 becomes **"Deploy artifacts (ADR-0017)"** `[x]`, condensing its progress block.
   - A new **6.10 "Live GCP deployment (user-run)"** stays `[ ]` (6.8 and 6.9 are the
     hardening items from 37 and 38; keep them as they are), with pointers
     `docs/deploy-gcp.md` and `docs/business/launch-checklist.md`. Its acceptance: GCP project
     plus runbook; WIF secrets set; Base Sepolia deploy with `84532.json` committed; staging
     smoke checks pass (`/v1/health`, serve, the embed on a real publisher origin); web and api
     on one registrable domain; the auth rate limit enabled once the XFF chain is verified (if 37
     left it off).
3. **ROADMAP 6.7 → `[x]`** once items 4–11 land. Leave 6.8 and 6.9 (from 37 and 38) as they are,
   except that if 39 merged, 6.9's delivered text gets one line naming the outbound-fetch bounds
   (T18).
4. **ROADMAP Phase 7 — Post-launch backlog**, all `[ ]`, one line each with pointers:
   - per-slot OG (edge or server render);
   - publish `@openad/embed` to npm or a CDN;
   - listing moderation, and clearing or flagging a listing on on-chain slot transfer;
   - listing URL-heuristic gaps (spaced dots, `[.]`, bare IPs, `@handles`, U+00B7), documented
     as accepted for now;
   - SupplyPage `['1']` slot fallback;
   - analytics: neutral CTR hint on CPC slots, advertiser CTR over CPC impressions only, a
     "Booked (upcoming)" tile;
   - migration parity covering server defaults; ruff scope to include `alembic/` (0002 is
     unformatted);
   - the `useSiwe` in-flight race on account switch;
   - a BuyDialog unit test for the BaseError `shortMessage` branch;
   - an independent security audit before mainnet;
   - a global auth rate limit (Cloud Armor on a load balancer) instead of per-instance;
   - DNS-rebinding-safe media fetching (resolve, then pin the IP), the T17 residual;
   - media-fetch and deploy-guard follow-ups from 38: a prod-mode test that public IP literals
     (`8.8.8.8`, `[2001:4860:4860::8888]`, `[::ffff:8.8.8.8]`, `ads.example.`) are accepted;
     `deploy.yml` `--only stack` passing real `API_URL`/`WEB_URL` to the same-site guard; a
     PSL-aware guard (multi-part suffixes such as `co.uk`, `web.app`); `host_of` checked on a
     real macOS bash 3.2;
   - if 39 was declined, the outbound-fetch bounds (JIT §8 severity note); if it merged,
     bounded-concurrency media verification;
   - DNS TXT domain verification (add `dnspython` with a resolver lifetime, or drop the method).
5. **Sourcemaps off by default:** `web/vite.config.ts` gets
   `sourcemap: process.env.VITE_SOURCEMAP === '1'`, with a commented `# VITE_SOURCEMAP=1` line in
   `.env.example`. Leave `embed/vite.config.ts` alone: its maps aren't copied, the plugin writes
   only `open-ad.v1.js`. Confirm the copied file has no dangling `sourceMappingURL`, and strip it
   in the plugin if it does.
6. **Local e2e convenience:** `e2e/playwright.config.ts` honours `PLAYWRIGHT_CHROMIUM_PATH`
   exactly as `demo.config.ts` does. With the variable unset, CI behaviour is unchanged.
7. **Onramp guide page** (6.7 acceptance, blocker 5): `docs/guide/advertiser/getting-usdc-on-base.md`.
   - Plain steps: get USDC on the **Base** network from an exchange or onramp, or bridge.
   - Link **only** to official top-level docs (Base docs, Circle's USDC docs). No affiliate
     links, and no fee, availability or speed claims.
   - A warning to check the network (Base) and the token (native USDC, the one the app uses).
   - Link it from `advertiser/README.md`, `advertiser/buy-a-period.md`, SUMMARY and
     `launch-checklist.md`.
8. **Guide:** SUMMARY gets the onramp page. Every page lives once (embed-code, listing and
   performance are already there). `docs/guide/README.md` gets a "Try the demo" paragraph with
   the demo link and the private note.
9. **README:**
   - Replace "Coming next" (L124–128) with a "What's in the box" list of shipped features:
     LEASE and CPC, analytics, embed code panel and badge, Share row, slot listings with the
     category filter (use the facts above), buy receipt, demo mode, GCP deploy artifacts.
   - Status line: "testnet-ready, not audited; live deploy pending (ROADMAP 6.10)".
   - The deploy section says plainly that web and api must share a registrable domain, linking
     `docs/deploy-gcp.md`.
   - Keep the demo and deck links with the private note.
   - Screenshots: extend `capture-screenshots.mjs` with two shots, keeping the pinned epoch and
     ≤400 KB each. Add them to README if they read better than the current set.
     - `buy-receipt.png`: the step-35 receipt, shot before the dialog closes.
     - `discover-categories.png`: Discover with a category selected and listing badges visible.
10. **Business docs:**
    - `launch-checklist.md`:
      - Move "Publisher growth", "Slot listings" and "sourcemaps" from Next PRs to Done, linking
        PRs #10, #13 and this PR.
      - Add a "Republish demo after this PR (maps removed)" row.
      - Point Next PRs at ROADMAP Phase 7.
      - User actions: add a **custom domain (required: web and api on one registrable domain)**
        row; add "verify the X-Forwarded-For chain in staging, then enable the auth rate limit"
        if 37 left it off; add "confirm `max_connections` ≥ 100 before the first deploy
        (`gcloud sql instances describe openad-<ENV> --format='value(settings.databaseFlags)'`),
        and redo the budget in `docs/deploy-gcp.md` §3 before raising `maxScale` or a pool".
        Keep the existing rows.
    - `demo-script.md`: a 20–30 second receipt beat in the 5- and 15-minute tracks, and a
      Discover category-filter beat in the 15-minute track. Use the real labels.
    - `competitive.md` "Where OpenAd loses today": targeting becomes "self-described slot
      listings and categories; no audience measurement or verification".
    - `market-fit.md`: a dated "Status 2026-09-25" line per adoption blocker naming the PR that
      addressed it. The USDC-only blocker points to the onramp guide; the protocol is unchanged.
    - `pitch-deck.md` Slide 11 "Traction and roadmap": built vs pending (live deploy 6.10, audit),
      honest, with no users or metrics. Note in the commit that the hosted deck must be
      regenerated.
11. **Other docs:**
    - `docs/ARCHITECTURE.md` §7:
      - fix the `84532.json`/`8453.json` cells to "committed once deployed (none yet; ROADMAP 6.10)";
      - make the Production (GCP) line a well-formed row, or move it into the prose below;
      - the Demo column mentions the hosted demo (private note).
    - `docs/qa/scorecard.md`: **do not** add a persona "Round 4" row, since no persona critique
      was run. Add a separate "Automated demo checks (2026-09-25)" section citing
      `e2e/demo/*.spec.ts`: 14 tests, the off-origin guard, the exact-balance and receipt
      assertions, and the listing flow at 60/60 under `--repeat-each=20` from step 16's review.
    - `AGENTS.md`:
      - "Where things are" gets rows for Business docs (`docs/business/`), Demo mode
        (`web/src/demo/`, ADR-0016, `e2e/demo/`) and GCP deploy (`infra/gcp/`,
        `docs/deploy-gcp.md`, `scripts/deploy-gcp.sh`, ADR-0017);
      - Commands gets `npm run build:demo`, `npm run test:demo -w e2e` and
        `npm run capture:screenshots -w e2e`.
      - Nothing else in AGENTS.md changes.
    - `docs/deploy-gcp.md` §3 and §5, the DB password (a pre-existing gap routed from 38's
      review): generate it once into a shell variable, `DB_PASS="$(openssl rand -hex 32)"`
      (URL-safe, never echoed); pass it to `gcloud sql users create`; in the same shell, pipe the
      full URL into `gcloud secrets create openad-database-url-<ENV> --data-file=-`; then
      `unset DB_PASS`. Add a recovery note: `gcloud sql users set-password`, then a new secret
      version.
    - DNS TXT truth fix: `docs/ARCHITECTURE.md` and `docs/guide/marketplace/faq.md` say the meta
      tag is the supported method today and DNS TXT is Phase 7.
12. **No product code** beyond items 5 and 6. If a doc claim is false against main, fix the doc
    and list it in the commit.
13. **Planner, after the coder passes review, in the same PR:**
    - Move `.cursor/JIT_PLAN.md` to `.cursor/jit_history/2026-09-25-market-fit-launch.md` with an
      Outcome section: PR list, demo and deck links, the open user actions (6.10 live deploy,
      custom domain, WIF secrets, Sepolia deploy with `84532.json`, audit, legal), and a Phase 7
      pointer.
    - Refresh `JIT_INDEX.md`.

**Verify**
```bash
cd /home/claude/OpenAd
npm run typecheck && npm run lint && npm run test && npm run build && npm run build:demo
find web/dist web/dist-demo -name '*.map' | grep . && echo "FAIL sourcemaps" || echo no-maps
tail -c 120 web/dist/embed/open-ad.v1.js | grep -q sourceMappingURL && echo "FAIL dangling map ref" || echo embed-ok
node web/scripts/check-demo-bundle.mjs
export PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome
npm run test:demo -w e2e
npm run capture:screenshots -w e2e && sha256sum docs/business/assets/*.png > /tmp/s1 && npm run capture:screenshots -w e2e && sha256sum docs/business/assets/*.png | diff - /tmp/s1 && echo deterministic
find docs/business/assets -name '*.png' -size +400k | grep . && echo "FAIL size" || echo png-ok
npx prettier --check README.md AGENTS.md docs/business/*.md
python3 - <<'PY'   # relative links in README, AGENTS, docs/business, docs/guide resolve
import re,os,sys
bad=[]
files=['README.md','AGENTS.md']+[os.path.join(r,f) for d in ('docs/business','docs/guide') for r,_,fs in os.walk(d) for f in fs if f.endswith('.md')]
for f in files:
    for l in re.findall(r'\]\(([^)#\s]+)', open(f).read()):
        if l.startswith(('http','mailto:')): continue
        if not os.path.exists(os.path.normpath(os.path.join(os.path.dirname(f), l))): bad.append((f,l))
print(bad or 'links ok'); sys.exit(1 if bad else 0)
PY
sed -n '/## Phase 6/,/## Out of scope/p' docs/ROADMAP.md | grep -n "^- \[ \]"   # expect 6.10 + Phase 7 items only
grep -n "Coming next\|in progress on a separate branch\|(committed)" README.md docs/ARCHITECTURE.md && echo "REVIEW stale claims" || echo claims-ok
grep -n 'openssl rand -base64' docs/deploy-gcp.md && echo "REVIEW db password" || echo pw-ok
grep -rniE "sell(s|ing)? (a |the )?slot|trusted by|customers include" README.md docs/business docs/guide && echo REVIEW || echo wording-ok
git status --short   # no .cursor/ staged by the coder; no api/, contracts/ changes
```

**Done when:**
- ROADMAP is truthful: 6.1–6.9 `[x]` (6.3 with a dated amended-acceptance note; 6.8 and 6.9 from
  37 and 38), 6.10 open as user-run, Phase 7 backlog listed.
- `dist` and `dist-demo` contain zero `.map` files.
- The onramp page exists and is linked from 4 places.
- README and business docs describe only shipped features, with deterministic fresh screenshots.
- ARCHITECTURE §7 has no false "committed" claims; the scorecard's automated section is added
  without invented persona verdicts; AGENTS.md pointers are added.
- The runbook's DB-password flow works end to end without echoing the password, and no doc
  claims DNS TXT verification works.
- All checks pass.
- After the planner archives the plan: PR, CI 5/5, merge. Then the orchestrator:
  1. republishes the demo Artifact from main (maps gone; the same URL, so it's still private);
  2. regenerates the hosted deck from `pitch-deck.md` (Slide 11 changed; the same URL);
  3. sends the user the final report: what shipped, demo and deck links with the share
     reminder, and the user actions (6.10 runbook, custom domain, WIF secrets, Sepolia deploy,
     audit, legal).


## 6. Identity fence (unchanged)

Non-custodial api/web; slots leased not sold; one-tx LEASE buy; Marketplace empty after tx;
CampaignVault holds only open `remaining`; serve never reads chain / never proxies advertiser
media; integer USDC; Unix seconds; spec ↔ interface ↔ code in sync; demo mode never touches a
chain or API (D3).

## 7. Log

_Timestamps before 2026-09-25 03:35 were planner estimates (the brief asked for plausible HH:MM); later ones are orchestrator-provided UTC, which is why that entry sorts out of order._

- 2026-09-24 10:40 — Plan created (CREATE). Active: step 1.
- 2026-09-24 11:35 — Step 1 DONE (review FIX r1 → PASS r2; treasury is owner-settable, not immutable — §1 fixed; CPC pays at settle batch). Step 2 moved to G (31b). Active: step 3 ship A. Step 4 spec written; step 7 re-scoped to wagmi mock connector + in-memory EIP-1193.
- 2026-09-24 13:10 — Slice A shipped (PR #4 → `801440e`). Step 4 DONE (FIX r1 → PASS r2, `aafaad7`). Re-paced: adjacent steps merged (5+6, 8+9, 10+11, 12+13, 14+15, 17+18, 19+20, 21+22, 23+24, 25+26, 27+28, 30+31, 32+33); old step 31b folded into 30+31. Active: 5+6.
- 2026-09-24 14:20 — Step 5+6 DONE (FIX r1 → PASS r2, `5204b86`; `auctionOpenAt` clamps at 0, only SlotCard uses it). Found: static/CI builds have empty `generated/deployments` → step 7 adds committed `demo/abis.generated.ts` + synthetic 31337 demo deployment; ABI drift check wired in 12+13. Active: 7.
- 2026-09-24 14:45 — REVISE (parallel track): step 23+24 (slice E) runs alongside 7 in worktree `/home/claude/OpenAd-e` on `feat/bash-stack-scripts` off `801440e`; JIT files stay on slice B's branch. Spec written; verification is static (`bash -n`, `--dry-run`, `check:sh`) since there's no docker daemon.
- 2026-09-24 16:05 — Step 7 DONE (Opus coder, PASS r1, `09d3209`). Slice E PASS; PR #5 open, shellcheck SC1091 fix `811bc8e`, merge pending CI. L3s folded: Google Fonts → 8+9 (demo-only strip); reload-resets-demo → ADR note in 8+9; viem foundry literal whitelist → 12+13. Persona switcher pulled forward from 10+11 into 8+9 (flows need both personas). Active: 8+9.
- 2026-09-24 16:30 — REVISE (parallel track 2): 19+20 (slice D API) in worktree `/home/claude/OpenAd-d` on `feat/analytics`; 21+22 on the same branch after slice B merges. Web OpenAPI types are generated at build time and git-ignored, so there's no conflict. Spec written.
- 2026-09-24 17:40 — Step 8+9 DONE (Opus, PASS r1, `7e5c328`). It also fixed a bug in the shared `Wizard.tsx` that affected real users. Slice D 19+20 is in FIX r1. Active: 10+11 (spec written). Follow-ups: the `useSiwe` race is in the Backlog; running prettier on `web/src/demo` is folded into 12+13; the missing SVG file type is not a bug, because the product is raster-only.
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
- 2026-09-25 03:35 UTC (orchestrator clock) — 16 DONE: R3 PASS, PR #13 open, CI pending. Slice E recorded as merged (#5, `8887adb`). Log order fixed: entries appended after §8 moved back here. 36 refreshed against `496422e`. The refresh adds: 6.3's acceptance differs from what shipped (route `/slots/:id`, static OG only, listings per slot instead of a publisher profile), so 36 ticks it with a dated amended-acceptance note; ARCHITECTURE §7 falsely says `84532.json`/`8453.json` are "committed"; the published demo carries 82 `.map` files, so republish after 36; the scorecard gets a separate automated-checks section, not a fake persona round; AGENTS.md pointers; the main e2e config `PLAYWRIGHT_CHROMIUM_PATH` hook.
- 2026-09-25 03:35 UTC — REVISE on top of STEP_DONE 16: two production-hardening steps added **before** 36, from the orchestrator's evidence, which the planner re-read and confirmed. **37** (slice J, `fix/auth-hardening`, Opus, high): SIWE relay because `_parse_siwe` ignores the EIP-4361 domain and URI; also found a non-atomic nonce consume, and that the sim signs with URI = the API base URL, which the fix will reject, so the sim moves to the web origin; ADR-0009 has drifted from the code (says the `siwe` library and an HMAC cookie). **38** (slice K, `feat/ops-hardening`, medium): pool and scale budget, same-site domain requirement, media redirect hops (the orchestrator's item E fits cleanly there). ROADMAP numbering: 6.8 is J, 6.9 is K, 6.10 is the live deploy (36). The limiter is off by default and enabled on Cloud Run only if the XFF semantics are confirmed. 36 is re-sequenced after 37 and 38.
- 2026-09-25 03:42 UTC — Planner resumed after a context compaction and re-verified the tree. PR #13 merged `abb2b81` (on `origin/main`), so slice C is fully shipped. 37 is coding in the primary tree on `fix/auth-hardening` (Opus) and 38 in `/home/claude/OpenAd-o` on `feat/ops-hardening` (38 marked [>]); both branches are at `abb2b81` with no edits yet. The REVISE edits to the JIT files are uncommitted in the primary tree and ride with J. 38's spec now names its expected merge conflicts with 37 (threat-model rows T15/T16 then T17, ROADMAP 6.8 then 6.9, possibly `main.py`).
- 2026-09-25 05:26 UTC — STEP_DONE 38: R1 FIX (2 L1) → R2 FIX → R3 (Opus) PASS, L3 only; `4370d09`, **PR #14** open, CI pending, merges after 37. The orchestrator's final numbers are recorded as the as-shipped record in §5 (pools 4 + 2 / 2 + 1 / none for the migrate job; `maxScale` api 4, web and web-demo 10; `max_connections=100` by flag; budget 31 / 34 / ≈64; host blocking outside dev only) and as D12. 37's fix-round-1 decisions are recorded as A1–A7 and in D10. Overlap check of 38's commit against 37's working tree: textual conflicts only in `docs/ROADMAP.md` and `docs/threat-model.md`. Routed to 36: the runbook DB-password gap, and a DNS TXT truth fix (found while checking the backlog: `dnspython` isn't a dependency, so DNS verification can't succeed). Planner finding: outbound fetches have per-read timeouts only; the indexer verifies media inline, so one permissionless creative with a slow-drip URL can stall block indexing, and the domain meta check holds a pooled DB connection while it fetches. Proposed as step 39 (slice L) for the orchestrator to accept or defer. Backlog gains 38's L3 and follow-ups.

## 8. Backlog (found during the run; not scheduled)

- Analytics: a CPC slot with impressions but no clicks shows the "not tracked for leases" hint; use a neutral hint instead (web only).
- Analytics: advertiser CTR is diluted by LEASE impressions. It should be CTR over CPC impressions (needs an API field).
- Analytics: a "Booked (upcoming)" tile for leases whose period starts after now, kept separate (needs an API field).
- Slot listing text moderation (moderator role?), after step 16.
- A slot listing survives an on-chain slot transfer, so the new owner inherits text they didn't write, still labelled "Publisher-provided". Clear or flag it on transfer (needs an indexer hook).
- BuyDialog: add a unit test for the BaseError `shortMessage` branch.

- Per-slot Open Graph previews need server-side rendering or an edge function (the SPA can't set crawler-visible meta). Static defaults land in 14+15.
- Publish `@openad/embed` to npm / a CDN (today the web origin hosts `embed/open-ad.v1.js`).

- Web image ships `.map` sourcemaps (170 in `dist`, 82 in `dist-demo`) → **scheduled in 36** (`VITE_SOURCEMAP` gate).
- `20260914_0002_cpc.py` is not ruff-formatted (`alembic/` is outside the lint scope). Consider widening the ruff scope.
- Parity test doesn't compare server defaults (`compare_server_default`).

- `features/auth/useSiwe.ts`: an in-flight SIWE request can race an account switch (real app and demo). Fix with an abort keyed to the account. Candidate for slice C or a small fix PR.
- ~~`web/public/demo/creatives/*.svg` ship in the normal `dist`~~ → fixed in 12+13 (`public-demo`).

- Listing URL heuristic: known accepted gaps (spaced dots, `[.]`, bare IPs, `@handles`, U+00B7) → Phase 7 (36).
- SupplyPage `['1']` slot fallback when the publisher has no slots → Phase 7 (36).
- `e2e/playwright.config.ts` lacks the `PLAYWRIGHT_CHROMIUM_PATH` hook that `demo.config.ts` has (local dev only) → **scheduled in 36**.
- 38 L3: no prod-mode test that public IP literals (`8.8.8.8`, `[2001:4860:4860::8888]`, `[::ffff:8.8.8.8]`, `ads.example.`) are accepted; removing the IPv4-mapped unwrap survives mutation.
- `deploy.yml` `--only stack` passes no `API_URL`/`WEB_URL`, so the example.com placeholders pass the same-site guard. The guard compares two labels (false accept under `co.uk`, `web.app`); a PSL-aware check is Phase 7.
- `host_of` in `deploy-gcp.sh` isn't verified on a real macOS bash 3.2.
- Outbound fetches → **proposed step 39**: no overall deadline on media fetches (hops or body; httpx `timeout=` is per read); the indexer verifies inline and sequentially (`indexer/runner.py:225`); `_check_meta` (`services/offchain.py:204`) follows redirects unchecked, reads the whole body and holds a pooled DB connection during the fetch. Severity if deferred: one permissionless creative registration can stall block indexing, and ~24 slow domain checks can exhaust the api pool (4 × (4 + 2)) so serve fails.
- DNS TXT domain verification can't succeed: `dnspython` isn't a dependency (`_check_dns` returns False on ImportError). The UI only uses the meta tag, but the docs claim both → doc truth fix **scheduled in 36**; the feature goes to Phase 7.
- `docs/deploy-gcp.md` §3 DB password is never shown or stored (and base64 isn't URL-safe) → **scheduled in 36**.
- The remaining unscheduled items above → ROADMAP Phase 7 in 36.
