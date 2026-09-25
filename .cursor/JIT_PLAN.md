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
    - As merged (confirmed):
      - #17 (39) → `3605473`.
      - #18 (41) merged main in as `7000e4a`, where the orchestrator put T18 before T19 →
        `289bb72`.
      - #19 (40) merged main in as `173a7c5`, with no web overlap → `f50076d`.
      - 36b's merge of `f50076d` was clean → `44aa234`.
- **D14 — Slice-review fix split (2026-09-25 10:05 UTC, REPLAN; the orchestrator's split, not to
  be reopened).**
  - The orchestrator's slice review of the launch state (main `f50076d` plus #16 `cc040ef`)
    returned **FIX**. The fixes are five steps, so the work doesn't all land on one branch:
    - 42 `fix/deploy-images`, 43 `fix/cloud-run-wiring`, 44 `fix/settler-key` and
      45 `fix/cpc-click-integrity` are coded in parallel off `f50076d`, one PR each, in worktrees
      `/home/claude/OpenAd-42` … `-45`. The orchestrator created the worktrees and branches, and
      each coder edits only inside its own.
    - 46 (docs truth) runs at the same time on `chore/launch-final` (#16) in the primary tree.
  - Every L1 and L2 finding belongs to exactly one step. L3s ride with the step that owns the file.
  - **Hunk ownership** (main `f50076d` line numbers). Each spec lists its hunks and what it must
    not touch. A coder who needs a line outside its hunks stops and says so in the handback.
    - `docs/deploy-gcp.md`:
      - 42: §6 (L257-268), §8's image paragraph (L291-296) and the `openad-web` command
        (L331-333);
      - 43: §0-§2, §3's PSA paragraph (an insertion after L53) and the instance command
        (L58-61), §4 (L180-208), the §6-8 intro (L234-255), §8's api/indexer/settler commands
        (L298-329), §9's mappings (L359-365), §10's roles loop (L401-426) and secrets paragraph
        (L433-438), and §11's smoke block (L440-446). #16 edits §3 L65-122 and §10 L429, so 43
        leaves L62-178 and L427-432 alone;
      - 44: §5 L218 only, and §8's settler paragraph (L341-344);
      - 45: §9's CDN paragraph (L396-399) and a new §11 subsection inserted at L456.
    - `scripts/deploy-gcp.sh`: 42 adds one block between L252 and L254 and extends L257's
      `--substitutions`. 43 owns everything else, including `usage()`.
    - `scripts/check-sh.sh`: 42 adds one block between L115 and L116. 43 owns the rest.
    - `.env.example`: 42 L98; 43 L41; 44 L90-93 and L118-123; 45 L34-36 and L81-84.
    - ADR-0017: 42 L138-139; 43 L103-111, L118 and the only appended amendment; 44 L51-54;
      45 L152-154 and L186-187.
    - `docs/ARCHITECTURE.md`: 43 §7 L590-602; 44 §3.9 (L384-387) and §8 L608; 45 §3.4
      (L232-240), §3.8 (L378-380) and a §8 bullet after L613. 42 edits none.
    - `infra/gcp/services/api.yaml`: 43 L1-7, the template annotations and L46; 45 appends after
      L74. `web.yaml`: 42 L29-33; 43 L5-7. `infra/gcp/README.md`: 42 L9-11; 43 L1-5 and L20-52.
    - `docs/threat-model.md`: 44 adds T20 after T19 and edits L64; 45 amends T13's row (L53).
    - 46, on #16 (its spec gives #16's line numbers): `.env.example` L55 (main L52), ARCHITECTURE
      §3.3 and §3.5 step 4, the threat model's L3-5, L12 and one bullet after L87, and
      `web/index.html` L8-14. None of these touches or borders a 42–45 hunk.
    - Sole owners:
      - 42: `ci.yml`, `cloudbuild.yaml`, both Dockerfiles, the nginx template, `web-demo.yaml`,
        `wagmi.ts`, `web/index.html` L18-22, `web/vite.config.ts` L44-56, and the new boot-check
        script;
      - 43: `deploy.yml`, `indexer.yaml`, `settler.yaml`, `jobs/migrate.yaml`;
      - 44: `contracts/script/` and `contracts/tests/` (no `.vy` change, D8), `docs/PROTOCOL.md`,
        `deploy-sepolia.md`, `deploy-mainnet.md`, `openad/settler/`;
      - 45: `routers/serve.py`, `routers/clicks.py`, `services/clicks.py`, and the guide's
        `embed-code.md`.
  - **Numbers, pre-assigned.**
    - Threat model: **T20** is 44's (settler key custody). 45 amends **T13** in place. T21 is
      reserved for 45, only if it finds a genuinely new threat; its row then follows T20, and the
      merge conflict with 44 is mechanical.
    - ROADMAP: **6.11**–**6.14** are 42–45. **7.19** is 46's (phishing blocklist). 7.20 and up
      are for 47's follow-ups.
    - 42–45 edit neither `docs/ROADMAP.md` nor README: Phase 6.10 and Phase 7 exist only on #16.
      **47** writes 6.11–6.14 and cites the PR numbers.
  - **Merge order (extends D13).**
    1. 42–45 each merge as it goes green, each later one merging main in first. No textual
       overlaps are predicted between them.
    2. **47** merges main into #16 and does the post-merge docs.
    3. The orchestrator runs a targeted Opus re-review of the slice-review findings.
    4. The planner's **CLOSE**; then #16 merges last.
  - **Shared resources.**
    - Postgres at `/tmp/pgdata_jit16`. 45 uses `openad_test`; 42, 43 and 44 use `openad_test_42`,
      `_43` and `_44`, with
      `OPENAD_TEST_PG_URL='postgresql+asyncpg://postgres@/<db>?host=/tmp/pgdata_jit16'`.
    - Only 46 runs the default-port Playwright suites (`test:demo` on 4173, capture on 4174). 42's
      browser boot check uses ports 5181–5189.
    - Docker is available.
    - `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` and
      `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. Never run
      `playwright install` locally.
    - Revert `package-lock.json` libc churn.
  - **GCP facts.**
    - Nobody uses WebFetch or WebSearch: a blocked fetch parks a worker on a prompt only James can
      answer, and he is away.
    - Use known defaults, and mark every GCP fact the repo can't prove
      "(inferred; verify before deploy)".
  - **Amendments (2026-09-25 ~12:00 UTC; the orchestrator's decisions from 43's and 45's R1
    reviews, not to be reopened).**
    - 45 also owns `api/src/openad/serve/origin.py` and `api/tests/test_origin.py`.
    - 43's runbook hunks gain base L273, §7's manual `envsubst` line (`VPC_NETWORK`,
      `VPC_SUBNET`). L269-272 stay unchanged, so it doesn't border 42's §6 (L257-268).
    - 43's runner-SA paragraph moves out of base L427-432 (#16 edits L429), into its L401-426 or
      L433-438 hunk.
    - A dedicated Cloud Build staging bucket replaces `<PROJECT_ID>_cloudbuild` (43's item 7):
      - 43: runbook §2 creates `gs://<PROJECT_ID>-openad-builds` with uniform bucket-level
        access, and §10 grants the deployer `roles/storage.admin` on that bucket only. `usage()`
        and the runbook document `BUILD_STAGING_BUCKET` (default `<PROJECT_ID>-openad-builds`)
        and the build runner SA's `roles/cloudbuild.builds.builder` and
        `roles/artifactregistry.writer`. All are marked inferred.
      - 42, in its review fix round: `--gcs-source-staging-dir` on the Cloud Build call
        (`deploy-gcp.sh` L254-257, already 42's), the same flag on runbook §6's
        `gcloud builds submit` forms (42's L257-268), and an assertion in 42's check-sh block.
    - **Planner correction to that decision.** Its text reads
      `gs://${BUILD_STAGING_BUCKET:-${PROJECT_ID}-openad-builds}/source`, but in `deploy-gcp.sh`
      the project is `$PROJECT` (L100, L117). `PROJECT_ID` is set only in `render()`'s env
      prefix (L271), and the script runs under `set -euo pipefail` (L12). With
      `BUILD_STAGING_BUCKET` unset, every run, `--dry-run` and `check:sh` included, would abort
      with "PROJECT_ID: unbound variable" (reproduced). The script uses `${PROJECT}`; the
      runbook's `<PROJECT_ID>` placeholder is right.
    - 43's guards move above every side effect (D15), to above base L252. `deploy-gcp.sh`
      L252-257 stay 42's, so the two branches still merge cleanly.
- **D15 — Fix rules: what 42–45 make true.**
  - **Images (42).**
    - The api image carries `contracts/deployments` at `/app/contracts/deployments`, with
      `OPENAD_DEPLOYMENTS_DIR` set. The path is absolute because `REPO_ROOT` is `/` in the image.
    - An empty `VITE_*` build input means unset:
      - no WalletConnect project id → injected (browser) wallets only;
      - no guide URL or demo URL → those links are hidden.
    - The inputs flow from `deploy-gcp.sh`'s environment (`WALLETCONNECT_PROJECT_ID`,
      `GUIDE_URL`, `DEMO_URL`), through Cloud Build substitutions (`_WALLETCONNECT_PROJECT_ID`,
      `_GUIDE_URL`, `_DEMO_URL`), to build args.
    - CSP `img-src` comes from `CSP_IMG_SRC`. The image default is `'self' data:`, and `web.yaml`
      adds the API origin and `https:`.
    - No build loads Google Fonts.
    - CI boot-checks the api image and both web images.
  - **Cloud Run (43).**
    - Direct VPC egress (`private-ranges-only`) on api, indexer, settler and the migrate job.
    - Cloud SQL `--edition=ENTERPRISE`.
    - The script grants `allUsers` `roles/run.invoker` on api, web and web-demo only.
    - `--only stack|all` refuses an unset or empty `API_URL`/`WEB_URL`.
    - The media bucket defaults to `openad-media-<project>-<env>`.
    - CSP RPC entries are origins: by default the public chain RPC the web app actually uses,
      never `RPC_URL`.
    - **Amended (~12:00 UTC, 43's R1):**
      - every guard runs before the first side effect (Cloud Build, the migrate job, any
        `services replace`), and under `--dry-run` too;
      - `origin_of` yields `scheme://host[:port]` and drops any path, query and fragment. A bare
        host isn't mangled, and a refusal never prints a credential;
      - the runbook's `--only stack` example sets `API_URL` and `WEB_URL`, and the first-run
        smoke checks use each service's `status.url` until §9 maps the domains;
      - Cloud Build stages its source in `gs://<PROJECT_ID>-openad-builds`
        (`BUILD_STAGING_BUCKET`), which §2 pre-creates with uniform access. The deployer holds
        `roles/storage.admin` on that bucket only, and the build's runner SA holds
        `roles/cloudbuild.builds.builder` and `roles/artifactregistry.writer` (inferred);
      - the indexer and settler never get `allUsers` (a check-sh assertion). An opt-in
        `PUBLIC_INVOKER=iam-disabled` (`--no-invoker-iam-check`) replaces the binding where
        domain-restricted sharing refuses `allUsers` (an L3; inferred).
  - **Settler (44).**
    - The settler is a dedicated, gas-only EOA.
    - `deploy.py` requires `OPENAD_SETTLER_ADDRESS` off Anvil and pyevm, and refuses the deployer.
    - `set_settler.py` rotates it.
    - The settler process refuses to start (off 31337) when its key owns the vault.
  - **Clicks (45).**
    - Campaign serve responses are `private, no-store`: each carries a one-time token, and each
      is an impression.
    - Lease, house and empty responses stay `public, max-age=<ttl>`.
    - A CDN may cache `/v1/serve/*/media` only.
    - The burst rule keys on `client_key(request, OPENAD_TRUSTED_PROXY_HOPS)`, in a bounded map.
      It is skipped, and logged, when hops are 0 outside dev and test.
    - `api.yaml` sets `OPENAD_SERVE_ENFORCE_ORIGIN=true`.
    - **Amended (~12:00 UTC, 45's R1):**
      - origin enforcement is best effort (`serve/origin.py`). An explicit `Origin: null` with
        no usable `Referer` host is a mismatch, a request with neither header is a match, and
        `::1` is a loopback host in dev and test;
      - an XFF chain shorter than the hop count falls back to the shared peer, so the burst rule
        fails closed. Behind a load balancer, every api request must take the same proxies: api
        ingress `internal-and-cloud-load-balancing`, and `OPENAD_PUBLIC_URL` is the LB host;
      - a test pins `slot_id` in the burst key;
      - IPv6 clients are keyed by their full address for now (§8: key them by /64).

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
| M Discover and slot-page period state (first-period anchoring) | `fix/discover-auction-state` (#19, merged `f50076d`) | noted under 6.7 by 36b | #14 merged; independent of L and N; merge before Final |
| N Periods range cap (accepted) | `fix/periods-range-cap` (#18, merged `289bb72`) | noted under 6.9 by 36b | #14 merged; independent of L and M (T19 goes after T17; T18 restored on merge); merge before Final |
| O Fix: the deploy images boot (api deployments, web WalletConnect/CSP/fonts, CI image boot checks) | `fix/deploy-images` (worktree `/home/claude/OpenAd-42`) | 6.11 (47 records it) | main `f50076d`; independent of P, Q and R (D14); merges before Final |
| P Fix: Cloud Run wiring (VPC egress, SQL edition, invoker, WIF roles, deploy nits) | `fix/cloud-run-wiring` (worktree `/home/claude/OpenAd-43`) | 6.12 (47) | main `f50076d`; independent of O, Q and R; merges before Final |
| Q Fix: a dedicated settler key | `fix/settler-key` (worktree `/home/claude/OpenAd-44`) | 6.13 (47) | main `f50076d`; independent of O, P and R; merges before Final |
| R Fix: CPC click integrity (no-store campaign serves, trusted burst key, origin enforcement) | `fix/cpc-click-integrity` (worktree `/home/claude/OpenAd-45`) | 6.14 (47) | main `f50076d`; independent of O, P and Q; merges before Final |
| Final: launch finalization (old 17+18 + 32+33) | `chore/launch-final` (draft #16) | 6.3/6.6/6.7 ticks, 6.10, Phase 7; 6.11–6.14 and 7.19 (46, 47) | started after J and K merged; merges last, after L, M, N and O–R (36b and 46 done; 47 post-merge pass and targeted re-review, then CLOSE) |

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

### Slice M — `fix/discover-auction-state` (added 2026-09-25; worktree `/home/claude/OpenAd-p`; independent of L and N; merged third, as #19)
- ✓ 40. M: `auctionStatus(slot, now)` follows the open-ended calendar. Its check order is no terms → paused → CPC → no calendar (**paused wins over CPC**, the orchestrator's override of the spec), then ended, live, remainder or upcoming from `kLast`, `cur` and `next`. SlotCard's copy comes from it. The slot page lists `periodsWindowSize` + 1 (15–60) periods from the calendar-only `currentPeriodIndex`. A full-status per-period oracle checks it; demo e2e rows are found by their index cell. Reviews: R1 FIX (L1 paused CPC read 'cpc'; L2 `current` for paging; L2 the oracle compared states only; L3 a fixed window) → R2 PASS (two L3s: the ceil test line → 36b; the zero-period guard → Phase 7). Commits `50b0285` + `5511a0a` + `173a7c5`, **PR #19 merged `f50076d`**. web 236, test:demo 14/14, YAML 13/13, BigInt oracle 730,418 cases with 0 mismatches. **(as-shipped record below)**

### Slice N — `fix/periods-range-cap` (accepted 2026-09-25; worktree `/home/claude/OpenAd-q`; independent of L and M; merged second, as #18)
- ✓ 41. N: `GET /v1/slots/{id}/periods` rejects `to − from + 1 > 60` with 422 `invalid_window`, bounds `from` and `to` each at `UINT256_MAX`, and reads leases in one query (an index scan on `pk_leases`); T19. Reviews: R1 FIX (L2 the query's filters were untested; L3 a docstring; L3 a uint256 overflow gave a 500, pulled into scope) → R2 PASS (two L3s fixed anyway). Commits `5f31a5c` + `6b10332` + `7000e4a` (main merged in, T18 before T19) + `a6ba05f`, **PR #18 merged `289bb72`**. pytest 274/6, 279/1 with PG. Callers: web 15–60, sim 8, sim planner 5. **(as-shipped record below)**

### Slice O — `fix/deploy-images` (slice-review fix, 2026-09-25; worktree `/home/claude/OpenAd-42` off `f50076d`; parallel with P, Q, R and 46)
- [>] 42. O:
  - the api image carries `contracts/deployments` and sets `OPENAD_DEPLOYMENTS_DIR`;
  - an empty WalletConnect id no longer blanks the real web app (injected wallets only);
  - the WalletConnect id and the guide and demo URLs reach the web build (Cloud Build
    substitutions, fed by `deploy-gcp.sh`);
  - `CSP_IMG_SRC`, no Google Fonts, and a CSP on §8's `openad-web` command;
  - CI builds and boot-checks the api image and both web images;
  - in its review fix round (D14 amendment): `--gcs-source-staging-dir` on the Cloud Build
    call and in runbook §6, with `${PROJECT}` (`${PROJECT_ID}` is unbound under `set -u`).
  **Coder:** Sonnet, with an Opus review. **Risk: medium.** **(spec below)**

### Slice P — `fix/cloud-run-wiring` (slice-review fix; worktree `/home/claude/OpenAd-43` off `f50076d`; parallel)
- [>] 43. P:
  - Direct VPC egress on api, indexer, settler and the migrate job, plus `--edition=ENTERPRISE`;
  - an `allUsers` invoker binding on api, web and web-demo;
  - the demo URL and its domain mapping;
  - `--only stack|all` refuses an unset `API_URL`/`WEB_URL`;
  - a per-project media bucket, and CSP RPC entries that are origins only;
  - WIF roles for Cloud Build;
  - smoke checks that pass on a fresh deploy;
  - the infra README, ARCHITECTURE §7 and `usage()`.
  - R1 FIX (L1: the runner-SA paragraph inside base L427-432; six L2s; seven L3s) → fix
    round 1 with the coder: guards before any side effect, `origin_of` →
    `scheme://host[:port]`, the builds staging bucket, base L273 (D14 and D15 amendments).
  **Coder:** Sonnet, with an Opus review. **Risk: medium.** **(spec below)**

### Slice Q — `fix/settler-key` (slice-review fix; worktree `/home/claude/OpenAd-44` off `f50076d`; parallel)
- [>] 44. Q: a dedicated, gas-only settler EOA.
  - `deploy.py` requires `OPENAD_SETTLER_ADDRESS` off Anvil and refuses the deployer.
  - `set_settler.py` rotates it.
  - The settler process refuses to start with the vault owner's key.
  - Runbooks, PROTOCOL §10, and threat-model **T20**.
  **Coder:** Opus, with an Opus review. **Risk: high.** **(spec below)**

### Slice R — `fix/cpc-click-integrity` (slice-review fix; worktree `/home/claude/OpenAd-45` off `f50076d`; parallel)
- [>] 45. R:
  - campaign serve responses are `private, no-store`, and a CDN may cache `/media` only;
  - the burst rule keys on the trusted-hop client key, in a bounded map, and stays off until the
    hop count is verified;
  - `api.yaml` turns origin enforcement on;
  - **T13** is amended;
  - regression tests.
  - R1 FIX (L2: `Origin: null` with no Referer, and `[::1]`; three L3s) → fix round 1 with
    the coder. 45 now also owns `serve/origin.py` and its tests, and origin enforcement is
    best effort (D14 and D15 amendments).
  **Coder:** Opus, with an Opus review. **Risk: high** (publisher CPC earnings). **(spec below)**

### Final — `chore/launch-final` (started off `2f313d9` in parallel with 39; merges last, after 39–41 and 42–45)
- ✓ 36. Final, coder rounds 1–2 (primary tree, `chore/launch-final` off `2f313d9`, **draft PR #16**, so `#TBD-36` = #16). R1 FIX → fix round 1 → **R2 FIX**. All R1 findings are resolved, and the runbook's IAM grants now match every secret. The orchestrator folded the R2 leftovers into 36b instead of running another round now. It covers:
  - ROADMAP: 6.3 `[x]` with a dated amended-acceptance note; 6.6 split into artifacts `[x]` and a new **6.10** live deploy `[ ]` (6.8 and 6.9 come from 37 and 38); 6.7 `[x]`; a Phase 7 backlog.
  - Sourcemaps off; the `PLAYWRIGHT_CHROMIUM_PATH` hook in the main e2e config.
  - Onramp guide page; guide README and SUMMARY.
  - README "What's in the box" (including the hardening and the same-site domain requirement) and two new deterministic screenshots.
  - Business docs (the launch checklist gains the custom-domain, XFF and budget user actions), ARCHITECTURE §7 truth fixes, a scorecard automated-checks section, AGENTS.md pointers.
  - The runbook's DB-password flow (§3/§5) and a DNS TXT truth fix (routed from 38); the web-origin host rule and a stale `api/README.md` (routed from 37).
  **Risk: low.** **(as-shipped record below)**
- ✓ 36b. Final, post-merge pass (same branch, draft PR #16). DONE 2026-09-25, after `44aa234`:
  - `1f76556`: `#TBD-36` → #16; #17, #18 and #19 cited in ROADMAP (6.7, 6.9, Phase 7 up to 7.18),
    README and the launch checklist; 36's R2 leftovers; the GTM plan and Slide 10 rebased on
    launch actions; the capture script finds rows by their index cell; the `ceil` test line;
    re-captured screenshots.
  - `e94250d`: the fiat answers point at the USDC guide.
  - `cc040ef`: prettier.
  #16's head is `cc040ef`, CI is 5/5 and it is still a draft. The orchestrator's slice review of
  the launch state then returned **FIX** (D14). The CLOSE archive (36b's item 8) is deferred to
  the last item below. **(as-shipped record below)**
- ✓ 46. Final: docs truth on #16, in the primary tree, in parallel with 42–45. DONE 2026-09-25:
  - the demo script's CPC track uses Nimbus Wallet (creative 3 on slot 1), proved by a new demo
    test;
  - pitch-deck Slide 4 claims only what the demo shows;
  - ARCHITECTURE §3.3 matches the code;
  - no phishing blocklist, said honestly, plus ROADMAP **7.19**;
  - README, threat-model scope and `.env.example` staleness;
  - the OG text, the `/why` wording and the earnings presets (30, 40 and 50%; default 30%);
  - `why-calculator.png` re-captured.
  `69e2aa9` + `911d363`, CI green on both. R1 FIX (L2: the "only takedown" claim; three L3s) →
  fix round 1 → **R2 PASS**. web 237, embed 5, sim 13 + 1 skipped; test:demo 15/15; capture
  byte-identical twice. **Risk: low.** **(as-shipped record below)**
- ○ 47. Final: post-merge pass, once 42–45 have merged.
  - Merge main into #16 and resolve any conflicts.
  - ROADMAP 6.11–6.14 with the PR numbers.
  - The docs on #16's side that describe 42–45: the §3.3 heading, the §7 table and CI
    sentence, ADR-0014 L117-118 and ADR-0017 L169, the §14 bucket line, the launch-checklist
    user actions, and README; plus the `/embed-demo` copy, the one product-code exception.
  - Re-run the gates; CI green on every check.
  - Then the orchestrator's **targeted Opus re-review** of every slice-review finding.
  **Coder:** Sonnet, with an Opus review. **Risk: low.** **(spec below)**
- ○ CLOSE. The planner's archive (moved here from 36b's item 8, updated for 42–47), committed on
  #16. Then the orchestrator ships #16. **(spec below)**

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


### Step 40 — Discover and slot-page period state follow the open-ended calendar (slice M): DONE, as-shipped record

**Status:** R2 PASS. Branch `fix/discover-auction-state` (worktree `/home/claude/OpenAd-p`), off
`5f27fb8`. **PR #19 merged as `f50076d`.** The full pre-implementation spec is in git history
(`968a6fe`).

**Commits:**
- `50b0285`: `auctionStatus`, the SlotCard copy, the slot page's window and the tests.
- `5511a0a`: fix round 1.
- `173a7c5`: main merged in, with no web overlap.

**Files:**
- `web/src/lib/{auction.ts, auction.test.ts}`;
- `web/src/components/{SlotCard.tsx, SlotCard.test.tsx}`;
- `web/src/features/marketplace/{SlotPage.tsx, SlotPage.test.tsx, api.ts}`;
- `e2e/demo/flows.spec.ts`.

**As shipped:**
- `auctionStatus(slot, now)` in `web/src/lib/auction.ts`, with `auctionState` as a thin wrapper.
  **Check order, amended.** The spec put CPC before paused, which was wrong. The orchestrator's
  fix-round-1 ruling, following PROTOCOL §11 (`paused` stops CPC serving):
  1. no terms, or LEASE with `lead ≤ 0` → `'no terms'`;
  2. paused → `'paused'` (a paused CPC slot reads paused);
  3. CPC → `'cpc'`;
  4. no calendar → `'no calendar'`;
  5. then `'ended'`, `'live'`, `'remainder'` or `'upcoming'` from `kLast`, `cur` and `next`, as
     specced. A slot with `sale_end == 0` never reads `'ended'`.
- `currentPeriodIndex(slot, now)` is calendar-only: `floor((now − S0) / P)`, unset before the
  calendar starts. It mirrors `models/slot.py` `current_period_index`, and matched it on 100k
  cases.
  - The slot page pages from it, not from `auctionStatus().current`, which is unset for paused
    and no-terms slots.
  - `usePeriods` waits for the slot to load.
- `periodsWindowSize(lead, period) = min(59, max(14, ceil(lead / period)))`. The slot page
  requests `from = current` (0 before the calendar starts) and `to = from + size`. That is 15–60
  periods, within #18's cap.
- SlotCard's copy comes from the status (upcoming, live, remainder, final period), with four
  copy-line tests.
- Demo e2e: slot 0's card reads live, and `buyFirstPeriod` finds rows by their index cell.

**Reviews:**
- R1 FIX:
  - L1: a paused CPC slot read `'cpc'` → paused wins over CPC (orchestrator override).
  - L2: the slot page took `current` from `auctionStatus` → `currentPeriodIndex`, gated on the
    slot having loaded.
  - L2: the cross-check compared states only → an independent per-period-scan oracle derives the
    whole `AuctionStatus` (`toEqual`, 5000 trials).
  - L3: a fixed 15-row window → `periodsWindowSize`.
- R2 PASS, with two L3s:
  - (a) The "widens past 14" test uses an exact multiple (`86_400 / 3600`), so `floor` in place
    of `ceil` would still pass → 36b adds `periodsWindowSize(88_200, 3600) === 25`.
  - (b) `periodsWindowSize(0, 0)` is NaN, and `currentPeriodIndex` with period 0 gives Infinity or
    NaN. This is unreachable, since `set_calendar` and the demo reducer require periods ≥ 3600 s
    → §8, Phase 7 optional guard (7.18 via 36b).

**Checks:**
- typecheck and lint ok;
- web 236, embed 5, sim 13 (+1 skipped);
- build, build:demo and `check-demo-bundle` ok;
- test:demo 14/14;
- main YAML suite 13/13 (throwaway config, port 5175);
- the reviewer's BigInt oracle: 730,418 cases, 0 mismatches.

**Backlog notes** (§8), from the coder:
- CI's prettier step covers only part of `web/`.
- The new `'no terms'` state has no Discover filter chip.


### Step 41 — Cap the periods range (slice N): DONE, as-shipped record

**Status:** R2 PASS. Branch `fix/periods-range-cap` (worktree `/home/claude/OpenAd-q`), off
`5f27fb8`. **PR #18 merged as `289bb72`.** The full pre-implementation spec is in git history
(`968a6fe`).

**Commits:**
- `5f31a5c`: the cap, one lease query, and T19.
- `6b10332`: fix round 1, with the query's filters pinned by tests and the uint256 bounds.
- `7000e4a`: main merged in. The orchestrator resolved the threat-model order (T18 before T19).
- `a6ba05f`: the final L3 round.

**Files:**
- `api/src/openad/{routers/slots.py, services/periods.py}`;
- `api/tests/{test_periods.py, test_public_reads.py}`;
- `docs/ARCHITECTURE.md` §3.3 (public reads);
- `docs/threat-model.md` T19.

**As shipped:**
- `GET /v1/slots/{id}/periods` rejects `to − from + 1 > 60` (`_MAX_PERIODS`) with a house-style
  422 `invalid_window` (`InvalidWindowError`), before it builds the list. The API defaults are
  unchanged (`from=0`, `to=7`).
- `from` and `to` are each bounded with `le=UINT256_MAX`. A value above it used to give a 500
  from the Uint256 bind. `from = to = UINT256_MAX` → 200.
- Leases come from one query over (`slot_id`, `calendar_version`,
  `period_index BETWEEN from AND to`). On Postgres this is an index scan on `pk_leases`.
- T19 "Unbounded work per request", after T18.

**Reviews:**
- R1 FIX:
  - L2: none of the new query's three filters was tested.
  - L3: an "(item 2)" docstring.
  - L3: `from` or `to` above 2^256 − 1 gave a 500. The orchestrator pulled it into scope →
    `le=UINT256_MAX` on both.
- R2 PASS, with two L3s fixed anyway:
  - The lease-filter test pinned the rendered SQL text → an ORM `load` listener asserts that only
    (slot, cv, 55) is ever loaded.
  - The uint256 test sent both params out of range → each param is bounded separately, plus
    `from = to = UINT256_MAX` → 200.

**Checks:**
- ruff, format (src and tests) and mypy clean.
- pytest 274 passed / 6 skipped; with PG (`openad_test_q`) 279 / 1.
- The reviewer found the old and new code identical on SQLite and PG for every in-cap window.

**Callers under the cap:** web 15–60 (after #19), sim 8, sim planner 5.


### Steps 36 and 36b — Launch finalization (slice Final): DONE, as-shipped record (CLOSE deferred)

_The full specs are in git history (`486ab0b`). This record replaced them at the REPLAN
(2026-09-25 10:05 UTC)._

- Branch `chore/launch-final`, draft **PR #16**, head `cc040ef`, CI 5/5 (2026-09-25 09:39 UTC).
- **36** (coder rounds 1–2; `e4c5b97`, `288d736`):
  - ROADMAP: 6.3, 6.6 and 6.7 ticked; a new 6.10 for the live deploy, still open; a Phase 7
    backlog.
  - Sourcemaps off (`VITE_SOURCEMAP`); the `PLAYWRIGHT_CHROMIUM_PATH` hook in the main e2e config.
  - An onramp guide page; README "What's in the box", with two new screenshots.
  - Business docs, including the launch checklist's user actions; ARCHITECTURE §7 truth fixes;
    the scorecard's automated checks; AGENTS.md pointers.
  - The runbook's DB-password flow (§3 and §5); DNS TXT truth; the web-origin host rule; a fresh
    `api/README.md`.
- Main merged in cleanly as `44aa234`.
- **36b** (`1f76556`, `e94250d`, `cc040ef`):
  - `#TBD-36` → #16;
  - #17, #18 and #19 cited in ROADMAP (6.7, 6.9, and Phase 7 up to 7.18), README and the launch
    checklist;
  - 36's R2 leftovers;
  - the GTM plan and Slide 10 rebased on launch actions;
  - the capture script finds rows by their index cell;
  - the `periodsWindowSize(88_200, 3600) === 25` test line;
  - re-captured screenshots.
- **Deferred:** 36b's item 8 (CLOSE). The orchestrator's slice review of the launch state returned
  **FIX** at about 10:05 UTC, which led to steps 42–47 (D14, D15). CLOSE is now the last item of
  this section.

### Step 42 — The deploy images boot (slice O, `fix/deploy-images`)

_Specced 2026-09-25 10:05 UTC (REPLAN, slice review FIX). Facts were checked at `f50076d` (main)
and `cc040ef` (#16). Line numbers are main's unless marked._

**Amendment (2026-09-25 ~12:00 UTC; the orchestrator's decision from 43's R1 review, D14's
amendments).** In 42's review fix round, also:
- `deploy-gcp.sh`, in the Cloud Build call (L254-257, already 42's): add
  `--gcs-source-staging-dir="gs://${BUILD_STAGING_BUCKET:-${PROJECT}-openad-builds}/source"`.
  - Use `${PROJECT}`. The script runs under `set -u`, and `PROJECT_ID` exists only inside
    `render()`, so `${PROJECT_ID}` would abort every run that leaves `BUILD_STAGING_BUCKET` unset.
  - 43 creates the bucket (runbook §2) and documents `BUILD_STAGING_BUCKET` in `usage()`. Don't
    edit `usage()`.
- Runbook §6 (L257-268, 42's): the same flag on each `gcloud builds submit` form, as
  `--gcs-source-staging-dir=gs://<PROJECT_ID>-openad-builds/source`.
- 42's `check-sh.sh` block: the dry-run `builds submit` line carries
  `--gcs-source-staging-dir=gs://<project>-openad-builds/source` by default, and the override's
  bucket when `BUILD_STAGING_BUCKET` is set.

**When and where:**
- Worktree `/home/claude/OpenAd-42`, branch `fix/deploy-images` off `f50076d`. The orchestrator
  created both. Edit only inside this worktree. It runs in parallel with 43, 44, 45 and 46.
- Sonnet coder, Opus review. **Risk: medium.** It is build and CI plumbing, but it fixes two L1s:
  the indexer and settler can't start, and the real web app is a blank page.
- Local resources (D14):
  - Postgres DB `openad_test_42`, if you run the api suite;
  - browser checks on ports 5181–5189 only;
  - Docker (start it with `nohup dockerd &` if it isn't running);
  - Chromium from `/opt/pw-browsers` (never `playwright install` locally);
  - revert any `package-lock.json` libc churn.
- Commit on the branch (Conventional Commits, e.g. `fix(web): …`, `ci: …`). The orchestrator
  pushes and opens the PR.
- Don't touch `docs/ROADMAP.md` or README: 47 records this step as ROADMAP 6.11.

**Evidence (the slice review's findings, re-checked):**
- **L1: the api image has no deployments artifact.**
  - `api/Dockerfile` L7-10 copy only `api/`.
  - `REPO_ROOT` (`config.py:16`, `parents[3]`) is `/` in the image, so the default
    `contracts/deployments` resolves to `/contracts/deployments`, which doesn't exist.
  - `indexer/__main__.py:21` and `settler/__main__.py:27` call `load_deployment` before the
    liveness listener starts. Both exit, so Cloud Run never sees a healthy revision.
  - Local runs work only because `docker-compose.stack.yml` mounts `/deployments` and sets
    `OPENAD_DEPLOYMENTS_DIR`.
- **L1: the non-demo web image boots to a blank page.**
  - `web/Dockerfile` L48-59 bake every unset build arg in as `""`.
  - `wagmi.ts` L39-40 fall back to the all-zero id only on `undefined` (`??`), so the project id
    is `""`.
  - RainbowKit 2.2.11 throws "No projectId found" as soon as a WalletConnect-based wallet is
    created (`getWalletConnectConnector`, `node_modules/@rainbow-me/rainbowkit/dist/index.js`
    ≈L7119-7129). A list with only `injectedWallet` never calls it.
  - Cloud Build passes only `VITE_API_URL` and `VITE_CHAIN_ID` (`cloudbuild.yaml` L44-47). CI
    builds only the demo image (`ci.yml` L91-121).
  - `VITE_CHAIN_ID=""` would also fall back to Anvil, because `Number("")` is 0.
- **L2: the CSP blocks what the page loads.**
  - Every `add_header Content-Security-Policy` in the nginx template (L24, L45, L57, L70) has
    `img-src 'self' data:`. That blocks paid media from the API origin (`/v1/serve/{id}/media`) on
    `/embed-demo`, and house-ad media hosted by publishers.
  - `style-src` and `font-src` block the Google Fonts links in `web/index.html` L18-22.
  - The runbook's manual `openad-web` deploy (§8 L331-333) sets no CSP at all.
- **L3:** `web/Dockerfile` L3-8 still says demo mode hasn't landed on main.

**Items**
1. **The api image carries the deployments.**
   - `api/Dockerfile`: add `COPY contracts/deployments /app/contracts/deployments` and
     `ENV OPENAD_DEPLOYMENTS_DIR=/app/contracts/deployments`. The path must be absolute, because
     `REPO_ROOT` is `/`.
   - A comment says what the directory holds: whatever `<chainId>.json` is committed (`84532.json`
     once Sepolia is deployed). `deploy-gcp.sh --only stack` already refuses without that file.
   - Compose's `/deployments` mount still overrides the path. `.dockerignore` already lets the
     directory through (it excludes only `contracts/out`).
2. **An empty build input means "unset"** (`web/src/lib/wagmi.ts`).
   - Export two pure helpers:
     - `walletConnectProjectId(raw)`: the trimmed value, or `undefined` for undefined, `""` or
       blank.
     - `walletGroups(projectId, dev)`: only the Browser group (`injectedWallet`) when there is no
       id or in DEV; with an id, Browser plus `getDefaultWallets().wallets`.
   - `createRealConfig()` uses both. Without an id it lists no WalletConnect-based wallet, and
     passes a constant placeholder `projectId` that a comment says is never used. Never list
     WalletConnect-based wallets under a fake id again.
   - `resolveTargetChainId` treats a blank `VITE_CHAIN_ID` as unset.
   - New `web/src/lib/wagmi.test.ts`:
     - `""`, `"  "` and `undefined` resolve to `undefined`; `"abc"` resolves to `"abc"`;
     - the groups without an id hold `injected` only;
     - with an id and not DEV, they include `walletConnect`;
     - `createRealConfig()` doesn't throw with an empty id (the regression). Stub
       `import.meta.env` the way the other web tests do.
3. **The build inputs reach the build.**
   - `infra/gcp/cloudbuild.yaml`:
     - declare `_WALLETCONNECT_PROJECT_ID`, `_GUIDE_URL` and `_DEMO_URL`, each defaulting to `""`;
     - pass `VITE_WALLETCONNECT_PROJECT_ID`, `VITE_GUIDE_URL` and `VITE_DEMO_URL` to `build-web`,
       and `VITE_GUIDE_URL` to `build-web-demo` too;
     - use every substitution you declare: Cloud Build rejects an unused user substitution unless
       `substitution_option: ALLOW_LOOSE` is set (inferred; verify before deploy).
   - `scripts/deploy-gcp.sh`, only between L252 and L254 plus L257:
     - a commented block sets:
       - `WALLETCONNECT_PROJECT_ID="${WALLETCONNECT_PROJECT_ID:-}"`;
       - `GUIDE_URL`, defaulting to ADR-0015's hosted guide (the `VITE_GUIDE_URL` value in
         `.env.example`);
       - `DEMO_URL="${DEMO_URL:-}"`, which stays hidden until the demo has its mapped URL
         (43's §9 step).
     - The block refuses any of the three that contains a comma, because gcloud splits
       `--substitutions` on commas.
     - Append `_WALLETCONNECT_PROJECT_ID=…,_GUIDE_URL=…,_DEMO_URL=…` to L257's `--substitutions`.
     - Don't edit `usage()`: 43 documents these three names there (D14).
   - `web/Dockerfile`: rewrite the L3-8 header comment. Say what each `ARG` does, and that an
     empty value means unset.
4. **The CSP matches what the page loads.**
   - The nginx template, in all four CSP lines: `img-src ${CSP_IMG_SRC}`. Its header comment names
     the variable.
   - `web/Dockerfile`: `ENV CSP_IMG_SRC="'self' data:"`, a demo-safe default. It is required: the
     nginx entrypoint substitutes only variables that are defined, and leaves `${CSP_IMG_SRC}` in
     the header literally otherwise.
   - `infra/gcp/services/web.yaml`, L29-33 only:
     - `CSP_IMG_SRC: "'self' data: ${API_ORIGIN} https:"`. Paid media come from the API origin;
       house ads come from publisher-hosted https URLs (`<open-ad>` on `/embed-demo`, and the
       Supply house-ad preview).
     - `connect-src` gains `https://*.walletconnect.com https://*.walletconnect.org` beside the
       existing `wss://` entries (inferred; verify before deploy).
     - Fix the comment.
   - `web-demo.yaml`: `CSP_IMG_SRC: "'self' data:"` next to `CSP_CONNECT_SRC`, with the same
     "never widen" note.
   - Fonts:
     - Remove the Google Fonts `preconnect` and stylesheet from `web/index.html`, L18-22 only (46
       edits L8-14 on #16).
     - The CSS stack (`--font-sans: Inter, ui-sans-serif, system-ui, sans-serif`) already falls
       back. Normal builds then look like the demo, which the screenshots come from, and no
       visitor IP goes to Google.
     - `web/vite.config.ts` `demoIndexHtml`, L44-56 only: drop the font regex and fix the comment.
       Keep the favicon line.
   - Runbook `docs/deploy-gcp.md`:
     - §6 (L257-268): the new substitutions and build args.
     - §8, L291-296: the api image carries `contracts/deployments` with `OPENAD_DEPLOYMENTS_DIR`
       set, so rebuild it after a `84532.json` or `8453.json` commit.
     - §8, L331-333: `openad-web` gets `--set-env-vars` for `CSP_CONNECT_SRC` (as in `web.yaml`)
       and `CSP_IMG_SRC`. Add one sentence: other wallet-SDK endpoints are inferred; check the
       browser console for CSP reports in staging before setting a WalletConnect id in prod.
5. **CI proves every image boots** (`.github/workflows/ci.yml`, the `docker` job; 42 is its sole
   owner).
   - Setup:
     - a `postgres:16` service, as in the `api` job;
     - `actions/setup-node` and `npm ci`;
     - `npx playwright install chromium --with-deps` (CI only).
   - **api image:**
     - Before `docker build`, write a CI-only minimal `contracts/deployments/84532.json`:
       `artifactVersion` 1, `chainId` 84532, and one `CampaignVault` entry with `abi: []`.
       Delete it right after the build. Never commit it. Build the web images outside that
       window, so `sync:deployments` never sees it.
     - In the image, check that:
       - `load_deployment(Settings().deployments_path, 84532)` loads, and the path is
         `/app/contracts/deployments`;
       - `uv run alembic upgrade head` succeeds against the service DB (`--network host`);
       - the image's own CMD, started with the DB URL, answers `curl --retry … /v1/health` with
         200.
   - **Non-demo web image:**
     - Build with `--build-arg VITE_API_URL=http://127.0.0.1:8000
       --build-arg VITE_CHAIN_ID=84532` and **no** WalletConnect id: that is the regression.
     - Run it; check `/healthz` and a CSP header with `img-src 'self' data:`; then run the boot
       check.
   - **Web-demo image:** keep the existing checks, add the same `img-src` assert, and run the
     boot check on it too.
   - **Boot check:** a new `e2e/scripts/web-boot-check.mjs <url> [--out <dir>]`.
     - It uses `chromium` from `@playwright/test`, and honours `PLAYWRIGHT_CHROMIUM_PATH` when it
       is set (as `e2e/demo/demo.config.ts` does).
     - It fails:
       - on any `pageerror`;
       - when `#root` has no element children or no visible text 10 s after load;
       - on a console message matching `/projectId/i`.
     - Failed network requests are allowed: there's no API in CI.
     - On failure it saves a screenshot into `--out`, and the job uploads it with `if: failure()`.
6. **Docs, 42's hunks only:**
   - `infra/gcp/README.md` L9-11: the cloudbuild bullet lists the new substitutions.
   - `.env.example` L98 only: an unset or empty `VITE_WALLETCONNECT_PROJECT_ID` means browser
     (injected) wallets only.
   - ADR-0017 L138-139: the api image carries `contracts/deployments` and sets
     `OPENAD_DEPLOYMENTS_DIR`.
   - `scripts/check-sh.sh`: one block inserted between L115 and L116. It asserts that the dry-run
     `builds submit` line carries `_WALLETCONNECT_PROJECT_ID=`, `_GUIDE_URL=` and `_DEMO_URL=`.

**Owns** the hunks above.

**Must not touch:**
- `deploy-gcp.sh` outside its block and L257, including `usage()`;
- `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, README, `docs/threat-model.md`;
- `infra/gcp/services/{api,indexer,settler}.yaml`, `jobs/migrate.yaml` and `deploy.yml`;
- the runbook outside L257-268, L291-296 and L331-333;
- `web/index.html` outside L18-22.

**Verify:**
```bash
cd /home/claude/OpenAd-42
npm run typecheck && npm run lint && npm run test && npm run build && npm run build:demo \
  && node web/scripts/check-demo-bundle.mjs
npx prettier --check web/src/lib/wagmi.ts web/src/lib/wagmi.test.ts web/vite.config.ts \
  web/index.html e2e/scripts/web-boot-check.mjs
npm run check:sh
python3 -c "import yaml,sys; [yaml.safe_load(open(f)) for f in sys.argv[1:]]" \
  .github/workflows/ci.yml infra/gcp/cloudbuild.yaml infra/gcp/services/web.yaml infra/gcp/services/web-demo.yaml
# The CI docker job's checks, run locally (dockerd up; ports 5181-5189; the 84532.json fixture
# exists only while the api image builds, then is deleted):
docker build -f api/Dockerfile --build-arg UV_EXTRAS=gcs -t openad-api:42 .
docker run --rm openad-api:42 uv run python -c "from openad.config import Settings; from openad.chain.deployments import load_deployment; s=Settings(); print(s.deployments_path, load_deployment(s.deployments_path, 84532).chain_id)"
docker build -f web/Dockerfile --build-arg VITE_API_URL=http://127.0.0.1:8000 --build-arg VITE_CHAIN_ID=84532 -t openad-web:42 .
docker run -d --name web42 -p 5181:8080 openad-web:42 && node e2e/scripts/web-boot-check.mjs http://127.0.0.1:5181/
curl -sI http://127.0.0.1:5181/ | grep -i "content-security-policy" | grep -F "img-src 'self' data:"
# Negative control: the same boot check against an image built from f50076d's web/ must fail
# (blank root, or a projectId error). Say which in the handback.
git status --short     # no 84532.json, no package-lock.json churn
git diff --stat origin/main...HEAD
```

**Done when:**
- Both image checks pass locally and in the PR's CI `docker` job, and the negative control fails
  on the old code.
- The web unit tests pass, including the new `wagmi.test.ts`.
- The build inputs reach Cloud Build; the CSP allows exactly the image sources listed; no Google
  Fonts are loaded.
- No file outside the owned hunks changed, and the Opus review passes.

### Step 43 — Cloud Run wiring (slice P, `fix/cloud-run-wiring`)

_Specced 2026-09-25 10:05 UTC (REPLAN). Facts checked at `f50076d`; line numbers are main's._

**Amendment (2026-09-25 ~12:00 UTC; R1 FIX, now in fix round 1; the orchestrator's decisions,
D14's and D15's amendments).**
- **L1:** the new "service account that runs the build" paragraph sits inside base L427-432,
  which #16 edits (L429). Move it into the L401-426 or L433-438 hunk.
- **L2s:**
  - The check-sh `SECRETKEY` test can't fail. Make it fail on the old code.
  - `origin_of` cuts only at "/", so a query or fragment leaks into the CSP, a bare host is
    mangled, and the refusal prints the credential. It returns `scheme://host[:port]` only, and
    no refusal prints a credential.
  - The origin checks run after Cloud Build, the migrate job and the replaces. Every guard runs
    before the first side effect, above base L252 (L252-257 stay 42's).
  - The runbook's `--only stack` example has no `API_URL`/`WEB_URL`, and the first-run smoke uses
    custom domains that can't serve before §9. Set both in the example, and smoke each service's
    `status.url` until §9.
  - Item 7's bucket-scoped `roles/storage.admin` on `<PROJECT_ID>_cloudbuild` is likely
    insufficient. Instead:
    - §2 creates `gs://<PROJECT_ID>-openad-builds` with `--uniform-bucket-level-access`;
    - §10 grants the deployer `roles/storage.admin` on that bucket only;
    - `usage()` and the runbook document `BUILD_STAGING_BUCKET` (default
      `<PROJECT_ID>-openad-builds`);
    - the build's runner SA gets `roles/cloudbuild.builds.builder` and
      `roles/artifactregistry.writer`;
    - all of it marked "(inferred; verify before deploy)". 42 adds the
      `--gcs-source-staging-dir` flag.
  - Base L273 (§7's manual `envsubst`) omits `VPC_NETWORK` and `VPC_SUBNET`. 43 now owns L273.
- **L3s:**
  - an opt-in `PUBLIC_INVOKER=iam-disabled` deploys api, web and web-demo with
    `--no-invoker-iam-check` instead of the `allUsers` binding (inferred);
  - check-sh asserts that the indexer and settler never get `allUsers`;
  - the new check-sh tests unset variables with `env -u`, so a caller's environment can't mask
    them;
  - §11's smoke block exits non-zero when a check fails;
  - `API_ORIGIN` is documented in `usage()`, or is no longer an override;
  - ADR-0017 L105-106 name the settler too;
  - the §2 bucket uses `--uniform-bucket-level-access` (above).

**When and where:**
- Worktree `/home/claude/OpenAd-43`, branch `fix/cloud-run-wiring` off `f50076d`. It runs in
  parallel with 42, 44, 45 and 46.
- Sonnet coder, Opus review. **Risk: medium.** It is deploy-time only, with no product code, but
  most GCP facts can't be checked here.
- No WebFetch or WebSearch (D14). Mark every GCP fact the repo can't prove "(inferred; verify
  before deploy)".
- Postgres DB `openad_test_43`, only if you run the api suite (43 changes no api code).
- Commit on the branch (`fix(infra): …`). The orchestrator opens the PR. Don't touch
  `docs/ROADMAP.md` or README: 47 records this step as 6.12.

**Evidence:**
- **L1: no service can reach the database.**
  - §3 creates the instance with `--no-assign-ip` (L60), a private IP only.
  - No manifest configures VPC egress, so Cloud Run has no route to that IP.
  - The `db-custom-1-3840` tier (L59) is given without `--edition=ENTERPRISE`. New PG16
    instances default to Enterprise Plus, which doesn't offer `db-custom-*` tiers (inferred;
    verify before deploy).
- **L1: the scripted deploy leaves the public services private.**
  - `gcloud run services replace` applies no IAM. The manual path's `--allow-unauthenticated`
    (§8) has no counterpart in `deploy-gcp.sh`.
  - `WEB_DEMO_URL` is an undocumented placeholder (`deploy-gcp.sh:221`), used by the web-demo
    smoke check (L298-299).
- **L1: the WIF deployer can't run `gcloud builds submit`.** §10 grants only `run.admin`,
  `iam.serviceAccountUser` and `artifactregistry.writer` (L420-426).
- **L3s:**
  - §11's `curl -sf …/v1/serve/1` fails on a fresh deploy, since there's no slot 1 yet; its
    `/demo/` path doesn't exist, because the demo is its own service.
  - `openad-media-<ENV>` is a global bucket name that someone else may already own.
  - `RPC_ORIGINS="${RPC_ORIGINS:-$RPC_URL}"` (`deploy-gcp.sh:223`) puts a keyed RPC URL into
    the public CSP header, although the web app never uses `RPC_URL` at all (`wagmi.ts`'s
    `http()` is viem's public chain RPC).
  - ROADMAP 7.13's placeholders do more than pass the same-site guard: `API_URL` and `WEB_URL`
    default to `example.com` (L219-221), and those defaults reach `OPENAD_PUBLIC_URL` and
    `OPENAD_CORS_ORIGINS` (`api.yaml` L51-54) and the web build's `VITE_API_URL`
    (`_API_URL`).
  - `infra/gcp/README.md` L3-5 still says "once `scripts/deploy-gcp.sh` exists".
  - ARCHITECTURE §7's manual list (L590-602) has no settler, and says "(migrations on API
    start)".

**Items**
1. **The private IP is reachable, through Direct VPC egress.**
   - Manifests: add two annotations to the template annotations of `api.yaml`, `indexer.yaml` and
     `settler.yaml` (next to `cloudsql-instances`), and to the execution-template annotations of
     `jobs/migrate.yaml`:
     - `run.googleapis.com/network-interfaces: '[{"network":"${VPC_NETWORK}","subnetwork":"${VPC_SUBNET}"}]'`;
     - `run.googleapis.com/vpc-access-egress: private-ranges-only`.
     Both are inferred; verify before deploy. Private ranges only, so RPC and GCS traffic keep
     Cloud Run's normal internet egress, and no Cloud NAT is needed. Each manifest header's
     "Required env vars" names `VPC_NETWORK` and `VPC_SUBNET`.
   - `deploy-gcp.sh`:
     - `VPC_NETWORK="${VPC_NETWORK:-default}"` and `VPC_SUBNET="${VPC_SUBNET:-default}"` in the
       defaults block;
     - `render()` passes them, and `MEDIA_BUCKET`.
   - Runbook:
     - §1: enable `compute.googleapis.com` and `servicenetworking.googleapis.com`, which PSA and
       VPC egress need (inferred).
     - §3, a paragraph after the PSA block (after L53): Cloud Run reaches the private IP only
       through Direct VPC egress (the annotations above). The subnet (`default` in `<REGION>`)
       needs free addresses (inferred).
     - §3, `gcloud sql instances create` (L58-61): add `--edition=ENTERPRISE`, with the reason.
     - §3, a verify-first note, in that same inserted paragraph (don't edit L62-73: #16
       rewrote the password and connection-string text there, and 47 points it at this note).
       The migrate job (§7) opens the first connection. If the
       `/cloudsql/…` socket can't reach a private-IP-only instance, store the TCP form
       `…@<PRIVATE_IP>:5432/openad` in the secret instead
       (`gcloud sql instances describe openad-<ENV> --format='value(ipAddresses[0].ipAddress)'`;
       inferred; verify before deploy).
     - §8, the api, indexer and settler commands (L298-329): `--network=<VPC_NETWORK>
       --subnet=<VPC_SUBNET> --vpc-egress=private-ranges-only` (inferred), and `<MEDIA_BUCKET>`.
   - ADR-0017:
     - "Database" (L103-111): Direct VPC egress and the Enterprise edition.
     - Append "Amendment (2026-09-25, slice-review fixes)": VPC egress, the edition, the invoker
       binding, the WIF roles, and the placeholder guard. 43 is the only step that appends to this
       ADR.
2. **The public services are public.**
   - `deploy-gcp.sh`: after each `services replace` of `openad-api`, `openad-web-demo` and
     `openad-web`, run `gcloud run services add-iam-policy-binding <svc> --member=allUsers
     --role=roles/run.invoker --project … --region …`. It is idempotent. Never for the indexer or
     the settler.
   - Runbook:
     - §6-8 intro (L234-255): say that the script does this, and why (`services replace` applies
       no IAM).
     - If an org policy (domain-restricted sharing) refuses `allUsers`, give the alternative:
       `run.googleapis.com/invoker-iam-disabled` / `--no-invoker-iam-check` (inferred; verify
       before deploy).
3. **The demo's URL.**
   - An unset `WEB_DEMO_URL` means "ask Cloud Run". After deploying `openad-web-demo`, read
     `gcloud run services describe openad-web-demo --format='value(status.url)'` and smoke that.
     Under `--dry-run`, print a placeholder.
   - Runbook §9 (L359-365): a third mapping, `gcloud run domain-mappings create
     --service=openad-web-demo --domain=demo.<domain>`. Then set both `WEB_DEMO_URL` and `DEMO_URL`
     (42's input for the web build's "Try the demo" link) to that URL.
4. **No placeholders in a real deploy.**
   - `deploy-gcp.sh`: `--only stack|all` refuses when `API_URL` or `WEB_URL` is unset or empty.
     - Check before the defaults are applied; don't pattern-match `example.com`, because
       `check-sh.sh`'s accept cases use `example.com` hosts.
     - The guard runs under `--dry-run` too, like the others. `--only demo` needs neither URL.
   - `.github/workflows/deploy.yml` (43 owns it): pass these from the `staging` environment's
     `vars`: `API_URL`, `WEB_URL`, `WEB_DEMO_URL`, `MEDIA_BUCKET`, `VPC_NETWORK`, `VPC_SUBNET`,
     `WALLETCONNECT_PROJECT_ID`, `GUIDE_URL` and `DEMO_URL`. An unset var arrives as an empty
     string; the guard and the defaults treat that as unset.
   - This closes 7.13's placeholder part; 47 notes it in the ROADMAP.
5. **The bucket name is per project.**
   - `MEDIA_BUCKET="${MEDIA_BUCKET:-openad-media-${PROJECT}-${ENV}}"`, because bucket names are
     global.
   - `api.yaml` L46 and `indexer.yaml` L35 use `${MEDIA_BUCKET}`.
   - The runbook's §4 (L183, L191, L198) and §8 use `<MEDIA_BUCKET>`, with that suggested value.
   - The `.env.example` L41 comment, and ADR-0017 L118 (`openad-media-<env>`).
   - #16 rewrote §14 (Teardown), so its bucket line is 47's.
6. **CSP entries are origins.**
   - `RPC_ORIGINS` defaults to the public RPC the web app actually uses: `https://sepolia.base.org`
     for staging, `https://mainnet.base.org` for prod. Never `RPC_URL`.
   - A new `origin_of` helper, next to `host_of`, reduces each caller-set `RPC_ORIGINS` entry to
     `scheme://host[:port]` and refuses an entry with userinfo. `API_ORIGIN` is
     `origin_of "$API_URL"`.
   - `web.yaml`'s header comment (L5-7) says so.
7. **WIF roles for `gcloud builds submit`.**
   - Runbook §10, the roles loop (L420-426) adds:
     - `roles/cloudbuild.builds.editor`;
     - `roles/serviceusage.serviceUsageConsumer`;
     - `roles/logging.viewer`: gcloud streams `CLOUD_LOGGING_ONLY` build logs, and exits
       non-zero without it;
     - `roles/storage.admin` on the bucket `gs://<PROJECT_ID>_cloudbuild`, for the source upload.
   - §2 pre-creates that bucket, since the deployer SA can't create buckets.
   - The service account that runs the build needs `roles/artifactregistry.writer`: new projects
     may run builds as the Compute Engine default SA.
   - Mark all of this "(inferred; verify before deploy)". Keep the "never owner or editor" rule.
   - §10's secrets paragraph (L433-438) lists item 4's environment `vars`. Don't touch L427-432
     (#16 edits L429).
8. **Smoke checks pass on a fresh deploy.** Runbook §11 (L440-446):
   - `/v1/health` must return 200;
   - `/v1/serve/1` may be a 404 with a JSON body on a fresh deploy, so check for 200-or-404 and
     JSON, not `-f`;
   - the demo is checked at its own host's `/healthz`, not `/demo/`.
   The script already smokes only `/v1/health` and `/healthz`.
9. **Stale docs.**
   - `infra/gcp/README.md` (L1-5 and L20-52; L9-11 is 42's):
     - fix L3-5;
     - the placeholder table gains `MEDIA_BUCKET`, `VPC_NETWORK`, `VPC_SUBNET` and
       `WEB_DEMO_URL`;
     - note the invoker binding and the placeholder guard.
   - ARCHITECTURE §7's manual-equivalent block (L590-602 only):
     - add `cd api && uv run python -m openad.settler` (needs `OPENAD_SETTLER_KEY`);
     - "(migrations on API start)" becomes "api/indexer/settler as containers; a one-shot
       `migrate` service runs first".
10. **`usage()`** (43 owns it). Document every environment input the script reads:
    - `API_URL` and `WEB_URL` (required for stack and all);
    - `WEB_DEMO_URL`, `MEDIA_BUCKET`, `VPC_NETWORK`, `VPC_SUBNET`, `RPC_URL` and `RPC_ORIGINS`;
    - 42's `WALLETCONNECT_PROJECT_ID`, `GUIDE_URL` and `DEMO_URL` (empty means the feature is
      hidden).
    Add the new guard to the Guards list.
11. **`check-sh.sh`** (43 owns it, except 42's block between L115 and L116). Insert the new
    dry-run tests after L120 and after L184:
    - `--only demo` prints an `add-iam-policy-binding` line naming `openad-web-demo` and
      `allUsers`, and a `services describe openad-web-demo` line;
    - `--only stack` with `API_URL`/`WEB_URL` unset, and with them empty, is refused by the new
      guard's own message;
    - with `RPC_URL=https://rpc.example/v2/SECRETKEY`, no output line contains `SECRETKEY`.
    The existing tests keep passing unchanged.

**Owns** the hunks above; see D14.

**Must not touch:**
- `deploy-gcp.sh` L252-257 (42's block and the Cloud Build call);
- `cloudbuild.yaml`, `ci.yml`, both Dockerfiles, the nginx template, `web-demo.yaml`, and
  `web.yaml` L29-33;
- `api.yaml` after L69 (45 appends there);
- the runbook's §3 L62-178, §5, §8 L291-296, L331-333 and L341-344, §9 L396-399, §10 L427-432,
  and any new §11 subsection;
- ADR-0017 L51-54, L138-139, L152-154 and L186-187;
- ARCHITECTURE outside L590-602; ROADMAP; README; `docs/threat-model.md`.

**Verify:**
```bash
cd /home/claude/OpenAd-43
npm run check:sh
bash -n scripts/deploy-gcp.sh; command -v shellcheck && shellcheck -x scripts/*.sh
for f in infra/gcp/services/*.yaml infra/gcp/jobs/migrate.yaml infra/gcp/cloudbuild.yaml .github/workflows/deploy.yml; do
  python3 -c "import sys,yaml; yaml.safe_load(open(sys.argv[1]))" "$f" || echo "FAIL $f"; done
# Render every manifest the way render() does; each must parse, and no ${...} may be left over:
export PROJECT_ID=p REGION=r ENV=staging IMAGE_TAG=t CHAIN_ID=84532 RPC_URL=https://sepolia.base.org \
  API_URL=https://api.x.com WEB_URL=https://app.x.com API_ORIGIN=https://api.x.com \
  RPC_ORIGINS=https://sepolia.base.org MEDIA_BUCKET=b VPC_NETWORK=default VPC_SUBNET=default
for f in infra/gcp/services/*.yaml infra/gcp/jobs/migrate.yaml; do
  envsubst <"$f" | python3 -c "import sys,yaml; yaml.safe_load(sys.stdin)" && envsubst <"$f" | grep -n '\${' && echo "LEFTOVER in $f"; done
grep -c "inferred; verify before deploy" docs/deploy-gcp.md    # every new GCP fact is marked
git diff --stat origin/main...HEAD                               # owned files only
```

**Done when:**
- `check:sh` passes, with the new tests.
- Every manifest renders to valid YAML with no placeholder left over.
- Each L1 above has a concrete script or runbook change, and every GCP fact the repo can't prove
  is marked.
- No file outside the owned hunks changed, and the Opus review passes.

### Step 44 — A dedicated settler key (slice Q, `fix/settler-key`)

_Specced 2026-09-25 10:05 UTC (REPLAN). Facts checked at `f50076d`._

**When and where:**
- Worktree `/home/claude/OpenAd-44`, branch `fix/settler-key` off `f50076d`. It runs in parallel
  with 42, 43, 45 and 46.
- Opus coder, Opus review. **Risk: high**: it is about custody of the contract owner key, and it
  changes the deploy script.
- Postgres DB `openad_test_44`.
- Commit on the branch (`fix(contracts): …`, `fix(api): …`). The orchestrator opens the PR.
  Don't touch `docs/ROADMAP.md` or README: 47 records this step as 6.13.

**Evidence: L1, the contract owner key goes into the settler container.**
- `contracts/script/deploy.py` L274-279 set the treasury, the vault's settler and the moderator
  to `boa.env.eoa`: the deployer, which is the Ownable owner of all four contracts.
- The runbook's §5 (L217-219, "Generate/import the deployer/settler EOA's private key") then puts
  that key into `openad-settler-key-<ENV>`.
- Whoever takes the settler container's key could therefore call `set_settler`,
  `set_treasury`, `set_fee_bps` and `AdSlot.set_market` (a lease rewrite), not just
  `settle_batch`.
- That breaks AGENTS.md ("the settler … may only `settle_batch`") and ARCHITECTURE §8 L608 ("The
  deploy key exists only in the contracts environment").

**Items**
1. **`deploy.py` takes the settler address.**
   - A pure helper (in `deploy.py`, or a small `script/settler.py` that both scripts import):
     `resolve_settler(network_name, deployer, configured)`.
     - On `pyevm` and `anvil`: `configured`, or else the deployer. Local dev and the compose
       stack keep Anvil #0.
     - On any other network, `configured` is required. It must be a 20-byte hex address, not the
       zero address, and different from the deployer (compared case-insensitively). Otherwise
       raise, naming `OPENAD_SETTLER_ADDRESS` and `docs/deploy-sepolia.md`.
   - `deploy()` reads `OPENAD_SETTLER_ADDRESS` and resolves it before the first transaction, so a
     bad setting fails before any gas is spent. `vault.set_settler(...)` uses it, and the deploy
     prints it.
   - The artifact schema doesn't change. The treasury and the moderator stay as they are: they
     belong to the owner (or the Safe) and are not hot keys.
   - Keep the module docstring (L8-14) and PROTOCOL §10's deploy order (≈L430-445) in sync:
     `set_settler(<dedicated settler EOA>)`, with the deployer only on Anvil or pyevm.
2. **Rotation.** A new `contracts/script/set_settler.py` (`uv run mox run set_settler --network …`):
   - It loads `CampaignVault` from `deployments/<chainId>.json` and applies `resolve_settler` to
     `OPENAD_SETTLER_ADDRESS`.
   - It sends `set_settler` from the owner and prints the new `settler()`.
   - On `base` the owner is a Safe (`docs/deploy-mainnet.md`), so there it prints the calldata for
     a Safe transaction instead of sending.
3. **The settler refuses the owner's key** (`api/src/openad/settler/__main__.py`).
   - Add a pure `check_identity(address, owner, settler, treasury, chain_id)` in a new
     `openad/settler/identity.py`, returning fatal and warning findings.
   - After `load_deployment`, read the vault's `owner()`, `settler()` and `treasury()`.
     - Off chain 31337, exit 1 with `settler.key_is_owner` if the key's address is the owner.
     - Warn with `settler.not_current_settler` if it isn't `settler()`. That is a rotation in
       progress: `SettlerRunner.tick` leaves reverted batches unsettled and retries them.
     - Warn if it equals `treasury()`, because fees would then sit on a hot key.
     - On 31337, only warn.
   - An RPC error during the check is fatal; Cloud Run restarts the container.
   - Start the liveness listener only after the check, so a misconfigured revision never looks
     healthy.
4. **Runbooks.**
   - `docs/deploy-sepolia.md` (44 owns it): a "Settler EOA" section before Broadcast.
     - Create a new EOA for the settler only, for example `cast wallet new`, or eth_account
       writing the key to a 0600 file, never printed to a shared terminal.
     - Fund it with a little Base Sepolia ETH, for gas only; it never needs USDC.
     - Export `OPENAD_SETTLER_ADDRESS=<its address>` for the deploy.
     - Store the key as `openad-settler-key-<ENV>` (`docs/deploy-gcp.md` §5).
     - Rotation: a new EOA → a new secret version → `set_settler` from the owner → redeploy
       `openad-settler`. In between, batches revert with "not settler" and are retried.
   - `docs/deploy-mainnet.md`:
     - the settler is a dedicated EOA, never the Safe or one of its signers;
     - `set_settler` goes through the Safe;
     - the deploy script requires `OPENAD_SETTLER_ADDRESS`.
   - `docs/deploy-gcp.md`:
     - §5, **L218 only** (L217 borders #16's hunk): the key is the dedicated settler EOA's (see
       `docs/deploy-sepolia.md`), never the deployer's or the owner's.
     - §8's settler paragraph (L341-344): one sentence saying the service refuses to start if its
       key owns the vault.
   - `.env.example`:
     - L90-93: staging and prod use a dedicated, gas-only settler EOA.
     - The contracts block (L118-123): `# OPENAD_SETTLER_ADDRESS=` (read by `deploy.py` and
       `set_settler.py`; required off Anvil).
5. **Docs.**
   - ARCHITECTURE §3.9 (L384-387): the settler key is a dedicated EOA that holds gas only. It is
     never the contracts' owner, and off Anvil the process refuses to start if it is.
   - ARCHITECTURE §8 L608: the owner (deploy) key never leaves the contracts environment
     (Moccasin wallet or Safe); the settler holds a separate, gas-only key that can only call
     `settle_batch`.
   - ADR-0017 L51-54: the same, for the settler service.
   - `docs/threat-model.md`:
     - A new **T20** row after T19: compromise of the settler container's key. Mitigations: a
       dedicated gas-only EOA; the deploy refuses the deployer off Anvil; the startup refusal;
       Secret Manager IAM; rotation with `set_settler`.
     - The residual bullet at L64 adds "or anyone holding the settler key, until `set_settler`
       rotates it".
6. **Tests.**
   - `contracts/tests/test_deploy_settler.py`:
     - a table of `resolve_settler` cases: pyevm and anvil default to the deployer; an override
       is honoured; `base-sepolia` and `base` raise without one; a settler equal to the deployer
       raises, in mixed case too; the zero address and malformed input raise;
     - the pyevm deploy still sets `settler() == deployer`, and with `OPENAD_SETTLER_ADDRESS`
       set (monkeypatch), `settler()` equals it;
     - `set_settler.py` uses the same helper.
   - `api/tests/test_settler_identity.py`: item 3's rules, with fakes and no chain.

**Owns:** `contracts/script/`, the new contracts and api tests, `openad/settler/`,
`docs/PROTOCOL.md` §10, `deploy-sepolia.md`, `deploy-mainnet.md`, and the listed hunks of
`deploy-gcp.md`, `.env.example`, ARCHITECTURE, ADR-0017 and the threat model.

**Must not touch:** `contracts/src/` (D8: no protocol contract changes; `set_settler` already
exists on `CampaignVault`), `infra/`, `scripts/`, `.github/`, `AGENTS.md` (#16 edits it), ROADMAP
and README.

**Verify:**
```bash
cd /home/claude/OpenAd-44/contracts && uv run mox compile && uv run pytest -q
cd /home/claude/OpenAd-44/api && uv run ruff check src tests && uv run ruff format --check src tests \
  && uv run mypy src && uv run pytest -q
OPENAD_TEST_PG_URL='postgresql+asyncpg://postgres@/openad_test_44?host=/tmp/pgdata_jit16' uv run pytest -q
cd /home/claude/OpenAd-44/contracts && OPENAD_SETTLER_ADDRESS=0x00000000000000000000000000000000000000a1 uv run mox run deploy   # pyevm: prints that settler
grep -n "set_settler(boa.env.eoa)" script/deploy.py && echo "FAIL deployer settler" || echo ok
git -C /home/claude/OpenAd-44 diff --stat origin/main...HEAD
```

**Done when:**
- No path off Anvil or pyevm can make the deployer the settler.
- The settler process refuses a key that owns the vault.
- Rotation is scripted and documented; the docs and PROTOCOL §10 match the code; T20 is in.
- The contracts and api suites pass, with PG too.
- The Opus review passes.

### Step 45 — CPC click integrity (slice R, `fix/cpc-click-integrity`)

_Specced 2026-09-25 10:05 UTC (REPLAN). Facts checked at `f50076d`; line numbers are main's._

**Amendment (2026-09-25 ~12:00 UTC; R1 FIX, now in fix round 1; the orchestrator's decisions,
D14's and D15's amendments).**
- **L2:** under enforcement, `[::1]` never matched in dev and test, and `Origin: null` with no
  `Referer` counted as a match, so an opaque-origin page (a sandboxed iframe, say) got a paid
  campaign with a live `/v1/c/` token.
  - 45 now also owns `api/src/openad/serve/origin.py` and `api/tests/test_origin.py`.
  - Under enforcement, an explicit `Origin: null` with no usable `Referer` host is a mismatch, a
    request with neither header is a match, and `::1` is a loopback host in dev and test.
  - ARCHITECTURE §3.4, the guide and T13 call the rule best effort.
- **L3s:**
  - a test pins `slot_id` in the burst key (one mutation survived);
  - `.env.example`: the claim about Cloud Run's TCP peer is marked "(inferred; verify before
    deploy)";
  - an XFF chain shorter than the hop count falls back to the shared peer. Keep that (it fails
    closed), and say in the new §11 subsection that behind a load balancer every api request
    must take the same proxies: api ingress `internal-and-cloud-load-balancing`, and
    `OPENAD_PUBLIC_URL` is the LB host.
- **Not 45's:** IPv6 keyed by /64 and `workers/serve` (§8); the `/embed-demo` copy, the §3.3
  heading, the §7 Media cache row, ADR-0014 L117-118 and ADR-0017 L169 (47).

**When and where:**
- Worktree `/home/claude/OpenAd-45`, branch `fix/cpc-click-integrity` off `f50076d`. It runs in
  parallel with 42, 43, 44 and 46.
- Opus coder, Opus review. **Risk: high**: publisher CPC earnings and advertiser spend.
- Postgres DB `openad_test`.
- Commit on the branch (`fix(api): …`). The orchestrator opens the PR. Don't touch
  `docs/ROADMAP.md` or README: 47 records this step as 6.14.

**Evidence:**
- **L2: CDN caching of serve JSON breaks click tokens and analytics.**
  - `routers/serve.py:84` sets `Cache-Control: public, max-age=<ttl>` for every status,
    including campaign responses. Each of those carries a one-time click token (`serve.py:71-81`).
  - A shared cache hands one token to many visitors. The first click pays; every later one is
    "used", and `resolve_click` returns no landing, so the visitor gets a **404**.
  - Cached serves never record a `ServeEvent`, so impressions are undercounted.
  - The runbook (§9 L396-399) and ADR-0017 (L152-154) recommend a CDN on `/v1/serve/*`.
- **L2: the burst key is the proxy's IP, and it never evicts.**
  - `routers/clicks.py:19` keys the burst rule on `request.client.host`. Behind Cloud Run's front
    end, every visitor shares that address.
  - So the second click on a slot within 2 s, from anyone, is marked `burst` and not paid
    (`services/clicks.py:144`).
  - `_BURST` (`services/clicks.py:16`) is a plain dict that grows by one key per client and slot,
    forever.
- **L2: origin enforcement is off in staging and prod.** `config.py:55` defaults it to false, and
  `api.yaml` doesn't set it. The guide (`embed-code.md` L50-54) and ARCHITECTURE §3.4 describe
  paid creatives showing only on the slot's domain.

**Items**
1. **Campaign serve responses are never shared** (`routers/serve.py`).
   - `status == "campaign"` → `Cache-Control: private, no-store`, with no `ETag`.
   - Lease, house and empty keep `public, max-age=<ttl>`, `Vary: Origin` and the ETag. The 404
     for an unknown slot and `/media` don't change.
   - The embed needs no change: it fetches per view, and the serve contract's JSON is unchanged.
   - ARCHITECTURE §3.4 (L232-240 only): the rule, and why (one token per response; each response
     is an impression). §3.3's "Serving (public, cacheable)" heading (L161) is 47's to fix after
     the merge, because 46 edits §3.3 on #16.
2. **A CDN caches media only.**
   - Runbook §9 (L396-399 only): an optional CDN may cache `/v1/serve/*/media`, never
     `/v1/serve/{id}`.
   - ADR-0017 L152-154 and L186-187, in place: the same scope.
3. **The burst key is the trusted client key.**
   - `routers/clicks.py`: the key is `client_key(request, settings.trusted_proxy_hops)`. Reuse
     `openad.ratelimit.client_key`; move it to a neutral module only if the import direction
     forces it, and keep `ratelimit.client_key` importable.
   - The burst rule runs only when that key identifies the visitor: `trusted_proxy_hops > 0`, or
     `settings.is_dev` (in dev and test the TCP peer is the visitor). Put the condition in one
     helper, e.g. `clicks.burst_rule_active(settings)`.
   - Otherwise (staging or prod with 0 hops) the rule is skipped, and `clicks.burst_rule_disabled`
     is logged once, at app startup (`main.py`'s lifespan).
   - Unchanged: the hourly per-campaign cap, the single-use token and the budget checks.
   - `services/clicks.py`: replace the unbounded `_BURST` dict with a bounded map, like
     `ratelimit.TokenBucketLimiter`:
     - at most 10 000 keys, with LRU eviction;
     - expired entries dropped on insert;
     - keyed, as today, by an HMAC of `client_key:slot_id`, so no raw IP is stored.
4. **Origin enforcement is on in the hosted environments.**
   - `infra/gcp/services/api.yaml`: append `OPENAD_SERVE_ENFORCE_ORIGIN: "true"` at the **end** of
     the env list, after L74. 43 edits only L1-7, the annotations and L46. Local dev and compose
     stay off.
   - `.env.example` L34-36: staging and prod set it in `api.yaml`.
   - ARCHITECTURE §3.4 (L238-240):
     - it is on in `infra/gcp` (staging and prod), and off by default for local development;
     - a browser can't forge `Origin`, but a script can, so it narrows third-party embedding and
       doesn't stop click farms.
   - Guide `docs/guide/publisher/embed-code.md` L50-54: paid creatives show only on pages whose
     host is the slot's registered domain or a subdomain of it. That is separate from the
     domain-verification badge.
   - 47 adds `OPENAD_SERVE_ENFORCE_ORIGIN=true` to the runbook's manual api command, which 43
     owns.
   - The hops setting's docs:
     - `.env.example` L81-84: it also keys the click burst rule, and with 0 on Cloud Run the rule
       is skipped;
     - ARCHITECTURE §3.8 (L378-380): the click vars line;
     - a new ARCHITECTURE §8 bullet after L613: the burst map holds at most 10 000 HMAC'd keys,
       in process memory only.
5. **Runbook §11:** a new "### Click integrity" subsection, inserted at L456 (between "Sign-in
   origin" and "Auth rate limit"):
   - once a CPC campaign serves, `curl -sI …/v1/serve/<cpc slot>` shows `private, no-store`;
   - a request with a foreign `Origin` to a leased slot gets `house` or `empty`;
   - the burst rule stays off until the next subsection's steps verify the XFF hop count, and then
     uses the same `OPENAD_TRUSTED_PROXY_HOPS`.
6. **Threat model:** amend **T13**'s row in place (L53):
   - tokens are never shared through a cache (`private, no-store`);
   - the burst HMAC uses the trusted-hop client key, and is off until the hops are verified;
   - in staging and prod, paid serves happen only on the slot's domain.
   There is no new row. T21 is reserved: use it only for a genuinely new threat, placed after T20,
   and say so in the handback.
7. **Tests**, in a new `api/tests/test_click_integrity.py`. Change `test_cpc_serve.py` and
   `test_serve.py` only where they assert the old behaviour.
   - Headers:
     - a campaign serve → `private, no-store`, and no `public`;
     - two serves in a row mint different tokens;
     - lease, house and empty → `public, max-age=30` with `Vary: Origin`;
     - an unknown slot → `public, max-age=60`;
     - media stays public.
   - With hops 1:
     - two clicks through the same peer within 2 s, with different right-most XFF client
       entries, are both payable;
     - the same client twice → the second is `burst`;
     - a forged left-hand entry doesn't change the key.
   - With `env=staging` and hops 0: two clicks from one peer within 2 s are both payable, and the
     disable log is emitted. With `env=test` or `dev` and hops 0, the rule applies to the TCP peer.
   - Eviction: inserting more than the maximum keeps the map bounded and evicts the oldest; an
     expired entry doesn't block.
   - `serve_enforce_origin=True`: a leased slot with a matching `Origin` serves the lease; a
     foreign `Origin` gets house or empty, with `origin_ok=false`. Extend the existing test if
     there is one.
   - Mutation check: reverting each change (the header, the key source, the skip rule, the bound)
     fails at least one test.

**Owns:**
- `routers/serve.py`, `routers/clicks.py` and `services/clicks.py`;
- `main.py`'s lifespan log only, and `ratelimit.py` only if `client_key` moves;
- the new test file;
- the listed hunks of `api.yaml`, `.env.example`, ARCHITECTURE, ADR-0017, the runbook and the
  threat model;
- guide `embed-code.md` L50-54, and `marketplace/performance.md` L8-15 only if a sentence there
  becomes false.

**Must not touch:** `config.py`'s defaults (enforcement stays off locally), the embed,
`infra/` except `api.yaml` after L74, `scripts/`, `.github/`, ROADMAP and README.

**Verify:**
```bash
cd /home/claude/OpenAd-45/api
uv run ruff check src tests && uv run ruff format --check src tests && uv run mypy src && uv run pytest -q
OPENAD_TEST_PG_URL='postgresql+asyncpg://postgres@/openad_test?host=/tmp/pgdata_jit16' uv run pytest -q
grep -n "public, max-age" src/openad/routers/serve.py     # none on the campaign path
grep -n "_BURST: dict" src/openad/services/clicks.py && echo "FAIL unbounded" || echo ok
grep -n "request.client.host" src/openad/routers/clicks.py && echo "FAIL proxy ip" || echo ok
git -C /home/claude/OpenAd-45 diff --stat origin/main...HEAD
```

**Done when:**
- The three L2s are closed, with tests that fail on the old code (the mutation check).
- The docs say exactly what the code does.
- The api suite passes, with PG too.
- The Opus review passes.

### Step 46 — Docs truth on #16 (slice Final): DONE, as-shipped record

**Status:** R2 PASS. Branch `chore/launch-final`, draft **PR #16**, in the primary tree, in
parallel with 42–45. CI is green on both commits. The full pre-implementation spec is in git
history (`30ffdda`).

**Commits:**
- `69e2aa9`: the docs-truth pass (14 files, +145/−53).
- `911d363`: fix round 1 (4 files).

**Files:**
- `docs/business/{demo-script.md, pitch-deck.md, assets/why-calculator.png}`;
- `docs/{ARCHITECTURE.md, ROADMAP.md, threat-model.md}`, `.env.example` and `README.md`;
- `web/index.html`, `web/src/features/marketing/{WhyPage.tsx, WhyPage.test.tsx}` and
  `web/src/lib/{earnings.ts, earnings.test.ts}`;
- `e2e/demo/flows.spec.ts`.

**As shipped:**
- Demo script, 15-minute track: step 3 stays as Nimbus Wallet and opens a campaign on slot 1
  (CPC, approval waived) with creative 3, keeping the defaults (max CPC 0.20 USDC, budget
  10 USDC). A new demo test, "demo script: the 15-minute CPC step as written", checks Campaign 4's
  row: `slot 1 · creative 3`, "Max 0.20 USDC" and "remaining 10.00 USDC of 10.00 USDC".
- Slide 4 claims only what the demo shows: the LEASE buy and its receipt; a funded CPC campaign
  in escrow, seeded settlements, and no live clicks or settler; the embed. It cites no recording,
  and the notes fall back to `docs/business/assets/`.
- ARCHITECTURE §3.3:
  - `GET /v1/slots?domain=&kind=&category=&limit=&offset=` → `{items, total}`;
  - the owner-only listing `PUT` and `DELETE`;
  - `pricing-suggestion` moved under Authenticated, and L159's `publishers/{address}/…` glob
    notes the exclusion;
  - the domain-verification line was checked and left as it was; L161's heading is 47's.
- No phishing blocklist, said honestly:
  - ARCHITECTURE §3.5 step 4; `.env.example` L55 ("Reserved for a future phishing/malware check
    on click URLs (ROADMAP 7.19); nothing reads it yet."); ROADMAP **7.19**;
  - a threat-model residual bullet: takedown is after the fact. The publisher can call
    `set_approval(id, False)` or `revoke_approval(id)` on its own slots, which blocks the creative
    even under WAIVED (`is_blocked_for` checks REJECTED and REVOKED before the waiver), and the
    moderator's `moderator_revoke` works everywhere. These match `ICreativeRegistry.vyi`
    L115/L120/L132 and PROTOCOL L299-302.
- The threat model's scope covers `CampaignVault`, the settler, the web app and the GCP deploy
  configuration, and L12 cites "(ADR-0014)". README: setup deploys `CampaignVault` too (L90-91),
  and L161 reads "Vite + React + Tailwind + wagmi/RainbowKit".
- OG text: "Publishers sell each period of an ad slot by Dutch auction; …". The comment cites
  ROADMAP 7.1.
- `/why`:
  - publishers sell periods, not slots;
  - presets `network-30`, `-40` and `-50`, labelled "Ad network (N% take) (approx.)" (3000,
    4000 and 5000 bps). The default is `network-30`: 3,500.00 USDC against OpenAd's 4,875.00, an
    uplift of 1,375.00 a month and 16,500.00 a year;
  - tests pin the bps values, the "approx." labels, the absence of "crypto" and "agency", the
    payout captions ("Ad network (30% take) payout", "(50% take)") and the glossary regex
    `/\b(sell(s|ing)?|sold|leas(e|es|ed|ing))\s+(an?\s+)?(ad\s+)?slots?\b/i`.
- `why-calculator.png` re-captured (43,478 B). Two capture runs were byte-identical, and no other
  PNG changed.

**Reviews:**
- R1 (Opus) FIX:
  - L2: the residual bullet said the moderator's revoke was the only takedown, which is false →
    it names the publisher's controls and the moderator's.
  - L3: nothing pinned the script's default max CPC → the demo test asserts "Max 0.20 USDC".
  - L3: the WhyPage test didn't pin the payout caption → it pins both.
  - L3: the glossary regex missed "leasing" and "sold ad slots" → the wider regex above.
  - L3 (optional): L159's glob covered `pricing-suggestion` → the exclusion note.
- R2 PASS. Mutations show that each new test catches its regression. One optional L3 is left:
  ARCHITECTURE L159 is 139 characters long → 47 rewraps it.

**Checks:**
- typecheck, lint, build, build:demo and `check-demo-bundle` ok;
- web 237/237, embed 5/5, sim 13 (+1 skipped);
- test:demo 15/15, including the new script test;
- capture run twice, byte-identical; prettier clean on every edited file.

### Step 47 — Final, post-merge pass (slice Final; starts once 42–45 have merged and 46 has passed)

_Specced 2026-09-25 10:05 UTC (REPLAN). 42–45's PR numbers aren't known yet. The orchestrator
gives them when it launches 47, and they replace `#<42>` … `#<45>` below. Amended at STEP_DONE 46
(~12:00 UTC): 46's leftover L3, the stale lines that 45's R1 review found, the embed demo page's
copy, and the launch-checklist notes from 43's and 45's R1 decisions (D14 and D15
amendments)._

**When and where:**
- Primary tree `/home/claude/OpenAd`, `chore/launch-final` (#16). It starts after 42–45 have all
  merged into main. 46 passed its review at `911d363`.
- Sonnet coder, Opus review. **Risk: low**: a merge, plus docs.
- The orchestrator pushes. `.cursor/` stays unstaged, because it's the planner's.

**Items**
1. **Merge main.** `git fetch origin && git merge origin/main` into `chore/launch-final`.
   - D14's hunk plan predicts no textual conflicts. If one appears, keep both sides' meaning and
     name the conflict in the handback.
   - Then re-read the text that now sits side by side:
     - `docs/threat-model.md`: 46's scope and residual bullet, next to 44's T20 and L64 and 45's
       T13;
     - ARCHITECTURE:
       - §3.3–§3.5: 46's lines next to 45's §3.4;
       - §7–§8: #16's table and CI sentence next to 43's manual block, 44's §8 key line, and
         45's burst-map bullet;
     - `.env.example`: 46's L55 next to 42–45's lines;
     - `docs/deploy-gcp.md`:
       - §3: #16's password and connection-string text next to 43's VPC and verify-first
         paragraph;
       - §5: #16's text next to 44's L218;
       - §11's subsections;
     - 45's best-effort origin rule (its §3.4, T13 and guide lines) against everything on
       #16: README, the launch checklist and the deck must not claim more (a request with
       neither `Origin` nor `Referer` is still served paid).
2. **ROADMAP 6.11–6.14**, after 6.10, in 6.8 and 6.9's format: `[x]`, "_Done 2026-09-25 (PR #N)._",
   Pointers and Acceptance. Write each from what its PR shipped (its diff and its as-shipped
   record in §5):
   - 6.11: the deploy images boot (#<42>);
   - 6.12: Cloud Run wiring (#<43>);
   - 6.13: a dedicated settler key (#<44>), with T20;
   - 6.14: CPC click integrity (#<45>), with T13 amended.

   Then:
   - 6.10's acceptance gains three conditions:
     - the settler is a dedicated, gas-only EOA (6.13);
     - the staging environment's `vars` are set (6.12);
     - every "(inferred; verify before deploy)" fact in the runbook has been checked.
   - 7.13: its `deploy.yml` placeholder part is done in 6.12 (#<43>): `--only stack|all` refuses
     unset URLs, and `deploy.yml` passes the environment's `vars`. The PSL-aware guard, the
     prod-mode IP-literal test and the macOS `host_of` check stay open.
   - 7.20 and up, only for the follow-ups that 42–45's handbacks or reviews deferred. Known so
     far (§8): key IPv6 clients by /64 in the burst rule; limit `workers/serve` to `/media`
     before it is ever deployed; generate the runbook's §8 manual commands from the
     manifests; and, optionally, `gcloud builds submit --async`, to drop
     `roles/logging.viewer`.
3. **ARCHITECTURE and the ADRs, after the merge:**
   - §3.3's "Serving (public, cacheable)" heading (L161 on main, L163 on #16 at `911d363`)
     matches 45's rule, e.g. "Serving (public; campaign responses are never cached, § 3.4)".
   - §3.3's publishers line (#16's L159, 139 characters): rewrap it to ≤ 100 (46's optional L3).
   - The §7 table, Media cache, production cell (L565 on main, L582 on #16): "GCS, plus an
     optional CDN on `/v1/serve/*/media` only (ADR-0017)".
   - §7's CI sentence: CI's `docker` job builds the api, web and web-demo images and boot-checks
     each (6.11).
   - §1's package map, "(may later move to a CDN worker)" (L17): only if it still reads as
     caching serve JSON at the edge, say that a CDN may cache `/media` only.
   - ADR-0014 L117-118: the burst HMAC is keyed by the trusted-hop client key and `slot_id`, in a
     bounded map, and skipped until the hop count is verified (6.14), not by `ip + slot_id`.
   - ADR-0017 L169 ("…purely as a CDN for serve traffic"): a CDN for `/v1/serve/*/media` only,
     as 45 wrote at L152-154 and L186-187.
4. **Runbook `docs/deploy-gcp.md`, after the merge:**
   - §14: the bucket line uses `<MEDIA_BUCKET>` (43's per-project name).
   - §8's manual api command: add `OPENAD_SERVE_ENFORCE_ORIGIN=true` to `--set-env-vars`, as in
     `api.yaml` (45).
   - §3's connection-string paragraph (#16's text): one sentence that points at 43's
     verify-first note (unix socket versus private-IP TCP).
5. **Launch checklist** (`docs/business/launch-checklist.md`).
   - Done:
     - L12 becomes "Docker images build and boot-check in CI (`api`, `web`, `web-demo`)",
       citing #<42>;
     - add one row each for #<43>, #<44> and #<45>.
   - User actions:
     - set the `staging` environment's `vars` in GitHub (the list in 43's `deploy.yml`);
     - grant the WIF deployer the Cloud Build roles; pre-create the builds staging bucket
       `gs://<PROJECT_ID>-openad-builds` (uniform access; `BUILD_STAGING_BUCKET` overrides the
       name) and grant the deployer `roles/storage.admin` on it only; grant the build's runner
       service account `roles/cloudbuild.builds.builder` and `roles/artifactregistry.writer`
       (§2, §10);
     - create a dedicated, gas-only settler EOA:
       - fund it with a little Base Sepolia ETH;
       - set `OPENAD_SETTLER_ADDRESS` for the contracts deploy;
       - store its key as `openad-settler-key-<ENV>` (`docs/deploy-sepolia.md`);
     - optionally, get a WalletConnect project id (without one, the app offers browser wallets
       only), then check the browser console for CSP reports in staging;
     - map `demo.<domain>`, and set `WEB_DEMO_URL` and `DEMO_URL` (§9);
     - the XFF row (L35): verifying the chain and setting `OPENAD_TRUSTED_PROXY_HOPS` also turns
       on the CPC click burst rule (6.14). If a load balancer fronts the api, every api
       request must take the same proxies: api ingress `internal-and-cloud-load-balancing`,
       and `OPENAD_PUBLIC_URL` is the LB host (runbook §11, click integrity);
     - only if 43 shipped `PUBLIC_INVOKER`: where the org's domain-restricted sharing refuses
       `allUsers`, deploy with `PUBLIC_INVOKER=iam-disabled` (§6-8);
     - verify the runbook's "(inferred; verify before deploy)" facts in staging.
6. **README and deck.**
   - README "What's in the box": one bullet for the launch fixes (#<42>–#<45>):
     - images that boot on Cloud Run;
     - private database networking, and public services that anyone can reach;
     - a dedicated settler key;
     - CPC click integrity.
   - `pitch-deck.md` Slide 11, "Built": add "deploy and click-integrity fixes". The orchestrator
     regenerates the deck.
7. **The embed demo page's copy** (`web/src/features/marketing/EmbedDemoPage.tsx` L198-199), the
   one product-code exception.
   - Outside demo mode, the page runs on the web app's origin, not on a slot's domain. With origin
     enforcement on in staging and prod (6.14), a leased slot shows its house ad or nothing there,
     while the bullet blames "nothing leased".
   - Add, only when `!DEMO_MODE`: paid creatives show only on the slot's own domain, so on this
     page a leased slot shows its house ad, or nothing. The demo's copy doesn't change, so
     `embed-demo.png` and the demo suite stay as they are.
   - Add a small render test only if it's cheap: the page has no test file today.
8. **Gates:** re-run everything.
   - contracts: `mox compile` and `pytest`;
   - api: ruff, format, mypy and pytest, with PG on `openad_test`;
   - web and embed: `typecheck`, `lint`, `test`, `build`, `build:demo` and `check-demo-bundle`;
   - `check:sh` and `test:demo`;
   - the YAML e2e suite, if the docker stack runs;
   - `capture:screenshots` once: no PNG changes (item 7's copy is outside demo mode). Name any
     PNG that does change in the handback.
   - CI on #16: every check green.
9. **Then the orchestrator runs a targeted Opus re-review** of every finding in the slice review
   (L1 ×6, L2 ×8, the L3s) against #16's head.
   - Each finding is either closed, or recorded as a Phase 7 item with a reason.
   - A FIX sends the planner a REPLAN; a PASS leads to CLOSE.

**Must not touch:** product code, which arrived with 42–45's merge, except item 7's copy in
`EmbedDemoPage.tsx` (and its optional test); `.cursor/`; and any line not listed above, except
to resolve a merge conflict.

**Verify:**
```bash
cd /home/claude/OpenAd
git log --merges --oneline -1                             # the merge of origin/main
for n in 6.11 6.12 6.13 6.14 7.19; do grep -c "\*\*$n " docs/ROADMAP.md; done   # 1 each
grep -rn "#<4[2-5]>\|#TBD" --exclude-dir=node_modules --exclude-dir=.cursor . && echo FAIL || echo ok
grep -rn "openad-media-<ENV>" docs/deploy-gcp.md infra/ && echo "FAIL bucket" || echo ok
grep -n "SERVE_ENFORCE_ORIGIN" docs/deploy-gcp.md infra/gcp/services/api.yaml
grep -n "CDN in front of serve\|Serving (public, cacheable)" docs/ARCHITECTURE.md && echo FAIL || echo ok
grep -n "ip + slot_id" docs/adr/0014-cpc-sale-mode.md && echo "FAIL adr-0014" || echo ok
grep -n "CDN for serve traffic" docs/adr/0017-gcp-deployment.md && echo "FAIL adr-0017" || echo ok
grep -n "_cloudbuild" docs/business/launch-checklist.md && echo "FAIL builds bucket" || echo ok
grep -n "openad-builds\|internal-and-cloud-load-balancing" docs/business/launch-checklist.md
(cd contracts && uv run mox compile && uv run pytest -q)
(cd api && uv run ruff check src tests && uv run ruff format --check src tests && uv run mypy src && uv run pytest -q)
(cd api && OPENAD_TEST_PG_URL='postgresql+asyncpg://postgres@/openad_test?host=/tmp/pgdata_jit16' uv run pytest -q)
npm run typecheck && npm run lint && npm run test && npm run build && npm run build:demo \
  && node web/scripts/check-demo-bundle.mjs
npm run check:sh && npm run test:demo -w e2e
npm run capture:screenshots -w e2e && git status --short docs/business/assets   # no PNG changes
git diff --stat origin/main...HEAD                        # #16's files only (plus .cursor/ after CLOSE)
```

**Done when:**
- Main is merged into #16, and every conflict (none are predicted) is resolved and named.
- ROADMAP 6.11–6.14 cite their PRs; 6.10, 7.13 and 7.19 are right; the docs above describe the
  merged code.
- The ADR lines and the embed demo page's copy match 45's rules, and the launch checklist names
  the builds staging bucket and the load-balancer rule.
- All gates pass locally, and CI is green on #16.
- The Opus review passes, and then the orchestrator's targeted re-review passes.

### CLOSE — Archive the plan (planner; after 47 and a passing targeted re-review; moved here from 36b's item 8)

- The planner writes the files, and the orchestrator commits them on #16.
- Write `.cursor/jit_history/2026-09-25-market-fit-launch.md` in the compact archive style of
  `2026-09-12-sme-ux-critique-loop.md`:
  - the title "# JIT_PLAN — Market fit, hardening and launch (archived)";
  - a header: created 2026-09-24, closed when #16 merges; ROADMAP 6.1–6.9 and 6.11–6.14 `[x]`,
    6.10 open (user-run), and Phase 7 (7.1–7.19, plus any 7.20 and up from 47).
- **Decisions:** D1–D15, condensed.
- **Outcome:**
  - The PR list, each with its slice and merge commit:
    - #4 `801440e`, #5 `8887adb`, #6 `e8a34b8`, #7 `866d7fe`, #8 `591e576`, #9 `07eeece`,
      #10 `eba40cd`, #11 `c3f39dc`, #12 `d5d46a0`, #13 `abb2b81`, #14 `5f27fb8`, #15 `2c4101b`,
      #17 `3605473`, #18 `289bb72`, #19 `f50076d`;
    - then 42–45's PRs, with the merge commits read from `git log --merges` at CLOSE;
    - #16 "merges last" (its commit doesn't exist yet at CLOSE).
  - A **step → PR map**: 36b's table (in git history at `486ab0b`), plus:
    - 42 → #<42>, 43 → #<43>, 44 → #<44>, 45 → #<45>;
    - 36, 36b, 46 and 47 → #16.
    - Steps 2, 17+18 and 32+33 were folded into other steps.
  - The demo and deck links, which stay private until the owner shares them.
  - The open user actions:
    - 36b's list: the 6.10 live deploy, a custom domain, the WIF secrets, the Sepolia deploy plus
      `84532.json`, verifying XFF and then enabling the limiter, confirming `max_connections`,
      the audit, legal, and sharing the Artifacts;
    - plus: the staging environment's `vars`; the WIF Cloud Build roles, the builds staging
      bucket and the runner SA's roles; the dedicated settler EOA; an optional WalletConnect
      id; the demo's domain mapping; `PUBLIC_INVOKER=iam-disabled` where domain-restricted
      sharing refuses `allUsers` (if 43 shipped it); the load-balancer rule, if one fronts the
      api; and verifying the inferred GCP facts.
  - The residual risks:
    - 36b's list: not audited; the per-instance limiter is off until XFF is verified; DNS
      rebinding (T17); T18's per-address verify limit and concurrency; DNS TXT doesn't work; the
      same-site guard isn't PSL-aware;
    - plus:
      - the click burst rule stays off until the hop count is verified;
      - origin enforcement is best effort: a script can forge `Origin`, and a request with
        neither `Origin` nor `Referer` is served as a match;
      - the burst rule keys IPv6 clients by their full address, so one /64 isn't grouped
        (Phase 7);
      - there's no phishing blocklist (7.19);
      - a leaked settler key can over-report payable clicks within the caps until
        `set_settler` rotates it (T20);
      - the GCP facts marked "inferred" stay unverified until staging.
  - A pointer to Phase 7 (7.1–7.19, and any 7.20 and up).
- **Identity fence:** as in §6.
- Delete `.cursor/JIT_PLAN.md`, as `45645e1` did. The full plan stays in git history.
- Refresh `.cursor/JIT_INDEX.md`:
  - ADRs 0001–0017;
  - the Phase 6 section points at the archive;
  - drop the "accepted" and "in progress" wording and the per-step worktree and DB notes;
  - the hosted demo is "rebuilt from main after #16";
  - keep D15's durable rules: images, the settler EOA and click integrity.
- Then the orchestrator:
  1. marks #16 ready and waits for CI to go green;
  2. merges #16;
  3. republishes the demo Artifact from main (same URL, still private);
  4. regenerates the hosted deck from `pitch-deck.md` (Slides 4, 10 and 11; same URL);
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
- 2026-09-25 08:27 UTC — STEP_DONE 40 and 41; 36b launched. **41 DONE**: R1 FIX (L2 the new query's three filters were untested; L3 a docstring; L3 `from`/`to` above 2^256 − 1 gave a 500, pulled into scope → `le=UINT256_MAX`) → R2 PASS, two L3s fixed anyway (an ORM `load` listener instead of SQL text; each param bounded separately); `5f31a5c` + `6b10332` + `7000e4a` (main merged in, T18 before T19) + `a6ba05f`; **PR #18 merged `289bb72`**; pytest 274/6, PG 279/1; EXPLAIN is an index scan on `pk_leases`. **40 DONE**: R1 FIX (L1 a paused CPC slot read 'cpc' — the spec's CPC-before-paused order was wrong, the orchestrator ruled paused wins, and the as-shipped record carries the amended order; L2 a calendar-only `currentPeriodIndex` for the slot page; L2 a full-status oracle; L3 `periodsWindowSize`) → R2 PASS with two L3s (the ceil test line → 36b; the zero-period guard → Phase 7); `50b0285` + `5511a0a` + `173a7c5`; **PR #19 merged `f50076d`**; web 236, test:demo 14/14, YAML 13/13, BigInt oracle 730,418 cases with 0 mismatches. §5's compact specs are replaced by as-shipped records. **36b launched** (Sonnet; Opus review to follow); the orchestrator merged `f50076d` into #16 cleanly as `44aa234`, as D13's check predicted. PR numbers 39 = #17, 41 = #18, 40 = #19 are recorded in 36b and in the CLOSE step → PR map. Added to 36b's ROADMAP pass (relay, not in the coder's brief yet): a 7.7 note that CI's prettier covers only part of `web/`, and a new 7.18 (the missing 'no terms' filter chip and the zero-period guard).
- 2026-09-25 10:05 UTC — REPLAN (slice review FIX). The orchestrator's Opus slice review of the launch state (main `f50076d` plus #16 `cc040ef`) returned **FIX**. Six L1s: the api image has no `contracts/deployments`, so the indexer and settler exit before their liveness listener binds; the non-demo web image boots to a blank page, because an empty WalletConnect id reaches RainbowKit; Cloud Run has no route to the private-IP Cloud SQL (whose tier may also need `--edition=ENTERPRISE`); `services replace` leaves api, web and web-demo private; the WIF deployer can't run `gcloud builds submit`; and the deploy makes the contract owner's key the settler's. Eight L2s: origin enforcement is off in staging and prod; the click burst rule keys on the proxy's IP and never evicts; a CDN on serve JSON would share one-time click tokens and hide impressions; the CSP blocks API media and the fonts; the demo script's Fastlane step can't run; Slide 4 over-claims and cites a recording that doesn't exist; ARCHITECTURE §3.3 has drifted; and the phishing-blocklist claim is false. Plus L3s. The planner re-checked each against the code and confirmed them all. For example, RainbowKit throws in `getWalletConnectConnector`, `REPO_ROOT` is `/` in the image, `pricing-suggestion` is SIWE-only, and `check_click_url` checks only for https. Added **D14** (the split; hunk ownership per file; T20, 6.11–6.14 and 7.19 pre-assigned; the merge order; shared resources; unverified GCP facts marked inferred) and **D15** (the fix rules). New slices O–R, each in its own worktree off `f50076d`: **42** `fix/deploy-images` (Sonnet), **43** `fix/cloud-run-wiring` (Sonnet), **44** `fix/settler-key` (Opus) and **45** `fix/cpc-click-integrity` (Opus), in `/home/claude/OpenAd-42` … `-45`. Plus **46**, docs truth on #16 in the primary tree (Sonnet). All five are specced and [>]. Then **47**: the post-merge pass on #16 (merge main, 6.11–6.14 with the PR numbers, the docs that describe 42–45, and the gates), followed by the orchestrator's targeted Opus re-review, and then **CLOSE** (moved from 36b's item 8 and updated for 42–47). The 36 and 36b specs are replaced by an as-shipped record; the full text is at `486ab0b`. Five backlog notes added.
- 2026-09-25 12:00 UTC — STEP_DONE 46, plus the orchestrator's decisions from 43's and 45's R1 reviews. **46 DONE**: `69e2aa9` (14 files, +145/−53) + `911d363` (fix round 1, 4 files), CI green on both; R1 FIX (L2: the threat model called the moderator's revoke the only takedown, but the publisher's `set_approval(id, False)`/`revoke_approval(id)` block a creative on its own slots, even under WAIVED; L3s: pin the script's default max CPC and the payout caption, widen the glossary regex, note L159's glob) → R2 PASS (mutations prove each new test; one optional L3, L159 is 139 characters → 47). web 237, embed 5, sim 13 + 1 skipped; test:demo 15/15 with the new script test; capture byte-identical twice, only `why-calculator.png` changed (43,478 B); /why defaults to `network-30` (3,500.00 vs 4,875.00 USDC; uplift 1,375.00 a month, 16,500.00 a year). §5's spec is replaced by an as-shipped record (the full text is at `30ffdda`). **45 R1 FIX** (L2: `[::1]` never matched in dev and test, and `Origin: null` with no Referer counted as a match, so an opaque-origin page got a paid campaign with a live `/v1/c/` token): 45 now also owns `serve/origin.py` and `test_origin.py`; an explicit `null` without a usable Referer host is a mismatch, neither header is a match, and the docs and T13 say best effort. Its L3s: pin `slot_id` in the burst key; mark the `.env.example` Cloud Run peer claim inferred; a short XFF chain keeps failing closed, and 45's §11 documents the LB rule (api ingress `internal-and-cloud-load-balancing`, `OPENAD_PUBLIC_URL` = the LB host). **43 R1 FIX** (L1: the runner-SA paragraph sat inside base L427-432; L2s: a check-sh SECRETKEY test that couldn't fail, `origin_of` cut only at "/", origin checks after the first side effect, a `--only stack` example without URLs and a first-run smoke on unmapped domains, bucket-scoped `storage.admin` on `_cloudbuild` likely insufficient, base L273 without the VPC vars; seven L3s, including an opt-in `PUBLIC_INVOKER=iam-disabled`): 43 gains base L273, creates `gs://<PROJECT_ID>-openad-builds` (uniform access) in §2, grants the deployer `storage.admin` on it only in §10, and documents `BUILD_STAGING_BUCKET` and the runner SA's `cloudbuild.builds.builder` + `artifactregistry.writer`, all inferred. **42** adds `--gcs-source-staging-dir` to its Cloud Build call and runbook §6 in its review fix round. **Planner correction:** the flag must read `${PROJECT}`, not `${PROJECT_ID}`: `deploy-gcp.sh` runs under `set -euo pipefail` and sets `PROJECT_ID` only in `render()`'s env prefix, so every run with `BUILD_STAGING_BUCKET` unset would abort (reproduced). Folded into D14 and D15 (amendments), specs 42, 43 and 45 (amendment blocks), 47 (the 45 review's stale lines: the §3.3 heading, the §7 Media cache row, ADR-0014 L117-118 and ADR-0017 L169; the `/embed-demo` copy as the one product-code exception; the L159 rewrap; the builds-bucket, LB and `PUBLIC_INVOKER` launch-checklist notes; the 7.20+ candidates) and CLOSE (user actions; the best-effort origin and IPv6 residuals). Two backlog notes: IPv6 /64 keying and `workers/serve`. 42–45 stay [>]; next is 47, once 42–45 merge, then the targeted re-review and CLOSE.

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
- The slot page lists periods 0–14 only (`lib/api.ts:95` defaults), so a calendar older than 15 periods shows nothing buyable → **fixed by step 40 (PR #19, `f50076d`)**: the page lists 15–60 periods from the current index.
- `GET /v1/slots/{id}/periods` had no range cap and read leases one index at a time (`routers/slots.py:38-50`, `services/periods.py:47-49`) → **fixed by step 41 (PR #18, `289bb72`)**: a 60-period cap, uint256-bounded params, one lease query (T19).
- The sim planner lists periods 0–4 only (`sim/src/planner/snapshot.ts:48`), so sim activity dies out after five periods → Phase 7 as **7.17** (36b).
- 39 notes: an unscoped `ruff format --check` flags `0002_cpc.py` (known, 7.7). Prettier table alignment already fails at base on `docs/ARCHITECTURE.md` and `docs/threat-model.md`, and CI doesn't check docs → 7.7 (36b).
- Code comments cite JIT step numbers ("step 39", "PLAN step 40"), which only the archive's step → PR map resolves → a 7.7 note plus the CLOSE map (36b).
- T18 residual: no per-address or per-session limit on `POST /v1/creatives/{id}/verify` → 7.14 (36b).
- `e2e/demo/capture-screenshots.mjs` finds the bought row by position (`nth(periodIndex)`). Once 40 lists periods from the current index (3 in the demo), the "Leased" wait times out → **36b item 4** (#19 didn't touch the script).
- 40 R2 L3 (b): `periodsWindowSize(0, 0)` is NaN, and `currentPeriodIndex` with a zero period gives Infinity or NaN. Unreachable (`set_calendar` and the demo reducer require periods ≥ 3600 s) → Phase 7 optional guard (7.18 via 36b).
- CI's prettier step covers only `web/src/demo`, `e2e/demo`, `web/src/features/marketing` and `web/src/app/routes.tsx`, so the root `format:check` (all of `web/`) never runs in CI (`web/src/lib/auction.ts` had a pre-existing violation) → 7.7 (36b).
- The new `'no terms'` state has no Discover filter chip, the same pre-existing gap as `'no calendar'` → 7.18 (36b).
- The remaining unscheduled items above → ROADMAP Phase 7 in 36 (36b adds the 7.7 and 7.14 notes, 7.17 and 7.18).

- The runbook's §8 manual `gcloud run deploy` commands repeat the manifests' flags, env vars and annotations, so they drift with every change (42, 43 and 47 all edit them). Generate them from the manifests, or keep only `services replace` → a 7.20 candidate for 47.
- `gcloud builds submit` streams its logs, which is why 43 grants the deployer `roles/logging.viewer`. Using `--async` and polling `gcloud builds describe` would avoid that role → Phase 7 candidate.
- WalletConnect's CSP endpoints (42's `https://*.walletconnect.com`, `https://*.walletconnect.org` and the relay's `wss://`) are inferred, not verified. Check the CSP reports in staging before setting a project id in prod (a launch-checklist user action, via 47).
- Whether Cloud Run can reach a private-IP-only Cloud SQL instance through the `/cloudsql/…` unix socket, or needs private-IP TCP, is unverified. 43 documents both forms, marked "(inferred; verify before deploy)".
- The demo fixtures number slots from 0, but on chain `mint_slot` starts at 1 (`erc721._counter + 1`), and the real `pricing-suggestion` rejects `slot_id=0` (`ge=1`). This is harmless in the demo, and the runbook's smoke check uses slot 1. Not scheduled.

- The click burst rule keys IPv6 clients by their full address, so a client with a /64 can rotate addresses and never trip it. Key IPv6 by /64 → a 7.20+ candidate for 47 (the orchestrator's decision at 45's R1 review).
- `workers/serve/src/index.ts` (ROADMAP 4.4: source only, not deployed) caches every ok `GET /v1/serve/*` response for 30 s, keyed by URL alone, and forwards the first visitor's `Origin`. The api's answer varies by `Origin` (paid or house), and campaign responses carry one-time tokens; whether Cloudflare's `cache.put` skips a `private, no-store` response is unverified. Before it is ever deployed, limit it to `/v1/serve/*/media` → a 7.20+ candidate for 47.
