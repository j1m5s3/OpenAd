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
  - 39 (outbound-fetch bounds) was accepted on 2026-09-25. It starts after #14 merges, runs in
    parallel with 36, and merges before 36.
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
  - Shipped in PR #15. The limiter stays off in `infra/` until the XFF chain is verified in
    staging (runbook steps). Invalid bodies on `/v1/auth/*` get a house-style 422
    `invalid_request`; other routes keep FastAPI's default.
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
- **D13 — Merge order to launch (2026-09-25; amended the same day by the orchestrator).**
  - 39, 40 and 41 are independent: 39 changes the api fetch paths, 40 the web and e2e, and 41
    the api periods route. They merge in whatever order they go green, and each later one
    merges main in first.
  - 36 merges last, after all three. Its post-merge pass (**36b**) merges main in, re-captures
    the screenshots (so Discover shows 40's fix) and replaces `#TBD-36` (= #16). It also records
    39, 40 and 41 in the ROADMAP, because it is the only step that edits the ROADMAP.
  - The planner archives the plan in 36's PR.
  - Expected textual overlaps (predicted from the specs; checked on 2026-09-25 07:40 UTC, see
    the last sub-bullet):
    - `docs/threat-model.md`: 39 adds T18 and 41 adds T19, both after T17. The orchestrator
      restores the T17 → T18 → T19 order when merging.
    - `api/src/openad/routers/slots.py`: 39 changes the domain-verification route and 41 the
      periods route, in separate hunks.
    - `docs/ARCHITECTURE.md` §3.3: 41's cap note and 36's web-origin host rule.
    - `.env.example`: 39's two settings and 36's comments.
    - Checked with `git merge-tree` (no refs, index or tree touched):
      - 36 merges main at `3605473` (with 39) cleanly. It also merges main plus 40 cleanly,
        including when 40 also fixes the capture script, and 41's branch cleanly.
      - Main vs 41 conflicts only in `docs/threat-model.md` (the T18/T19 order). `routers/slots.py`
        and ARCHITECTURE merge automatically.
      - 40 vs 41 is clean.

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
| J Auth hardening (SIWE binding, nonce/session hygiene, rate limit) | `fix/auth-hardening` (#15, merged `2c4101b`) | 6.8 | #13 merged |
| K Capacity and deploy hardening (pool budget, scale caps, same-site, media hops) | `feat/ops-hardening` (#14, merged `5f27fb8`) | 6.9 | #13 merged; merge after J |
| L Outbound-fetch bounds (accepted: indexer media deadline, domain-check fetch) | `fix/outbound-fetch-bounds` (#17, merged `3605473`) | noted under 6.9 by 36b | #14 merged; independent of M and N; merge before Final |
| M Discover and slot-page period state (first-period anchoring) | `fix/discover-auction-state` | noted under 6.7 by 36b | #14 merged; independent of L and N; merge before Final |
| N Periods range cap (accepted) | `fix/periods-range-cap` | noted under 6.9 by 36b | #14 merged; independent of L and M (T19 goes after T17; T18 restored on merge); merge before Final |
| Final: launch finalization (old 17+18 + 32+33) | `chore/launch-final` (draft #16) | 6.3/6.6/6.7 ticks, 6.10, Phase 7 | started after J and K merged; merges last, after L, M and N (post-merge pass 36b) |

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
- ✓ 37. J: SIWE bound to allowed origins (strict EIP-4361 ABNF, EIP-55 only, ±300 s skew, nonce 8–64, message ≤ 4096); atomic single-use nonce; pruning (two DELETEs) plus migration `0005_auth_prune_indexes`; opt-in limiter left off in `infra/` (XFF unconfirmed; runbook verify-then-enable); house-style 422 on `/v1/auth/*`; web and sim use viem's `createSiweMessage`; CI api job runs the full suite on `postgres:16`; ADR-0009 amendment, T15/T16, ROADMAP 6.8 `[x]`. R1 FIX (2 L2) → R2 PASS. `eb8193f` + `2ce0f5b` (JIT), **PR #15 merged `2c4101b`**. api 219/5 (223/1 with PG), web 212, embed 5, sim 13 + 1, test:demo 14/14, YAML e2e 13/13; live uvicorn checks pass. **(as-shipped record below)**

### Slice K — `feat/ops-hardening` (after #13; worktree `/home/claude/OpenAd-o`; parallel with 37, merge after it)
- ✓ 38. K: pools at all four `Database(...)` sites (api 4 + 2, indexer and settler 2 + 1, migrate job no pool env); `maxScale` api 4, web and web-demo 10; `max_connections=100` pinned by flag, budget 31 steady / 34 with reserved / ≈64 in a rollout overlap; same-site guard in `deploy-gcp.sh` (`--allow-cross-site-auth`); media hops validated (≤3, https, private and reserved hosts refused outside dev); T17; ROADMAP 6.9 `[x]`. R1 FIX (2 L1) → R2 FIX → R3 (Opus) PASS, L3 only. `4370d09` (base `abb2b81`), Main merged in as `2f313d9` (conflicts only in ROADMAP and threat-model ordering; checks green); **PR #14 merged `5f27fb8`**. api 154 passed / 4 skipped (157 / 1 with PG); `check:sh` and YAML ok. **(as-shipped record below)**

### Slice L — `fix/outbound-fetch-bounds` (accepted 2026-09-25; after #14; worktree `/home/claude/OpenAd-o`, now removed; merged first, as #17)
- ✓ 39. L: one overall deadline on media fetches (`OPENAD_MEDIA_FETCH_DEADLINE_SECONDS`, 30 s) and a per-pass budget for indexer verification (`OPENAD_VERIFY_PASS_BUDGET_SECONDS`, 20 s); the domain meta check and `POST /v1/creatives/{id}/verify` read, commit, fetch, then write, so neither holds a pooled connection during network I/O; both fetchers read raw bytes (`Accept-Encoding: identity`, `aiter_raw`) under byte caps; `_check_meta` follows ≤ 3 hops under 38's rules with a 10 s deadline and a 256 KiB or `</head>` cap; the per-slot 30 s cooldown is one atomic `UPDATE` (429 `rate_limited`); T18. R1 FIX (2 L1, 3 L2) → R2 FIX (the tests missed their mutations) → R3 FIX (Opus coder; untested `Accept-Encoding`) → R4 PASS. `4bc78c1` + `687dbf4` + `7c11561` (base `2f313d9`), **PR #17 merged `3605473`**; worktree `-o` removed. api 269 passed / 6 skipped (274 / 1 with PG). **(as-shipped record below)**

### Slice M — `fix/discover-auction-state` (added 2026-09-25; worktree `/home/claude/OpenAd-p`; independent of L and N; merges before Final)
- [>] 40. M: Discover's state, SlotCard's timing copy and the slot page's period window follow the open-ended calendar (the next purchasable period, `sale_end`, overlapping windows when `lead > period`) instead of the first period. A unit table plus a brute-force cross-check; demo e2e rows found by their index cell. Web and e2e only; no ROADMAP edit (36b records it). **Coder launched** 2026-09-25 (Sonnet; Opus review) in `/home/claude/OpenAd-p` off `5f27fb8`; committed `50b0285` (observed at 07:40 UTC, not yet reported). `e2e/demo/capture-screenshots.mjs` has the same positional row as `buyFirstPeriod`. 36b item 4 fixes it unless this step's fix round takes it; either way merges cleanly. **Risk: medium.** **(compact spec below)**

### Slice N — `fix/periods-range-cap` (accepted 2026-09-25; worktree `/home/claude/OpenAd-q`; independent of L and M; merges before Final)
- [>] 41. N: cap `GET /v1/slots/{id}/periods` at 60 periods (422 `invalid_window`) and read its leases in one query; T19. Found while speccing 40: one unauthenticated request can hold a pooled DB connection indefinitely. **Accepted.** **Coder launched** 2026-09-25 (Sonnet) in `/home/claude/OpenAd-q` off `5f27fb8`; its Postgres tests use `openad_test_q`, and T19 goes directly after T17. Committed `5f31a5c` + `6b10332` (observed at 07:40 UTC, not yet reported). Merging main (with 39) in conflicts only in `docs/threat-model.md`: restore T17 → T18 → T19. **Risk: low.** **(compact spec below)**

### Final — `chore/launch-final` (started off `2f313d9` in parallel with 39; merges last, after 39, 40 and 41)
- ✓ 36. Final, coder rounds 1–2 (primary tree, `chore/launch-final` off `2f313d9`, **draft PR #16**, so `#TBD-36` = #16). R1 FIX → fix round 1 → **R2 FIX**. All R1 findings are resolved, and the runbook's IAM grants now match every secret. The orchestrator folded the R2 leftovers into 36b instead of running another round now. It covers:
  - ROADMAP: 6.3 `[x]` with a dated amended-acceptance note; 6.6 split into artifacts `[x]` and a new **6.10** live deploy `[ ]` (6.8 and 6.9 come from 37 and 38); 6.7 `[x]`; a Phase 7 backlog.
  - Sourcemaps off; the `PLAYWRIGHT_CHROMIUM_PATH` hook in the main e2e config.
  - Onramp guide page; guide README and SUMMARY.
  - README "What's in the box" (including the hardening and the same-site domain requirement) and two new deterministic screenshots.
  - Business docs (the launch checklist gains the custom-domain, XFF and budget user actions), ARCHITECTURE §7 truth fixes, a scorecard automated-checks section, AGENTS.md pointers.
  - The runbook's DB-password flow (§3/§5) and a DNS TXT truth fix (routed from 38); the web-origin host rule and a stale `api/README.md` (routed from 37).
  **Risk: low.** **(full spec below; its post-merge parts moved to 36b)**
- ○ 36b. Final, post-merge pass. Same branch and PR; it starts once 40's and 41's PRs merge (39's already has). It covers:
  - merge main; `#TBD-36` → #16;
  - cite #17 and the 40/41 PRs in the ROADMAP (6.7, 6.9, Phase 7), README and the launch checklist;
  - 36's R2 leftovers;
  - rebase the GTM launch plan on launch actions, with deck Slide 10 to match;
  - the capture script finds the bought row by its index cell (the positional `nth()` breaks after 40), and `buy-leased.png` shows what its comment claims;
  - re-capture the screenshots.
  Sonnet, with an Opus review. Then the planner's CLOSE archive lands in the same PR, and the orchestrator ships. **Risk: low.** **(spec below)**

## 5. Active step — full spec

### Step 37 — Auth hardening (slice J): DONE, as-shipped record

**Status:** R2 PASS. Commits `eb8193f` (feature) and `2ce0f5b` (JIT files) on
`fix/auth-hardening`, base `abb2b81`, pushed. **PR #15 merged as `2c4101b`.** The full pre-implementation spec is in git history
(`2ce0f5b`). The record below is what shipped, including the fix-round-1 amendments.

**As shipped** (beyond the original spec, per the orchestrator's amendments):
- **Parser** (`api/src/openad/siwe.py`):
  - strict EIP-4361 ABNF layout (two empty lines when there is no statement);
  - EIP-55 addresses only;
  - statement, URI and Request ID character sets tightened to EIP-4361 / RFC 3986;
  - nonce `[A-Za-z0-9]{8,64}`; `SiweIn.message` ≤ 4096 characters.
- **Binding:** `domain` must be the authority of an allowed origin, and `URI` must have that
  same origin. Allowed origins come from `OPENAD_SIWE_ALLOWED_ORIGINS`, falling back to
  `OPENAD_CORS_ORIGINS`. Clock skew is ±300 s.
- **Nonce:** consumed by one conditional `UPDATE`, only after the signature checks out. A SQLite
  `before_cursor_execute` test proves it.
- **Pruning:** two `DELETE`s, throttled from `issue_nonce`; migration `0005_auth_prune_indexes`.
  The `created_at` range uses `ix_auth_nonces_created_at`; the `used` delete seq-scans
  (documented).
- **Errors:** any invalid body on `/v1/auth/*` gives a house-style 422 `invalid_request`
  (`InvalidRequestError`). Other routes keep FastAPI's default body, verified byte-identical on
  17 non-auth error cases.
- **Clients:**
  - Web `permit.ts` and the sim build messages with viem's `createSiweMessage`.
  - The web signs with `window.location.host`.
  - The sim signs as `OPENAD_SIM_WEB_ORIGIN` (default `http://localhost:5173`).
  - The demo nonce is `demo…`, because viem rejects hyphens.
- **Rate limit:** opt-in and per instance. It stays **off** in `infra/` because Cloud Run's
  right-most XFF semantics are unconfirmed. `docs/deploy-gcp.md` has verify-then-enable steps,
  run with max-instances=1 during the test.
- **CI:** the api job gets a `postgres:16` service and a "pytest with Postgres" step that runs
  the full suite.
- **Docs:** ADR-0009 amendment, T15 and T16, the ARCHITECTURE auth section, `.env.example`,
  ROADMAP 6.8 `[x]`.

**Checks** (coder and reviewer, same tree):
- api: ruff, format and mypy clean; pytest 219 passed / 5 skipped; 223 / 1 with
  `OPENAD_TEST_PG_URL`; a fresh `alembic upgrade head` works.
- npm: typecheck, lint, test (web 212, embed 5, sim 13 + 1 skipped), build, build:demo,
  check-demo-bundle, CI prettier and `check:sh` pass. test:demo 14/14; main YAML e2e 13/13 (on a
  throwaway config, since deleted).
- Live uvicorn:
  - The web builder and the sim as `localhost:5173` and `127.0.0.1:5173` get 200 plus a cookie.
  - The API's own origin and `evil.example` get 401.
  - A client clock 4 min fast or 14 min behind passes; 6 min fast or 16 min behind is refused.
  - A 4096-character message gets 200; 4097 gets a house-style 422.
  - The limiter returns 429 with `Retry-After`.

**Reviews:**
- R1 FIX:
  - L2: the atomic consume was tested only on PG, which CI didn't run.
  - L2: the parser accepted non-ABNF layouts and lowercase addresses, which defeats wallet-side
    SIWE detection.
  - L3s: the prune's `OR` defeated the index; the XFF test needs one instance; nonce and message
    caps; ±60 s skew was too tight.
- R2 PASS. The remaining L3s are in §8 (Phase 7).

**Routed to 36:**
- viem's host rule for the web origin (in 36's facts);
- the stale `api/README.md`;
- `OPENAD_SESSION_SECRET`, which no code reads (Phase 7).


### Step 38 — Capacity and deploy hardening (slice K): DONE, as-shipped record

**Status:** R3 (Opus) PASS. Commit `4370d09` on `feat/ops-hardening` (base `abb2b81`) in
`/home/claude/OpenAd-o`, pushed; Main was merged in as `2f313d9`
(conflicts only in ROADMAP and threat-model ordering; all checks green), and **PR #14 merged as
`5f27fb8`**. JIT files are not edited there.
The pre-implementation compact spec is in git history with this plan. The record below is what
shipped, including the orchestrator's amendments.

**Merging after 37** (done in `2f313d9`; predicted from 37's working tree at 05:17 UTC):
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


### Step 39 — Bound outbound fetches (slice L): DONE, as-shipped record

**Status:** R4 PASS, after 4 review rounds. Branch `fix/outbound-fetch-bounds`, base
`2f313d9`, head `7c11561`. **PR #17 merged as `3605473`** (seen on `origin/main` at 07:40 UTC;
the orchestrator reported CI pending, merging when green). The `/home/claude/OpenAd-o` worktree
is removed. The full pre-implementation spec is in git history (`f7db32c`).

**Commits:**
- `4bc78c1`: fix round 1 checkpoint.
- `687dbf4`: round 2, so the tests catch their mutations.
- `7c11561`: round 3, so the domain check asserts `Accept-Encoding: identity`.

**Files:**
- `.env.example`;
- `api/src/openad/{config.py, errors.py, routers/slots.py, services/media.py,
  services/offchain.py}`;
- `api/tests/{test_domain_verification.py (new), test_media.py}`;
- `docs/ARCHITECTURE.md` §3.5/§3.6;
- `docs/threat-model.md` T18.

**As shipped:** items 1–6 of the spec, plus F1–F4 from fix round 1:
- media fetches have one overall deadline (`OPENAD_MEDIA_FETCH_DEADLINE_SECONDS`, 30 s);
- indexer verification has a per-pass budget (`OPENAD_VERIFY_PASS_BUDGET_SECONDS`, 20 s);
- the domain meta check, and `POST /v1/creatives/{id}/verify`, read, then commit, then fetch,
  then write, so neither holds a pooled DB connection during network I/O;
- both fetchers send `Accept-Encoding: identity` and read with `aiter_raw` under byte caps, and
  fail closed if a server ignores it;
- `_check_meta` follows redirects manually under 38's hop rules, with a deadline and a body cap;
- the per-slot cooldown is one atomic conditional `UPDATE`, answered with 429 `rate_limited`.

**Reviews:**
- R1 FIX:
  - L1: creative verify pinned the pool.
  - L1: `_check_meta` had an O(n²) scan and allowed gzip bombs.
  - L2: the cooldown had a race.
  - L2: T18 had errors.
  - L2: the deadline had no test.
- R2 FIX:
  - L2: the slow-drip test passed without the deadline.
  - L2: the body-cap test lost its mutation.
  - L3: the media header assert was swallowed.
  - L3: wording.
- R3 FIX (the coder was escalated to Opus). L2: `_check_meta`'s `Accept-Encoding` header is
  load-bearing but untested; without it most real hosts gzip, and verification quietly fails.
- R4 PASS. Mutations (a)–(e) are all caught, and the timing tests are stable at about a quarter
  of a core.

**Checks:**
- ruff, format (src and tests) and mypy clean.
- pytest 269 passed / 6 skipped; with PG (`openad_test`) 274 passed / 1 skipped.

**Residuals, recorded in T18:**
- no per-address or per-session limit on creative verify (Phase 7);
- no per-pass fetch concurrency (Phase 7, already 7.14);
- DNS rebinding stays with T17 (7.12).

**Backlog notes** (§8; 36b records them in ROADMAP 7.7 and 7.14):
- an unscoped `ruff format --check` flags `0002_cpc.py` (known, 7.7);
- prettier table alignment already fails at base on `ARCHITECTURE.md` and `threat-model.md`,
  and CI doesn't check docs;
- code comments cite "step 39", which only the archive's step → PR map resolves.


### Step 40 — Discover and slot-page period state follow the open-ended calendar (slice M, compact spec)

_Added by the orchestrator on 2026-09-25, from 36's review: the demo labels slot 0 "Ended" while
period 4 is buyable. The planner verified it against `5f27fb8` and widened it to the slot page's
period window, which is anchored to the first period in the same way._

**Where:**
- Worktree `/home/claude/OpenAd-p`, branch `fix/discover-auction-state`, off `origin/main`
  (`5f27fb8`).
- It touches only `web/` and `e2e/demo/` (code, tests, fixtures). It edits no ROADMAP line; 36
  records it.
- Merge order (D13, amended): 39, 40 and 41 merge in whatever order they go green, each later
  one merging main in first; 36 merges last.

**Coder model:** Sonnet, with an Opus review. **Risk: medium.** The state drives the Discover
filter, the featured row, the SlotCard copy and the slot page's buy list. A wrong rule hides
buyable inventory or offers closed periods.

**Evidence** (at `5f27fb8`):
- **Discover state:**
  - `web/src/lib/auction.ts:47-58` `auctionState` looks only at `firstPeriodStart`. It returns
    `'ended'` once `now ≥ firstPeriodStart + periodSeconds`.
  - But PROTOCOL §4.1 says periods are unbounded upward
    (`start(i) = first_period_start + i·period_seconds`). The horizon is bounded only by
    `lead_seconds` and, optionally, `sale_end`: `buy` requires `end ≤ sale_end` when it is
    non-zero.
  - So in production every slot reads "Ended", and drops out of the Live filter, one period
    after launch.
- **Callers:**
  - `SlotCard.tsx:12-13` shows the badge, and its "live in …" and "period starts …" copy also
    use the first period (via `auctionOpenAt` and `firstPeriodStart`).
  - `DiscoverPage.tsx:46,51` uses it for the filter and the featured row.
  - The existing unit test (`auction.test.ts:52-58`) encodes the bug.
- **Slot page:**
  - `usePeriods` calls `api.listPeriods(slotId)` with the default `from=0, to=14`
    (`lib/api.ts:95`).
  - Once a calendar is 15 periods old, the page lists only closed periods. `nextOpenPeriod` is
    then undefined, so the page falls back to the generic "Advertise here" copy, and nothing can
    be bought from the UI.
- **The rule to mirror:** `api/src/openad/services/periods.py` (`list_periods`, `dutch_price`),
  which follows PROTOCOL's `buy` checks:
  - no terms, or `lead_seconds == 0` → not sellable;
  - paused;
  - `sale_end ≠ 0 and end > sale_end` → beyond sale end;
  - leased;
  - `now < max(0, start − lead)` → not open;
  - `now ≥ end` → closed;
  - otherwise Dutch before `start`, remainder after.

**Items**
1. **`lib/auction.ts`: a calendar-aware `auctionStatus(slot, now)`.** It returns
   `{ state, current?, next?, opensAt?, startsAt?, endsAt? }`. Keep `auctionState(slot, now)` as
   a thin wrapper.
   - Notation: `P = periodSeconds`, `S0 = firstPeriodStart`, `L = leadSeconds`, `E = saleEnd`,
     `start_k = S0 + k·P`, `end_k = start_k + P`, `open_k = max(0, start_k − L)`.
   - Checked first:
     - no terms, or LEASE with `L ≤ 0` → `'no terms'` (today, no terms reads `'paused'`);
     - CPC → `'cpc'`;
     - paused → `'paused'`;
     - `calendarVersion == 0`, or `S0`/`P` null → `'no calendar'`.
   - Then:
     - `kLast = E == 0 ? ∞ : floor((E − S0) / P) − 1`, the last period with `end_k ≤ E`.
     - `cur = now ≥ S0 ? floor((now − S0) / P) : −1`, and `next = cur + 1`.
     - `'ended'` iff `E ≠ 0` and (`kLast < 0` or `now ≥ end_kLast`). A slot with `E == 0` is
       never `'ended'`.
     - `'live'` iff `next ≤ kLast` and `now ≥ open_next`: the next period's Dutch window is open.
       With `L > P`, later windows are open too, and `next` is still the soonest start.
     - `'remainder'` iff `cur ≥ 0` (so `cur ≤ kLast`) and not live.
     - `'upcoming'` otherwise (`now < open_0`).
   - SlotOut has no lease data, so the state describes the schedule, not whether a period is
     sold. Say so in the doc comment; the slot page's list shows what's unsold.
2. **`SlotCard` copy**, taken from the status:
   - upcoming → "live {formatTimeLeft(open_0)}";
   - live → "period starts {formatTimeLeft(start_next)}";
   - remainder → "next auction {formatTimeLeft(open_next)}" when `next ≤ kLast`, otherwise
     "final period ends {formatTimeLeft(end_cur)}".
   - Remove the first-period `auctionOpenAt`, or re-implement it on the status. Its only
     caller is SlotCard.
3. **Slot page:** request the window around now.
   - `from = max(0, cur)` (the current period first; also showing one earlier period is fine),
     and `to = from + 14`. Put `from` in the query key.
   - "Next open period" and the "Advertise here" copy then come from real, current periods.
4. **Tests:**
   - A table in `auction.test.ts`:
     - `E = 0` at `k = 0, 1, 1000` never ends;
     - `L < P` gives remainder, then live, within one period;
     - `L == P` (the demo's case) is always live after `open_0`;
     - `L > P` (e.g. 2.5·P) is live;
     - `E` with `kLast`, and `E < S0 + P` → ended;
     - boundaries: `now == open_next` → live, `now == start_k`, and `now == end_kLast` → ended;
     - `open_0` saturating at 0;
     - paused, CPC, no terms, `L = 0`, no calendar.
     - Replace the test that encodes the bug.
   - A brute-force cross-check: for random `(S0, P, L, E, now)`, enumerate the periods with the
     per-period rule above (what `services/periods.py` does, minus leases) and compare the
     derived state.
   - A slot-page test that the periods request starts at the current index.
5. **Demo and e2e:**
   - Fixtures stay relative to `demoNow()`. With `L == P == DAY`, slots 0, 2 and 4 now read
     "live"; slot 5 is paused, and slots 1 and 3 are CPC.
   - Add a demo e2e assertion that slot 0's card is live (the reviewer's case).
   - `flows.spec.ts` `buyFirstPeriod` finds rows by position (`tbody tr` `.nth(periodIndex)`),
     which breaks once the list stops starting at period 0. Find rows by their index cell
     instead, as the period-3 test already does.
   - Run test:demo, and the YAML scenarios that click the state filters
     (`gen1-discover-filters`, `gen4-ended-filter`) if docker is up.

**Verify**
```bash
cd /home/claude/OpenAd-p
npm run typecheck && npm run lint && npm run test && npm run build && npm run build:demo
node web/scripts/check-demo-bundle.mjs
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run test:demo -w e2e
grep -rn "firstPeriodStart" web/src/components web/src/features --include='*.tsx' && echo "REVIEW first-period logic in UI" || echo ui-ok
git status --short   # web/ and e2e/ only
```

**Done when:**
- No UI state is derived from the first period alone.
- Slots with `E == 0` never read "Ended".
- The slot page lists the current window, whatever the calendar's age.
- The table, cross-check, slot-page and demo e2e tests are green.
- Ship: PR, CI, merge before 36 (merging main in first if 39 or 41 merged before it).


### Step 41 — Cap the periods range (slice N, accepted, compact spec)

_Planner finding while speccing 40, verified against `5f27fb8`. **Accepted** by the orchestrator
on 2026-09-25._

**Evidence:**
- `GET /v1/slots/{id}/periods` (`routers/slots.py:38-50`) takes `from` and `to` with only `ge=0`.
- `services/periods.py` then loops over `range(from, to + 1)`, with one `session.get(Lease, …)`
  per index.
- So one unauthenticated request with `to=1000000000` holds a pooled DB connection, and builds an
  unbounded list, until the process dies.
- About 24 such requests take every api connection (38's budget), and serve fails.

**Where** (the orchestrator's override, 2026-09-25):
- It runs now, in parallel with 39 and 40, in a new worktree `/home/claude/OpenAd-q` on branch
  `fix/periods-range-cap` off `origin/main` (`5f27fb8`), with the api venv synced.
- Its Postgres tests use a separate database, `openad_test_q`, on the same pgserver socket, so
  they don't collide with 39's `openad_test`.
- 39's T18 isn't on that base, so 41 adds T19 directly after T17. The orchestrator restores the
  T17 → T18 → T19 order when merging.
- api and docs only. No ROADMAP edit; 36 records it under 6.9.
- It merges in whatever order it goes green relative to 39 and 40 (D13), merging main in first
  if another merged before it, and always before 36.

**Coder model:** Sonnet. **Risk: low.** The callers ask for 15 periods (web, after 40), 8 (sim)
and 5 (sim planner), all under the cap.

**Items**
1. Reject ranges wider than 60 periods (`to − from + 1 > 60`) with a house-style 422. Reuse the
   analytics `InvalidWindowError` (`invalid_window`). Keep the defaults.
2. Replace the per-index lease reads with one query over
   `(slot_id, calendar_version, period_index BETWEEN from AND to)`.
3. Tests:
   - 60 is accepted and 61 → 422;
   - leases in the range are still reported;
   - optionally, the query count no longer grows with the range.
4. Docs:
   - ARCHITECTURE §3.3 notes the cap;
   - `docs/threat-model.md` gets **T19** "Unbounded work per request".

**Verify:** api ruff, format and mypy, plus pytest (also with `OPENAD_TEST_PG_URL` pointing at
`openad_test_q`).

**Done when:**
- The cap and the single query are in, and T19 is added.
- Checks are green.
- Ship: PR, CI, merge before 36.


### Step 36 — Launch finalization (replaces 17+18 and 32+33; one branch, one PR, the last step)

_Refreshed 2026-09-25 03:35 UTC against `feat/slot-listings` @ `496422e`, which is what main will
contain once #13 merges. Re-sequenced in the same pass: **36 starts after the hardening steps
37 and 38 merge, and merges after 39, 40 and 41**, so its docs describe the
hardened state. Facts refreshed again after STEP_DONE 37 (39 accepted) and the 40/41 REVISE._

_The post-merge work is now **36b** (below): item 3's 39/40/41 lines, item 13 and the
post-merge "Done when" bullets. 36b supersedes them where they differ._

**Progress (rounds 1–2, 2026-09-25).** Coded on `chore/launch-final` off `2f313d9`; draft **PR #16**.
- R1 FIX, L1s:
  - the `gcloud sql users set-password` syntax is wrong;
  - the onramp guide falsely says the app shows the USDC address;
  - regenerated screenshots inherit a scroll offset;
  - `docs/GLOSSARY.md` still claims DNS TXT verification.
- R1 FIX, L2s:
  - the host-rule note names `VITE_API_URL`;
  - `VITE_SOURCEMAP` in `.env` does nothing, because it is a shell variable at build time;
    document it that way;
  - 6.7's acceptance needs a dated amended note.
- New deploy bug, in scope (runbook only): §5 grants the settler no `secretAccessor` on
  `openad-database-url-<ENV>`, so the settler can't start.
- Shipped beyond the spec so far:
  - a latent capture-script bug: after a LEASE buy it waited for the CPC-only "Confirmed on
    chain"; it now waits for "Lease confirmed";
  - stale ARCHITECTURE §5 claims ("6.2 in progress", "SPA fallback").
- `#TBD-36` placeholders stand for this PR's number, **#16**; 36b replaces them.
- R2 FIX: all R1 findings are resolved, and the runbook's IAM grants now match every secret.
  - The leftovers are the L2 on 6.9's PR citation and the L3s in 36b items 3 and 4, two of them
    pre-existing runbook issues. They fold into **36b**, together with the orchestrator's GTM
    rebase: one coder round after 39, 40 and 41 merge, rather than a round now.

**Why merged:** 17+18 (guide, ROADMAP 6.3, ship C) and 32+33 (ROADMAP ticks, README, guide
SUMMARY, qa note, archive) edit the same files: `docs/ROADMAP.md`, `docs/guide/SUMMARY.md` and
`README.md`. Step 16 shipped its own guide page (`docs/guide/publisher/listing.md`, already in
SUMMARY), the glossary term and a 6.3 progress block. What's left is one truthful docs and
polish pass.

**Where:** the primary tree `/home/claude/OpenAd`, branch `chore/launch-final`. The orchestrator
creates it after **#15 (37) and #14 (38)** have merged, while 39 runs in `/home/claude/OpenAd-o`:
`git fetch && git switch -c chore/launch-final origin/main`. After 39, 40 and 41 merge
(in any order, D13), merge main into `chore/launch-final`, re-run `capture:screenshots` (40 changes Discover's
labels) and re-verify. The planner's later JIT edits are uncommitted in the primary
tree and carry over, because main's JIT files will equal `2ce0f5b`'s once #15 merges (#14 and 39
don't touch `.cursor/`). If git refuses the switch, stash, switch, then pop. The coder does **not**
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
- PRs: #4 A, #5 E, #6 H, #7 F, #8 B, #9 D, #10 C1, #11 G, #12 I, #13 C2, #15 J (37, auth
  hardening), #14 K (38, capacity and deploy hardening), #17 L (39, outbound-fetch bounds, merged
  `3605473`), and #16 is this PR. M (40) and N (41) get their numbers when they open. Take the
  numbers from `git log --merges origin/main`.
- After 37 and 38:
  - SIWE is bound to allowed origins (strict EIP-4361 built with viem's `createSiweMessage` on
    web and sim, EIP-55 addresses, ±300 s skew); nonce use is atomic; auth rows are pruned.
  - Invalid bodies on `/v1/auth/*` get a house-style 422 `invalid_request`.
  - The opt-in per-instance auth rate limit exists but is **off** in `infra/`, because the XFF
    chain is unverified. `docs/deploy-gcp.md` has the verify-then-enable steps (max-instances=1
    during the test).
  - CI's api job runs the full suite against Postgres.
  - **Web and api must share a registrable domain** (SameSite=Lax). `deploy-gcp.sh` refuses
    otherwise unless `--allow-cross-site-auth` is passed.
  - Every media redirect hop is validated. Host blocking applies outside dev only, because the
    sim uses loopback (ADR-0012).
  - ROADMAP 6.8 and 6.9 are `[x]` from those steps.
- 39 (PR #17, merged `3605473`): media fetches have one overall deadline, and indexer verification has a
  per-pass budget. The domain meta check, and `POST /v1/creatives/{id}/verify`, hold no DB
  connection while they fetch. Both fetchers read raw bytes with `Accept-Encoding: identity`. The
  meta check is bounded and has a per-slot cooldown (T18).
- 40 (merges before 36): Discover's state, SlotCard's timing copy and the slot page's period
  window follow the open-ended calendar. Before 40, every slot read "Ended" one period after its
  first. Demo slots 0, 2 and 4 now read "live".
- 41 (merges before 36): `GET /v1/slots/{id}/periods` accepts at most 60
  periods per request (T19).
- Web-origin host rule: viem's `createSiweMessage` rejects IPv6 literals and single-label hosts
  other than `localhost` (e.g. `devbox:5173`, `LOCALHOST:5173`). So the web origin must be
  `localhost`, an IPv4 address or a dotted hostname.
- `api/README.md` is stale:
  - its migration list stops at `0002_cpc`;
  - it says `api/Dockerfile` migrates on start, but slice F moved migrations to the compose
    `migrate` service and the Cloud Run Job.
- Capacity (38, as shipped): pools api 4 + 2, indexer and settler 2 + 1, the migrate job one
  Alembic connection; `maxScale` api 4, web and web-demo 10; Cloud SQL `max_connections=100`
  pinned by flag; budget 31 steady, 34 with 3 reserved, ≈64 during a rollout overlap. Quote
  `docs/deploy-gcp.md` §3 rather than restating numbers from memory.
- DNS TXT domain verification is documented (`docs/ARCHITECTURE.md`, in the domain-verification
  paragraph; `docs/guide/marketplace/faq.md` L12) but can't succeed: `dnspython` isn't a dependency, so
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
  `docs/threat-model.md` T15–T19 (T18 from 39, T19 from 41), and `docs/deploy-gcp.md` (connection budget,
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
     on one registrable domain; the auth rate limit enabled once the XFF chain is verified (37
     left it off; follow the runbook's verify-then-enable steps).
3. **ROADMAP 6.7 → `[x]`** once items 4–11 land. Leave 6.8 and 6.9 (from 37 and 38) as they are,
   except for these delivered-text lines:
   - 6.9 names 39's outbound-fetch bounds (T18) and 41's periods range cap (T19);
   - 6.7 gets a dated line for 40 (Discover and the slot page follow the open-ended calendar).
   All of them merge before 36.
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
   - bounded-concurrency media verification (39 bounds each fetch and each pass);
   - auth follow-ups from 37:
     - a test that percent-encoded URIs and resources are accepted;
     - OpenAPI still documents FastAPI's 422 shape for `/v1/auth/verify`;
     - rename `openad.errors.InvalidRequestError`, which clashes conceptually with SQLAlchemy's;
     - cap `SiweIn.signature` (about 256);
     - `OPENAD_SESSION_SECRET` is read by no code: drop it or use it;
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
        (37 left it off; link the runbook steps); add "confirm `max_connections` ≥ 100 before the first deploy
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
    - Web-origin host rule (routed from 37), in three places:
      - ARCHITECTURE §3.3;
      - `.env.example`, next to `OPENAD_CORS_ORIGINS` and `OPENAD_SIWE_ALLOWED_ORIGINS`;
      - `docs/deploy-gcp.md` §9.
      The web origin must be `localhost`, an IPv4 address or a dotted hostname.
    - `api/README.md`:
      - bring the migration list up to date (0001–0005);
      - replace the "Dockerfile runs `alembic upgrade head`" line with the compose `migrate`
        service and the Cloud Run Job.
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
  37 and 38, and 6.9 also names 39), 6.10 open as user-run, Phase 7 backlog listed.
- `dist` and `dist-demo` contain zero `.map` files.
- The onramp page exists and is linked from 4 places.
- README and business docs describe only shipped features, with deterministic fresh screenshots.
- ARCHITECTURE §7 has no false "committed" claims; the scorecard's automated section is added
  without invented persona verdicts; AGENTS.md pointers are added.
- The runbook's DB-password flow works end to end without echoing the password, and no doc
  claims DNS TXT verification works.
- The web-origin host rule is documented, and `api/README.md` matches the tree.
- After merging main (39, 40 and 41): the screenshots are re-captured (Discover
  shows 40's labels) and deterministic, and the ROADMAP names 39, 40 and 41.
- All checks pass.
- After the planner archives the plan: PR, CI 5/5, merge. Then the orchestrator:
  1. republishes the demo Artifact from main (maps gone; the same URL, so it's still private);
  2. regenerates the hosted deck from `pitch-deck.md` (Slide 11 changed; the same URL);
  3. sends the user the final report: what shipped, demo and deck links with the share
     reminder, and the user actions (6.10 runbook, custom domain, WIF secrets, Sepolia deploy,
     audit, legal).


### Step 36b — Launch finalization, post-merge pass (slice Final; starts once 39, 40 and 41 have merged)

_Specced 2026-09-25 07:40 UTC at STEP_DONE 39, from 36's R2 findings and the orchestrator's
additions. It supersedes 36's item 3 (its 39/40/41 lines), item 13 and the post-merge "Done
when" bullets. Facts were checked against `origin/main` @ `3605473` (#17 merged), 40 @ `50b0285`
and 41 @ `6b10332`._

**When and where:**
- It starts once 40's and 41's PRs have merged. 39's has: #17 → `3605473`.
- Primary tree `/home/claude/OpenAd`, branch `chore/launch-final`, draft **PR #16**. Push to the
  same branch; don't open a new PR.
- One coder round: Sonnet, with an Opus review. **Risk: low.** The work is docs, the capture
  script and regenerated PNGs. There's no product code.
- The coder does not stage `.cursor/`. The planner's CLOSE (item 8) lands in the same PR after the
  review passes, and the orchestrator commits it.

**Items**
1. **Merge main.** Run `git fetch && git merge origin/main`: a merge commit, not a rebase, because
   #16 is pushed.
   - Expect it to be clean. `git merge-tree` shows no conflicts for 36 against main at
     `3605473`, against main plus 40, or against 41, including when 40 also fixes the capture
     script.
   - 41's own conflict with 39 (the T18 and T19 order in `docs/threat-model.md`) gets resolved on
     41's branch before it merges.
   - If anything does conflict, keep both sides' facts.
   - After the merge, re-read these, since they now sit side by side:
     - ARCHITECTURE §3.5–§3.6: 39's deadline, budget and cooldown text next to 36's DNS TXT truth
       fix;
     - ARCHITECTURE §3.3: 41's cap note next to 36's web-origin host rule;
     - `.env.example`: 39's two settings next to 36's comments;
     - `docs/threat-model.md`: the order must be T15 … T19.
2. **PR numbers and claims.** Take the numbers from `git log --merges --oneline origin/main`
   ("Merge pull request #N from …"). Then make these edits:
   - Replace `#TBD-36` with `#16` in `docs/business/launch-checklist.md` (the Sourcemaps row and
     the republish row) and in `docs/business/market-fit.md` (blockers 1 and 5).
   - **ROADMAP 6.9** (R2 L2):
     - Its closing sentence cites **PR #17** instead of "the outbound-fetch-bounds PR". It also
       says that `POST /v1/creatives/{id}/verify` releases its connection before fetching, and
       that both fetchers read raw bytes under their caps.
     - Add one sentence for 41's PR: `GET /v1/slots/{id}/periods` rejects windows wider than 60
       periods (422 `invalid_window`) and reads leases in one query (**T19**).
     - Pointers gain T18 and T19.
   - **ROADMAP 6.7:** add a dated line for 40's PR. Discover's state, the slot card's timing copy
     and the slot page's period list follow the open-ended calendar (PROTOCOL §4.1). Before it,
     every slot read "Ended" one period after its first, and a calendar older than 15 periods
     showed nothing buyable.
   - **ROADMAP Phase 7:**
     - 7.14 says PR #17 bounds each fetch and each pass but not how many run concurrently. Add
       that `POST /v1/creatives/{id}/verify` has no per-address or per-session limit (T18
       residuals; `api/src/openad/routers/creatives.py`).
     - 7.7 adds two things:
       - prettier on `docs/`: table alignment already fails on `ARCHITECTURE.md` and
         `threat-model.md`, and CI doesn't check docs;
       - code comments cite JIT step numbers ("step 39", "PLAN step 40"). The archived plan's
         step → PR map resolves them.
     - A new **7.17 "Sim planner period window".** `sim/src/planner/snapshot.ts:48` lists
       periods 0–4 only, so sim activity stops after five periods. It should list from the
       current index, as 40 does. Pointers: `sim/src/planner/`.
   - **README "What's in the box",** the security bullet: replace "outbound-fetch time limits ship
     separately (ROADMAP 6.9, T18)" with what shipped:
     - outbound fetches have an overall deadline and hold no DB connection while they run
       (PR #17, T18);
     - the periods endpoint caps its window (41's PR, T19).
   - **`launch-checklist.md` Done table:** add a row for each of these:
     - #15, auth hardening;
     - #14, capacity and deploy hardening;
     - #17, outbound-fetch bounds;
     - 40's PR: Discover and the slot page follow the open-ended calendar;
     - 41's PR: periods range cap.
   - **`pitch-deck.md` Slide 11:** "Built" may say "auth, capacity and request-bound hardening".
     Change nothing else there.
   - **JIT process words that 39 added to docs:** in `docs/ARCHITECTURE.md` and `.env.example`,
     "fix round 1" and "step 39" become "ROADMAP 6.9, PR #17", or just the T18 reference. Code
     comments stay as they are (7.7).
3. **36's R2 leftovers** (docs only):
   - L3, `docs/deploy-gcp.md`, the web-origin host rule (≈L397–399): "which are checked against
     the same rule" becomes "which must follow the same rule". The API doesn't validate its
     origin lists against it.
   - L3, `docs/qa/scorecard.md` (≈L63–68): each demo spec file has its own `auto: true` guard
     (`flows.spec.ts` and `growth.spec.ts`), and only `flows.spec.ts`'s also fails on an HTTP
     response ≥ 400. Say exactly that.
   - L3, `docs/guide/advertiser/getting-usdc-on-base.md` (L23–24): "a single permit signature
     (EIP-2612)" becomes "one permit signature (EIP-2612) plus one transaction, with no separate
     approval transaction".
   - L3 (pre-existing), `docs/deploy-gcp.md` §5: grant `openad-migrate-<ENV>` only the
     database-URL secret, because `infra/gcp/jobs/migrate.yaml` mounts nothing else. The session
     and click secrets go to `openad-api-<ENV>` only, which `api.yaml` mounts. The settler-key
     and database-URL grants stay as they are.
   - L3 (pre-existing), §14 Teardown: `gcloud run services delete` and `gcloud secrets delete`
     take one name each, so loop over the names. Add `openad-web-demo`
     (`infra/gcp/services/web-demo.yaml`).
4. **Capture script** (`e2e/demo/capture-screenshots.mjs`):
   - **Row addressing (planner finding; it breaks after 40).**
     - The script finds the bought row by position (`page.locator('tbody tr').nth(periodIndex)`,
       with the comment "Rows list periods 0..n in order").
     - After 40, the slot page lists from the current period, which is index 3 in the demo
       (`fps = now − 3.5 days`). So `nth(4)` is period 7, and the "Leased" wait times out.
     - Find the row by its index cell instead, as 40's `flows.spec.ts` does:
       `page.locator('tbody tr', { has: page.getByRole('cell', { name: periodIndex, exact: true }) })`.
       Fix the comment too.
     - If main already has this fix (the orchestrator may relay it to 40), keep main's version.
   - **`buy-leased.png`** (R2 L3): the comment promises the Leased row next to the wallet balance,
     but after scrolling to the top, that row is below the fold.
     - Take the shot full-page, like `discover-categories.png`, as long as it stays ≤ 400 KB.
     - Otherwise, keep the viewport shot and reword the comment to describe what it shows.
     - Either way, keep the wait on the row's "Leased" button.
5. **GTM launch plan** (orchestrator): rebase `docs/business/gtm-marketing.md` "Launch plan"
   (L39–49) on launch actions, matching the hosted deck's refreshed GTM slide:
   - **Days 0–30, go live:** launch on Base Sepolia and Google Cloud (ROADMAP 6.10), and
     hand-recruit pilot publishers with the demo and the embed tag.
   - **Days 30–60, prove it:** pilots' CTR, eCPM and spend from the built-in dashboards go into
     advertiser outreach, alongside the first hackathon sponsorship.
   - **Days 60–90, scale it:** the independent audit (7.10), then Base mainnet; grant applications
     and direct outreach with the deck.
   - Add one sentence: the product work behind each phase is already built (6.2–6.9); what
     remains is the launch, the pilots and the audit.
   - `pitch-deck.md` Slide 10 gets the same three phases, one line each. It is the hosted deck's
     source, and the orchestrator regenerates the deck from it.
6. **Re-capture** after items 1 and 4:
   - Run `npm run build:demo`, then `capture:screenshots` twice. The two runs must be
     byte-identical, with every PNG ≤ 400 KB.
   - `discover.png` shows slots 0, 2 and 4 as live (40).
   - Check that README's alt text and the doc captions still describe each image.
7. **Formatting:** run `npx prettier --write` on the business docs you edited. `docs/` tables
   outside `docs/business/` stay as they are (7.7).
8. **Planner CLOSE, after the review passes, in the same PR.** The planner only; the orchestrator
   commits it.
   - Write `.cursor/jit_history/2026-09-25-market-fit-launch.md`, in the compact archive style of
     `2026-09-12-sme-ux-critique-loop.md`:
     - title "# JIT_PLAN — Market fit, hardening and launch (archived)";
     - a header: created 2026-09-24, closed when #16 merges; ROADMAP 6.1–6.9 `[x]`, 6.10 open
       (user-run), Phase 7 listed.
   - Its **Decisions** section condenses D1–D13.
   - Its **Outcome** section contains:
     - The PR list, each with its slice and merge commit: #4–#17, plus 40's and 41's PRs.
     - A **step → PR map**, so the "step NN" references in code and docs resolve:

       | Steps | PR |
       | ----- | -- |
       | 1, 3 | #4 |
       | 4–13 | #8 |
       | 14+15 | #10 |
       | 16 | #13 |
       | 19–22 | #9 |
       | 23+24 | #5 |
       | 25–29 | #7 |
       | 30+31 | #11 |
       | 34 | #6 |
       | 35 | #12 |
       | 36 and 36b | #16 |
       | 37 | #15 |
       | 38 | #14 |
       | 39 | #17 |
       | 40 | M's PR |
       | 41 | N's PR |

       Steps 2, 17+18 and 32+33 were folded into other steps.
     - The demo and deck links, which stay private until the owner shares them.
     - The open user actions:
       - the 6.10 live deploy;
       - a custom domain;
       - the WIF secrets;
       - the Sepolia deploy plus `84532.json`;
       - verify XFF, then enable the limiter;
       - confirm `max_connections`;
       - the audit;
       - legal;
       - sharing the Artifacts.
     - Residual risks:
       - not audited;
       - the per-instance limiter is off until XFF is verified;
       - DNS rebinding (T17);
       - T18's per-address verify limit and concurrency;
       - DNS TXT doesn't work;
       - the same-site guard isn't PSL-aware.
     - A pointer to Phase 7 (ROADMAP 7.1–7.17).
   - Its **Identity fence** section is as in §6.
   - Delete `.cursor/JIT_PLAN.md`, as `45645e1` did. The full plan stays in git history.
   - Refresh `.cursor/JIT_INDEX.md`:
     - ADRs 0001–0017;
     - the Phase 6 section points at the archive;
     - drop the "accepted" and "in progress" wording;
     - the hosted demo is "rebuilt from main after #16".

**Verify:** run 36's Verify block in full (after the merge), plus the following.
```bash
cd /home/claude/OpenAd
git log --merges --oneline origin/main | head -5          # PR numbers for item 2
(cd api && uv run ruff check src tests && uv run mypy src && uv run pytest -q)   # main's api code after the merge
grep -rn 'TBD-36' --exclude-dir=node_modules --exclude-dir=.cursor . && echo "FAIL placeholders" || echo tbd-ok
grep -n "nth(" e2e/demo/capture-screenshots.mjs && echo "REVIEW positional rows" || echo rows-ok
grep -n "ship separately\|outbound-fetch-bounds PR" README.md docs/ROADMAP.md && echo "REVIEW PR claims" || echo claims-ok
grep -n "fix round\|step 39" docs/ARCHITECTURE.md .env.example && echo "REVIEW process words" || echo words-ok
grep -n "services delete openad-api openad\|secrets delete openad-database-url-<ENV> openad" docs/deploy-gcp.md && echo "FAIL teardown" || echo teardown-ok
grep -n "checked against the same rule" docs/deploy-gcp.md && echo "FAIL host rule" || echo hostrule-ok
git diff --stat origin/main...HEAD                         # 36's files only (plus .cursor/ after CLOSE)
```

**Done when:**
- Main is merged in, and 36's Verify block and the checks above pass.
- The screenshots are re-captured: deterministic, ≤ 400 KB each, and Discover shows 40's labels.
- No `#TBD-36` remains. README, ROADMAP (6.7, 6.9, Phase 7) and the launch checklist cite #16,
  #17 and 40's and 41's PRs.
- The R2 leftovers are fixed. The GTM plan and Slide 10 match the hosted deck.
- The Opus review passes.
- Then the planner's CLOSE (item 8) is committed on the branch, and the orchestrator:
  1. marks #16 ready and waits for CI 5/5;
  2. merges #16;
  3. republishes the demo Artifact from main (maps gone; same URL, still private);
  4. regenerates the hosted deck from `pitch-deck.md` (Slides 10 and 11 changed; same URL);
  5. sends the user the final report: what shipped, the demo and deck links with the share
     reminder, and the user actions from the Outcome section.


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
- 2026-09-25 05:36 UTC — STEP_DONE 37: R1 FIX (2 L2) → R2 PASS; `eb8193f` + `2ce0f5b` (JIT files up to the STEP_DONE 38 pass), **PR #15** open, CI pending. api 219/5 (223/1 with PG), web 212, embed 5, sim 13 + 1, demo 14/14, YAML e2e 13/13; live uvicorn relay, clock-skew, size and limiter checks pass. §5's full spec is replaced by an as-shipped record (the full text is in `2ce0f5b`). **39 accepted**: after #15 → main merged into #14 → #14, it starts in `/home/claude/OpenAd-o` (Sonnet, Opus review) while 36 starts in the primary tree off the same main; 39 merges first. 36 refreshed: new PR order (#15 before #14), 37's shipped facts, the web-origin host rule (viem rejects IPv6 literals and single-label hosts other than `localhost`), the stale `api/README.md` (migration list at 0002, and a claim that the Dockerfile migrates on start), and a definite 6.9 line for 39. 37's L3s and `OPENAD_SESSION_SECRET` go to the Phase 7 list. JIT_INDEX: `OPENAD_SIM_WEB_ORIGIN`, migration head `0005`, CI Postgres.
- 2026-09-25 06:55 UTC — REVISE and progress. #15 merged `2c4101b`; main merged into #14 as `2f313d9` (conflicts only in ROADMAP and threat-model ordering, as predicted); #14 merged `5f27fb8`. 39 was coded off `2f313d9` and is in fix round 1 after R1 FIX. Its scope grew to `POST /v1/creatives/{id}/verify`, raw-byte reads with `Accept-Encoding: identity`, and an atomic cooldown; recorded as F1–F4. 36 was coded off `2f313d9` and is in fix round 1 after R1 FIX (set-password syntax, onramp claim, screenshot scroll offset, GLOSSARY DNS TXT, `VITE_API_URL` in the host note, `VITE_SOURCEMAP` is shell-only, the 6.7 amended note, and a new deploy bug: the settler lacks `secretAccessor` on the database-URL secret). Shipped extras are recorded. **New step 40** (slice M, `fix/discover-auction-state` in `/home/claude/OpenAd-p`): Discover state anchored to the first period. The planner verified it and widened it to the slot page, which lists periods 0–14 only, so older calendars show nothing buyable. It also found that `buyFirstPeriod` in the demo e2e addresses rows by position. **Proposed 41** (slice N): `GET /v1/slots/{id}/periods` has no range cap and does one DB read per index, so one unauthenticated request can hold a pooled connection indefinitely. Added D13 (merge order 39 → 40 (→ 41) → 36). Backlog: the sim planner lists periods 0–4 only.
- 2026-09-25 07:00 UTC — REVISE: **41 accepted** and launched now (orchestrator override of its Where): Sonnet coder in the new worktree `/home/claude/OpenAd-q` on `fix/periods-range-cap` off `5f27fb8`. Its PG tests use `openad_test_q` on the same pgserver socket, and T19 goes directly after T17 (the orchestrator restores T17 → T18 → T19 on merge). **D13 amended**: 39, 40 and 41 are independent and merge in whatever order they go green, each later one merging main in first; 36 merges last, then merges main in, re-captures the screenshots and replaces `#TBD-36`. **40 launched** (Sonnet) in `/home/claude/OpenAd-p`. 39 and 36 are still in fix round 1. D13 now lists the expected textual overlaps: threat-model (39/41), `routers/slots.py` (39/41), ARCHITECTURE §3.3 (36/41) and `.env.example` (36/39).
- 2026-09-25 07:40 UTC — STEP_DONE 39 plus 36's R2 status. **39 DONE**: R1 FIX → R2 FIX → R3 FIX (coder escalated to Opus) → R4 PASS; `4bc78c1` + `687dbf4` + `7c11561`; **PR #17**, which `origin/main` already shows merged as `3605473` (the orchestrator reported CI pending); api 269/6 (274/1 with PG). §5's spec is replaced by an as-shipped record; the T18 residuals and three backlog notes go to §8. **36 R2 FIX**: all R1 findings resolved and IAM matches every secret; draft **PR #16** (`#TBD-36` = #16). The R2 leftovers and the orchestrator's GTM launch-plan re-base fold into a new **36b** post-merge pass, specced now (merge main, re-capture, `#TBD-36` → #16, PR citations for #17/40/41, the CLOSE archive in the same PR). Planner findings while speccing it: `capture-screenshots.mjs` finds the bought row by position, so it times out once 40 lists periods from the current index (36b item 4, or relay to 40); `git merge-tree` shows 36's main merge clean and main vs 41 conflicting only in the threat-model T18/T19 order, so D13's overlap list is updated. Observed, not yet reported: 40 committed `50b0285`, 41 `5f31a5c` + `6b10332`.

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
- Outbound fetches → **fixed by step 39 (PR #17, `3605473`)**: no overall deadline on media fetches (hops or body; httpx `timeout=` is per read); the indexer verifies inline and sequentially (`indexer/runner.py:225`); `_check_meta` (`services/offchain.py:204`) follows redirects unchecked, reads the whole body and holds a pooled DB connection during the fetch. Severity if deferred: one permissionless creative registration can stall block indexing, and ~24 slow domain checks can exhaust the api pool (4 × (4 + 2)) so serve fails.
- DNS TXT domain verification can't succeed: `dnspython` isn't a dependency (`_check_dns` returns False on ImportError). The UI only uses the meta tag, but the docs claim both → doc truth fix **scheduled in 36**; the feature goes to Phase 7.
- `docs/deploy-gcp.md` §3 DB password is never shown or stored (and base64 isn't URL-safe) → **scheduled in 36**.
- 37 L3: no test that percent-encoded URIs and resources are accepted (removing `_PCT_ENCODED` survives mutation); OpenAPI still documents FastAPI's 422 shape for `/v1/auth/verify`; `openad.errors.InvalidRequestError` clashes conceptually with SQLAlchemy's `InvalidRequestError`; `SiweIn.signature` is uncapped (cap about 256) → Phase 7 (36).
- `OPENAD_SESSION_SECRET` is read by no code (only `config.py` defines it; ADR-0009, ADR-0017, the runbook and `api.yaml` still set it) → Phase 7: drop it or use it.
- viem's `createSiweMessage` rejects IPv6 literals and single-label hosts other than `localhost` → web-origin host rule documented in 36.
- `api/README.md` is stale: the migration list stops at 0002, and it says the Dockerfile migrates on start → **scheduled in 36**.
- The slot page lists periods 0–14 only (`lib/api.ts:95` defaults), so a calendar older than 15 periods shows nothing buyable → **in step 40**.
- `GET /v1/slots/{id}/periods` has no range cap and reads leases one index at a time (`routers/slots.py:38-50`, `services/periods.py:47-49`) → **step 41 (accepted; coding in `/home/claude/OpenAd-q`)**. Severity on main until it merges: one unauthenticated request can hold a pooled DB connection indefinitely; about 24 take the api's whole pool.
- The sim planner lists periods 0–4 only (`sim/src/planner/snapshot.ts:48`), so sim activity dies out after five periods → Phase 7 as **7.17** (36b).
- 39 notes: an unscoped `ruff format --check` flags `0002_cpc.py` (known, 7.7). Prettier table alignment already fails at base on `docs/ARCHITECTURE.md` and `docs/threat-model.md`, and CI doesn't check docs → 7.7 (36b).
- Code comments cite JIT step numbers ("step 39", "PLAN step 40"), which only the archive's step → PR map resolves → a 7.7 note plus the CLOSE map (36b).
- T18 residual: no per-address or per-session limit on `POST /v1/creatives/{id}/verify` → 7.14 (36b).
- `e2e/demo/capture-screenshots.mjs` finds the bought row by position (`nth(periodIndex)`). Once 40 lists periods from the current index (3 in the demo), the "Leased" wait times out → **36b item 4**, or 40's fix round (either way the merge is clean, per the D13 check).
- The remaining unscheduled items above → ROADMAP Phase 7 in 36 (36b adds the 7.7 and 7.14 notes and 7.17).
