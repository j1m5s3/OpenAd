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
  - **Amendments (2026-09-25 ~14:15 UTC; STEP_DONE 44 and 45).**
    - As merged: #21 (45, `90d523d`) → `599368a`, then #22 (44, `406b996`) → `5658fcb`. #22 was
      still based on `f50076d`, and GitHub merged it on top of #21 cleanly, as the hunk plan
      predicted.
    - 42 (#20, draft) and 43 merge `origin/main` in before their own merges. No conflicts are
      predicted, but 43's smoke rule must follow main's new §11 (45). Checked at ~14:15 with
      `git merge-tree` (no refs, index or tree touched): #16 (`c9cf63f`) and 42's `a2a9738`
      each merge `5658fcb` cleanly. A hunk check finds that neither 42's in-progress work nor
      43's uncommitted work overlaps or touches #21's and #22's hunks.
    - 43 may also edit `api.yaml`'s service-level ingress annotation (L15), if its round 3
      renders it. No other step touches that line.
  - **Amendments (2026-09-25 ~15:40 UTC; STEP_DONE 42).**
    - As merged: 42 merged main (`5658fcb`) in as `d09712a`, then #20 (`e945590`) → `a7f95f7`,
      with CI 5/5. Main now holds 42, 44 and 45.
    - 43 is the last fix branch: it merges main (now with #20) in before its own merge. 42's R3
      merge-tested its head against 43's working copy: clean in all 9 files both change, and the
      merged `--only all` dry-run keeps D15's order (43's guards, then 42's comma checks, then
      `builds submit`).
    - `check-sh.sh`: 42's hunk is one insertion after base L115 (`@@ -115,0 +116,36 @@`). The
      shared dry-run line, base L110, stays 43's (42's R2 L2).
  - **Amendment (2026-09-25 ~16:05 UTC; 43's R3 FIX, REPLAN).** 43 committed round 3
    (`223f979`) and merged main `a7f95f7` in (`ba94757`), cleanly. Round 4 edits only 43's part of
    `check-sh.sh` and its runbook hunks, and R3's `git merge-file` against main, 42 and #16 was
    conflict-free.
- **D15 — Fix rules: what 42–45 make true.**
  - **Images (42).**
    - The api image carries `contracts/deployments` at `/app/contracts/deployments`, with
      `OPENAD_DEPLOYMENTS_DIR` set. The path is absolute because `REPO_ROOT` is `/` in the image.
    - An empty `VITE_*` build input means unset:
      - no WalletConnect project id → injected (browser) wallets only;
      - no guide URL or demo URL → those links are hidden;
      - the one exception, by design: an empty `VITE_API_URL` means same-origin requests.
        `api.ts` reads it with `??`, which keeps `""`; `||` would bake its dev default
        (`http://localhost:8000`) into the bundle (judged at STEP_DONE 42; §8).
    - The inputs flow from `deploy-gcp.sh`'s environment (`WALLETCONNECT_PROJECT_ID`,
      `GUIDE_URL`, `DEMO_URL`), through Cloud Build substitutions (`_WALLETCONNECT_PROJECT_ID`,
      `_GUIDE_URL`, `_DEMO_URL`), to build args.
    - CSP `img-src` comes from `CSP_IMG_SRC`. The image default is `'self' data:`, and `web.yaml`
      adds the API origin and `https:`.
    - No build loads Google Fonts.
    - CI boot-checks the api image and both web images.
    - As shipped (#20, merged `a7f95f7`): `wagmi.ts` exports `walletConnectProjectId` and
      `walletGroups`, and a blank `VITE_CHAIN_ID` counts as unset. `deploy-gcp.sh` refuses a
      comma in any of the three inputs, and its Cloud Build call stages the source in
      `gs://${BUILD_STAGING_BUCKET:-${PROJECT}-openad-builds}/source`. Both web build steps set
      `DOCKER_BUILDKIT=1`. The boot check fails on any `pageerror` or `projectId` console
      message, and on an empty `#root` at first paint or after a settle window. CI writes its
      `84532.json` fixture only when none is committed, and deletes only a file it wrote.
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
        smoke checks use each service's `status.url` until §9 maps the domains. The api is the
        exception once its ingress is `internal-and-cloud-load-balancing` (main's §11, #21):
        then only `API_URL`, the load balancer's host, reaches it (43's R2 L2);
      - Cloud Build stages its source in `gs://<PROJECT_ID>-openad-builds`
        (`BUILD_STAGING_BUCKET`), which §2 pre-creates with uniform access. The deployer holds
        `roles/storage.admin` on that bucket only, and the build's runner SA holds
        `roles/cloudbuild.builds.builder` and `roles/artifactregistry.writer` (inferred);
      - the indexer and settler never get `allUsers` (a check-sh assertion). An opt-in
        `PUBLIC_INVOKER=iam-disabled` (`--no-invoker-iam-check`) replaces the binding where
        domain-restricted sharing refuses `allUsers` (an L3; inferred).
    - **Amended (~16:05 UTC, 43's R2 and R3):**
      - the api's ingress is rendered from `API_INGRESS` (`all` by default). Set
        `internal-and-cloud-load-balancing` only once the load balancer serves `API_URL`, and the
        api smoke follows it: `status.url` while `all`, `API_URL` otherwise;
      - `origin_of` accepts only `host[:digits]` after an http, https, ws or wss scheme, so
        userinfo (`@`) and `*.` wildcard hosts are refused;
      - `PUBLIC_INVOKER=iam-disabled` is written into the rendered manifests as the
        `run.googleapis.com/invoker-iam-disabled` annotation, so a later `services replace`
        keeps it (inferred);
      - check-sh kills each rule's mutants, including the api and web bindings, bind before
        smoke, and an `RPC_ORIGINS` default that is never `RPC_URL` (round 4).
  - **Settler (44).**
    - The settler is a dedicated, gas-only EOA.
    - `deploy.py` requires `OPENAD_SETTLER_ADDRESS` off Anvil and pyevm, and refuses the deployer.
    - `set_settler.py` rotates it.
    - The settler process refuses to start (off 31337) when its key owns the vault.
    - As shipped (#22): `resolve_settler` also refuses a malformed, zero or bad-checksum
      address. A rotation also refuses `owner()` and the artifact's deployer, and sends from
      the checked owner (on `base` it prints the Safe transaction). The process also refuses
      the artifact's deployer, and a chain mismatch is always fatal.
  - **Clicks (45).**
    - Campaign serve responses are `private, no-store`: each carries a one-time token, and each
      is an impression.
    - Lease, house and empty responses stay `public, max-age=<ttl>`.
    - A CDN may cache `/v1/serve/*/media` only.
    - The burst rule keys on `client_key(request, OPENAD_TRUSTED_PROXY_HOPS)`, in a bounded map.
      It is skipped, and logged, when hops are 0 outside dev and test.
    - `api.yaml` sets `OPENAD_SERVE_ENFORCE_ORIGIN=true`.
    - **Amended (~12:00 UTC, 45's R1; as shipped in #21, ~14:15 UTC):**
      - origin enforcement is best effort (`serve/origin.py`, `origin_allowed`). An `Origin`
        that names no host (`null` included) is a mismatch unless the `Referer` names a matching
        host, a request with neither header is a match, loopback hosts (`::1` included) count
        only in dev and test, and a malformed header no longer gives a 500;
      - a load balancer, if used, fronts every api path on the `API_URL` host
        (`OPENAD_PUBLIC_URL`). Cloud CDN caches `/v1/serve/*/media` only, through a
        path-scoped backend, never with `FORCE_CACHE_ALL` (inferred);
      - behind it, every api request must take the same proxies, and closing the api's ingress
        (`internal-and-cloud-load-balancing`) is the fix. An XFF chain shorter than the hop
        count falls back to the shared TCP peer, which only groups honest visitors on that path
        and stops no one who forges an entry (R2 corrected "fails closed");
      - tests pin `slot_id` in the burst key, and `allow_local`;
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
| O Fix: the deploy images boot (api deployments, web WalletConnect/CSP/fonts, CI image boot checks) | `fix/deploy-images` (#20, merged `a7f95f7`) | 6.11 (47) | main `f50076d`; independent of P, Q and R (D14); merges before Final |
| P Fix: Cloud Run wiring (VPC egress, SQL edition, invoker, WIF roles, deploy nits) | `fix/cloud-run-wiring` (`ba94757`, round 4; worktree `/home/claude/OpenAd-43`) | 6.12 (47) | main `f50076d`; independent of O, Q and R; the last fix branch, with main `a7f95f7` merged in; merges before Final |
| Q Fix: a dedicated settler key | `fix/settler-key` (#22, merged `5658fcb`) | 6.13 (47) | main `f50076d`; independent of O, P and R; merges before Final |
| R Fix: CPC click integrity (no-store campaign serves, trusted burst key, origin enforcement) | `fix/cpc-click-integrity` (#21, merged `599368a`) | 6.14 (47) | main `f50076d`; independent of O, P and Q; merges before Final |
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
- ✓ 42. O: the deploy images boot. DONE 2026-09-25, **PR #20 merged `a7f95f7`**:
  - the api image carries `contracts/deployments` and sets `OPENAD_DEPLOYMENTS_DIR`;
  - an empty WalletConnect id no longer blanks the real web app (injected wallets only);
  - the WalletConnect id and the guide and demo URLs reach the web build (Cloud Build
    substitutions, fed by `deploy-gcp.sh`), and Cloud Build stages its source in the builds
    bucket (`--gcs-source-staging-dir`, with `${PROJECT}`);
  - `CSP_IMG_SRC`, no Google Fonts, and a CSP on §8's `openad-web` command;
  - CI builds and boot-checks the api image and both web images.
  R1 FIX (L1: runbook §6's builds lacked the staging flag, and its `--tag` example was invalid;
  L2: the boot check passed at first paint; L2: the CI fixture could clobber a committed
  `84532.json`; six L3s) → fix round 1 (`60c2af8`), then main merged in (`d09712a`) → R2 FIX
  (L2: the `check-sh.sh` edit reached base L110, 43's shared dry-run line; two L3s) → round 3
  with an Opus coder (`e945590`) → **R3 PASS**. CI 5/5 on `e945590`. **Coder:** Sonnet, then
  Opus for round 3. **Risk: medium.** **(as-shipped record below)**

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
    round 1: guards before any side effect, `origin_of` → `scheme://host[:port]`, the builds
    staging bucket, base L273 (D14 and D15 amendments) → R2 FIX (L2: the api smoke always uses
    `status.url`, which fails behind a load balancer with closed ingress, main's §11; L2: the
    new rules are untested; L3s) → round 3 with a new Opus coder (`223f979`), then main
    `a7f95f7` merged in (`ba94757`, clean; check:sh 71 ok) → R3 FIX (the code stands; L2: 4 of
    40 check-sh mutants survive; L3s: two runbook points, four untested rules) → round 4, tests
    and docs only, the same Opus coder (REPLAN 16:05).
  **Coder:** Sonnet for rounds 1–2, then a new Opus coder, with an Opus review. **Risk: medium.**
  **(spec below)**

### Slice Q — `fix/settler-key` (slice-review fix; worktree `/home/claude/OpenAd-44` off `f50076d`; parallel)
- ✓ 44. Q: a dedicated, gas-only settler EOA. DONE 2026-09-25, **PR #22 merged `5658fcb`**:
  - `deploy.py` requires `OPENAD_SETTLER_ADDRESS` off Anvil and pyevm, and refuses the deployer
    (`script/settler.py`'s `resolve_settler`, with forbidden roles);
  - `set_settler.py` rotates it: it refuses `owner()` and the artifact's deployer, sends from the
    checked owner, and on `base` prints the Safe transaction;
  - off 31337, the settler process refuses to start when its key is the vault's owner or the
    artifact's deployer, and a chain mismatch is fatal everywhere (`settler/identity.py`);
  - runbooks, PROTOCOL §10, and threat-model **T20**.
  R1 FIX (L2: after ownership moved to a Safe, rotating to the deployer went through; four L3s) →
  fix round 1 → **R2 PASS**, plus a test that kills the last mutant. `406b996`, CI 5/5; contracts
  130 passed, api PG 313/1. **Risk: high.** **(as-shipped record below)**

### Slice R — `fix/cpc-click-integrity` (slice-review fix; worktree `/home/claude/OpenAd-45` off `f50076d`; parallel)
- ✓ 45. R: DONE 2026-09-25, **PR #21 merged `599368a`**:
  - campaign serve responses are `private, no-store`, and a CDN may cache `/media` only;
  - the burst rule keys on the trusted-hop client key, in a bounded map, and stays off until the
    hop count is verified;
  - `api.yaml` turns origin enforcement on, and the rule is best effort (`serve/origin.py`);
  - **T13** is amended; runbook §9 and §11 put a load balancer, if used, in front of every api
    path;
  - regression tests.
  R1 FIX (L2: `Origin: null` with no Referer, and `[::1]`) → fix round 1 → R2 FIX (L2: §9 and
  ADR-0017 still let non-media traffic bypass the load balancer) → fix round 2 → **R3 PASS**.
  `90d523d` (15 files, +777/−74), CI 5/5; pytest 336/6, PG 341/1. **Risk: high** (publisher CPC
  earnings). **(as-shipped record below)**

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
- ○ 47. Final: post-merge pass, once 43 has merged too (42, 44 and 45 have: #20, #22, #21).
  - Merge main into #16 and resolve any conflicts.
  - ROADMAP 6.11–6.14 with the PR numbers.
  - The docs on #16's side that describe 42–45: the §3.3 heading, the §7 table and CI
    sentence, ADR-0014 L117-118, ADR-0016 item 9 and ADR-0017's CDN line, the runbook's §14
    bucket line and two inferred markers, the launch-checklist user actions, README, the
    contracts and api READMEs, and `.gitignore`; plus the `/embed-demo` copy, the one
    product-code exception.
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


### Step 42 — The deploy images boot (slice O): DONE, as-shipped record

**Status:** R3 PASS. Branch `fix/deploy-images` (worktree `/home/claude/OpenAd-42`), off
`f50076d`, with main (`5658fcb`) merged in as `d09712a`. **PR #20 merged as `a7f95f7`**; CI 5/5
on `e945590` (run 36138557635: contracts, api, web, docker, e2e). The full pre-implementation
spec, with its ~12:00 UTC amendment and ~14:15 UTC R1 FIX block, is in git history (`a0d91a8`).

**Commits:**
- `a2a9738`: the fix (18 files, +508/−47).
- `60c2af8`: fix round 1 (6 files, +142/−74).
- `d09712a`: main (`5658fcb`: #21 and #22) merged in, with no conflicts.
- `e945590`: round 3, by an Opus coder (3 files, +17/−13).
- Against main: 18 files, +583/−50.

**Files:**
- `api/Dockerfile`, `web/Dockerfile` and `web/nginx/default.conf.template`;
- `infra/gcp/cloudbuild.yaml`, `infra/gcp/services/{web.yaml, web-demo.yaml}` and
  `infra/gcp/README.md`;
- `web/src/lib/wagmi.ts` and `wagmi.test.ts` (new), `web/index.html` and `web/vite.config.ts`;
- `e2e/scripts/web-boot-check.mjs` (new) and `.github/workflows/ci.yml` (the `docker` job);
- `scripts/deploy-gcp.sh` (the build block and call) and `scripts/check-sh.sh` (42's block);
- `docs/deploy-gcp.md` (§6 and §8), `.env.example` (base L98) and ADR-0017 (base L138-139).

**As shipped:**
- The api image copies `contracts/deployments` to `/app/contracts/deployments` and sets
  `OPENAD_DEPLOYMENTS_DIR` to that absolute path (`REPO_ROOT` is `/` in the image), so the
  indexer and settler load their artifact. Compose's `/deployments` mount still overrides it.
  Rebuild the api image after committing a `84532.json` or `8453.json` (runbook §8).
- `web/src/lib/wagmi.ts`:
  - `walletConnectProjectId(raw)` returns the trimmed id, or `undefined` for an unset, empty or
    blank one;
  - `walletGroups(projectId, dev)` lists only the Browser group (`injectedWallet`) without an id
    or in DEV, and adds `getDefaultWallets().wallets` with one;
  - `createRealConfig()` uses both. Without an id it passes a constant placeholder `projectId`,
    which nothing uses, because no WalletConnect-based wallet is listed;
  - a blank `VITE_CHAIN_ID` falls back to Anvil, like an unset one;
  - `wagmi.test.ts` pins these, and that `createRealConfig()` doesn't throw with an empty id.
- Build inputs:
  - `cloudbuild.yaml` declares `_WALLETCONNECT_PROJECT_ID`, `_GUIDE_URL` and `_DEMO_URL`
    (default `""`). It passes all three to `build-web` and `_GUIDE_URL` to `build-web-demo`, and
    both web steps set `DOCKER_BUILDKIT=1` (`web/Dockerfile.dockerignore` applies only under
    BuildKit);
  - `deploy-gcp.sh` reads `WALLETCONNECT_PROJECT_ID`, `GUIDE_URL` (default: the hosted guide)
    and `DEMO_URL` from its environment, refuses any that contains a comma, and appends them to
    `--substitutions`;
  - the Cloud Build call carries
    `--gcs-source-staging-dir="gs://${BUILD_STAGING_BUCKET:-${PROJECT}-openad-builds}/source"`;
  - `web/Dockerfile`'s header says what each `VITE_*` arg does: empty means unset, except
    `VITE_API_URL`, where empty means same-origin.
- CSP:
  - the nginx template's four CSP lines read `img-src ${CSP_IMG_SRC}`, and `web/Dockerfile`
    defaults it to `'self' data:` (nginx's envsubst leaves an undefined variable literal);
  - `web.yaml`: `CSP_IMG_SRC` is `'self' data: ${API_ORIGIN} https:`, and `CSP_CONNECT_SRC`
    gains `https://*.walletconnect.com` and `https://*.walletconnect.org` (inferred);
  - `web-demo.yaml` pins both CSP variables at the demo-safe defaults and says never to widen
    them.
- Fonts: `web/index.html` loads no Google Fonts, and the demo's `transformIndexHtml` plugin only
  adds the empty inline favicon. The CSS stack falls back to system fonts in every build.
- CI's `docker` job:
  - a `postgres:16` service, `npm ci`, and Playwright's Chromium;
  - the api image: a minimal `84532.json` fixture is written only when none is committed, and
    only a file this run wrote is deleted, right after the api build and before any web build.
    The image loads it from `/app/contracts/deployments`, runs `alembic upgrade head`, and its
    own CMD answers `/v1/health`;
  - the non-demo web image, built with no WalletConnect id (the regression), and the web-demo
    image each pass `/healthz`, the `img-src 'self' data:` CSP check and the boot check;
  - boot-check screenshots are uploaded on failure.
- `e2e/scripts/web-boot-check.mjs <url> [--out <dir>]` (flags in any order; honours
  `PLAYWRIGHT_CHROMIUM_PATH`) fails on any `pageerror` or `projectId` console message from load
  to the end, and on a `#root` with no element children or no visible text, at first paint
  (10 s) or again after a settle window (network idle, up to 8 s, then 3 s). Failed network
  requests are allowed.
- Runbook:
  - §6: one valid `gcloud builds submit` with the new substitutions and the staging flag, and a
    `docker build` and `docker push` form in place of the invalid `--tag` example;
  - §6: a real WalletConnect id lists wallets whose SDKs call more hosts. Add them to
    `CSP_CONNECT_SRC` only (inferred), and leave `style-src` and `font-src` alone, so AppKit's
    web font stays blocked;
  - §8: the api image carries the deployments; `openad-web` gets `--set-env-vars` for
    `CSP_CONNECT_SRC` and `CSP_IMG_SRC`, with a check-the-console note.
- `infra/gcp/README.md` lists the new substitutions; `.env.example`: an unset or empty
  `VITE_WALLETCONNECT_PROJECT_ID` means browser wallets only; ADR-0017's image bullet says the
  api image carries the deployments.
- `check-sh.sh`, one block inserted after base L115: it asserts the three substitutions, the
  default staging dir (`gs://p-openad-builds/source`, from a run with `BUILD_STAGING_BUCKET`
  unset in its subshell) and the override's bucket.

**Reviews:**
- R1 (Opus) FIX:
  - L1: runbook §6's build commands lacked the staging flag, and its `--tag` example was invalid
    (`gcloud builds submit` takes no `-f` or `--build-arg`) → the flag on the command, and a
    `docker build` and `docker push` example;
  - L2: the boot check passed at first paint → a settle window, then `#root` and the page
    errors are checked again;
  - L2: the CI fixture would overwrite, then delete, a committed `84532.json` → written only
    when absent, and only what it wrote is deleted;
  - L3s: two wrong stated reasons (an empty `VITE_API_URL`; a fake WalletConnect id doesn't
    throw); `check-sh.sh` didn't unset `BUILD_STAGING_BUCKET`; the boot check's argument
    parsing; §8's note length; `DOCKER_BUILDKIT=1`; the WalletConnect CSP origins;
  - → fix round 1 (`60c2af8`), then main merged in (`d09712a`).
- R2 FIX:
  - L2: round 1's unset edited base L110, the shared dry-run line, which is 43's (D14) →
    restored; the default bucket is checked from a separate run with the override unset;
  - L3: the runbook's WalletConnect CSP advice → `CSP_CONNECT_SRC` only, and AppKit's web font
    stays blocked;
  - L3: `web/Dockerfile`'s header wording → an empty `VITE_API_URL` means same-origin;
  - → round 3 with an Opus coder (`e945590`).
- R3 (Opus) PASS.

**Checks:**
- `check:sh` passes with `BUILD_STAGING_BUCKET` unset and with it exported;
- `git diff -U0 f50076d e945590 -- scripts/check-sh.sh` is one hunk, `@@ -115,0 +116,36 @@`;
- a merge test against 43's working copy is clean in all 9 files both change. The merged
  `--only all` dry-run runs 43's guards, then 42's, then `builds submit` with
  `--gcs-source-staging-dir=gs://p-openad-builds/source`;
- CI 5/5 on `e945590` (run 36138557635).

**Follow-ups:**
- → 47: ROADMAP 6.11 cites #20; ADR-0016 item 9 (L60-64) still describes the font strip that 42
  removed; §7's CI sentence; the launch checklist's L12 row and its WalletConnect user action.
- `api.ts`'s `??` on `VITE_API_URL` (R1, and a reviewer's backlog note at STEP_DONE 42): by
  design, no change (D15; §8).

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

**R2 FIX (2026-09-25 ~14:15 UTC; the work is still uncommitted; round 3 goes to a new Opus
coder).**
- **L2:** the api smoke check always uses `status.url`. Main's §11 (#21) tells an operator with a
  load balancer to set the api's ingress to `internal-and-cloud-load-balancing`, and then the
  `run.app` URL refuses outside requests, so `--only all` fails there and exits before web
  deploys.
  - Recommended (planner): decide from the ingress the script deploys. While it is `all`, smoke
    `status.url`. Otherwise smoke `API_URL`, the load balancer's host, which §11 makes
    `OPENAD_PUBLIC_URL`.
  - To make the ingress an input rather than a repo edit, 43 may render `api.yaml`'s
    service-level `run.googleapis.com/ingress` (L15) from a variable such as `API_INGRESS`
    (default `all`; D14's ~14:15 amendment), documented in `usage()`, `deploy.yml`'s `vars` and
    the infra README.
  - Test both branches under `--dry-run`.
- **L2:** the `[/?#]` cut in `origin_of`, the guard order (every guard before the first side
  effect) and the live-URL smoke are untested, and mutations survive. Add check-sh tests that
  fail on each mutation.
- **L3:** userinfo with an unencoded `/`, `?` or `#` slips past `origin_of`. Accept only
  `host[:digits]` after the scheme, and refuse anything else.
- **L3:** with `PUBLIC_INVOKER=iam-disabled`, the next `services replace` probably drops the
  `run.googleapis.com/invoker-iam-disabled` annotation, so the services go private again. Render
  the annotation into the manifests instead (inferred; verify before deploy).
- **L3, docs:**
  - `usage()`'s `GUIDE_URL` semantics;
  - 42's comma guard in the Guards list;
  - `PUBLIC_INVOKER` in the ADR amendment, the infra README, `deploy.yml` and §10's `vars`;
  - §11's snippet runs `exit 1` in the operator's shell: wrap it in a subshell.
- **Round 3 starts** by committing the work in progress, then merging `origin/main` (`5658fcb`:
  #21 and #22). D14 predicts no textual conflicts: main's §9 and §11 (45), and its §5 L218 and §8
  settler paragraph (44), sit outside 43's hunks.

**Main moved (2026-09-25 ~15:40 UTC; STEP_DONE 42).** Main is now `a7f95f7`: #20 (42) merged on
top of #21 and #22.
- Done: round 3 is committed as `223f979`, and `origin/main` (`a7f95f7`) is merged in as
  `ba94757`, cleanly; check:sh passes 71 ok there.
- 42's R3 merge-tested its head against 43's working copy: clean in all 9 files both change. The
  merged `--only all` dry-run runs 43's guards, then 42's comma checks, then `builds submit`
  with `--gcs-source-staging-dir=gs://p-openad-builds/source`.
- 42's `check-sh.sh` block is one insertion after base L115. Base L110, the shared dry-run line,
  is unchanged and stays 43's.

**R3 FIX → round 4 (2026-09-25 ~16:05 UTC; REPLAN, narrowed; the orchestrator's approach).** The
Opus R3 review found the code right, with every R2 finding resolved (the ingress-driven smoke,
the `[/?#]` cut, the guard order, the live-URL smoke, userinfo, the iam-disabled annotation,
docs). Its verify: `bash -n` and shellcheck clean; `envsubst` of all 6 manifests parses with both
`API_INGRESS` values; a stubbed non-dry-run runs replace → bind → smoke; the combined
main + 42 + 43 tree passes check-sh 71/71; `git merge-file` against main, 42 and #16 is
conflict-free. Its answers: refusing `@` in `origin_of` breaks nothing legitimate (the only loss
is `*.` wildcard hosts); the `unset` block at the top of `check-sh.sh` neither leaks nor weakens
anything (redundant beside 42's `DEFAULT_OUT`; keep it); under LB ingress, smoking `API_URL` is
right. What's left are test and doc gaps. **Round 4 changes no code:** the same Opus coder, on
`ba94757` in `/home/claude/OpenAd-43`, edits only `scripts/check-sh.sh` (43's part, never 42's
block) and 43's hunks of `docs/deploy-gcp.md` (never #16's §3 or base L427-432). If a new test
exposes a code bug, it stops and reports.
1. **L2:** 4 of 40 check-sh mutants survive, all on rules from earlier rounds. Add a `--only all`
   test that kills each:
   - removing `bind_public_invoker openad-api`;
   - removing `bind_public_invoker openad-web`;
   - binding the api after its smoke (the order must be replace → bind → smoke);
   - `RPC_ORIGINS="${RPC_ORIGINS:-$RPC_URL}"`: the default is the public chain RPC's origin,
     never `RPC_URL` (D15). For example, with a keyed private `RPC_URL`, the "Resolved web CSP
     origins" line doesn't name its host.
2. **L3, cheap tests:** the scheme-refusal message; an `API_URL` with a path reduces to its
   origin; `render()`'s env prefix, including the `MEDIA_BUCKET` default
   `openad-media-<project>-<env>`; the awk annotator (idempotent, top-level `metadata` only, as
   the reviewer found by hand).
3. **L3, runbook L325-333** (on `ba94757`): set `API_INGRESS=internal-and-cloud-load-balancing`
   only once the load balancer serves `API_URL`; a first deploy keeps `all`.
4. **L3, runbook §11:** its host naming matches §9's.
5. **Planner's addition (optional):** §11's click-integrity bullet (L686-688 on `ba94757`) still
   says to set the ingress through "the `run.googleapis.com/ingress` annotation in `api.yaml`,
   `all` today". Name `API_INGRESS` instead. If round 4 leaves it, 47's item 4 does it.

**Round 4 verify:**
- each of the 4 mutants, and one mutant per new L3 test, fails `check:sh` in a scratch copy of
  the tree, never in the worktree;
- `bash -n` and shellcheck on `scripts/check-sh.sh`; `npm run check:sh` passes (71 plus the new
  checks);
- `git diff ba94757 --stat` lists only `scripts/check-sh.sh` and `docs/deploy-gcp.md`.

Then R4 (Opus). On PASS the orchestrator pushes `fix/cloud-run-wiring` and opens the PR; its
number replaces `#<43>` in 47 and CLOSE.

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

### Step 44 — A dedicated settler key (slice Q): DONE, as-shipped record

**Status:** R2 PASS. Branch `fix/settler-key` (worktree `/home/claude/OpenAd-44`), off
`f50076d`. **PR #22 merged as `5658fcb`**, cleanly on top of #21; CI 5/5. The full
pre-implementation spec is in git history (`c9cf63f`).

**Commit:** `406b996` (15 files, +1494/−29).

**Files:**
- `contracts/script/{settler.py, set_settler.py}` (new) and `deploy.py`;
  `contracts/tests/test_deploy_settler.py` (new);
- `api/src/openad/settler/identity.py` (new) and `__main__.py`;
  `api/tests/test_settler_identity.py` (new);
- `docs/PROTOCOL.md` §10, `docs/deploy-sepolia.md`, `docs/deploy-mainnet.md`, `docs/deploy-gcp.md`
  (§5 L218, §8's settler paragraph), `.env.example`, ARCHITECTURE §3.9 and §8, ADR-0017 L51-54,
  and `docs/threat-model.md` (T20, L64).

**As shipped:**
- `script/settler.py`, a pure `resolve_settler(network, deployer, configured, forbidden)`:
  - on pyevm and anvil, `configured`, or else the deployer;
  - elsewhere `configured` is required, and a malformed, zero or bad-checksum address, or one
    equal to any forbidden role, raises (naming `OPENAD_SETTLER_ADDRESS`);
  - `deploy()` resolves it before the first transaction, and `deploy_protocol` applies the rule
    again.
- `set_settler.py` rotates the settler:
  - `load_vault` returns `LoadedVault(vault, deployer)` and refuses an artifact whose `deployer`
    is missing or malformed;
  - off pyevm and anvil, the new settler may be neither `owner()` nor the artifact's deployer,
    because ownership can move to a Safe while the deployer key still exists;
  - it refuses a sender that isn't the owner, does nothing when the settler is unchanged, sends
    with `sender=`, and refuses pyevm;
  - on `base` it sends nothing and prints the Safe transaction (`to`, `value`, `data`).
- `openad/settler/identity.py`, checked before the liveness listener starts:
  - off 31337, a key that is `owner()` (`settler.key_is_owner`) or the artifact's deployer
    (`settler.key_is_deployer`) is fatal;
  - a key that isn't `settler()` (`settler.not_current_settler`, a rotation in progress) or that
    is `treasury()` (`settler.key_is_treasury`) gets a warning;
  - on 31337 every finding is a warning, but a chain mismatch (`settler.chain_mismatch`) is always
    fatal, so a real network can't pass as 31337. An RPC error is fatal too.
- Runbooks:
  - `deploy-sepolia.md` gains a "Settler EOA" section: create it, fund it with gas only, export
    `OPENAD_SETTLER_ADDRESS`, store the key as `openad-settler-key-<ENV>`, and rotate it. The
    address is exported, never written to the repo-root `.env`: Moccasin loads `../.env` for
    every network, so it would become the local settler too.
  - `deploy-mainnet.md`: a dedicated EOA, never the Safe or one of its signers; `set_settler`
    goes through the Safe.
  - `deploy-gcp.md` L218 and §8's settler paragraph.
- Docs: PROTOCOL §10 ("Off Anvil and pyevm, it is never…"); ARCHITECTURE §3.9 and §8; ADR-0017
  L51-54; `.env.example`; threat model **T20** and the L64 residual.

**Reviews:**
- R1 (Opus) FIX:
  - L2: `set_settler` refused only `owner()`. After ownership moved to a Safe, rotating to the
    deployer went through (reproduced on `base` and `base-sepolia`) → forbidden roles, the
    artifact's deployer, and a real `sender=` (it had checked the sender but sent from the
    default account).
  - L3: the startup check should refuse the artifact's deployer → `settler.key_is_deployer`.
  - L3: the "put it in the repo-root `.env`" advice → export only (`deploy-sepolia.md`,
    `.env.example`).
  - L3: two surviving mutants → killed.
  - L3: PROTOCOL L444-445's wording → fixed.
- R2 PASS:
  - the Safe-transfer repro is refused before any calldata;
  - a Safe-owned vault with a dedicated key starts clean, and 31337 only warns;
  - every artifact has carried `deployer` since `7e650d1`;
  - one L3 mutant survived (`moccasin_main` with `deployer=owner()`) →
    `test_moccasin_main_refuses_the_deployer_after_an_ownership_move[base-sepolia|base]`
    kills it.

**Checks** (the orchestrator, locally): contracts 130 passed; api ruff, format and mypy clean;
PG 313 passed / 1 skipped.

**Follow-ups:**
- → 47: `contracts/README.md` L21 and L38; `api/README.md`'s settler line (main L33);
  `.gitignore` gains `contracts/.deployments.db`.
- → §8: the startup check compares the key with the vault's `owner()` and the artifact's
  deployer only; `deploy.py` L226 runs over 100 columns.


### Step 45 — CPC click integrity (slice R): DONE, as-shipped record

**Status:** R3 PASS. Branch `fix/cpc-click-integrity` (worktree `/home/claude/OpenAd-45`), off
`f50076d`. **PR #21 merged as `599368a`**; CI 5/5. The full pre-implementation spec, with its
~12:00 UTC amendment, is in git history (`c9cf63f`).

**Commit:** `90d523d` (15 files, +777/−74).

**Files:**
- `api/src/openad/{routers/serve.py, routers/clicks.py, services/clicks.py, serve/origin.py,
  main.py}`;
- `api/tests/test_click_integrity.py` (new), `test_origin.py` and `test_serve.py`;
- `infra/gcp/services/api.yaml` (appended) and `.env.example`;
- `docs/ARCHITECTURE.md` (§3.4, §3.8, §8), ADR-0017, `docs/deploy-gcp.md` (§9, §11), the
  guide's `embed-code.md`, and `docs/threat-model.md` (T13).

**As shipped:**
- Serve headers (`routers/serve.py`):
  - a campaign response is `private, no-store`, with no ETag;
  - lease, house and empty responses stay `public, max-age=<ttl>`, with `Vary: Origin` and the
    ETag;
  - an unknown slot stays `public, max-age=60`, and `/media` is unchanged.
- The burst rule:
  - it runs when `routers/clicks.burst_rule_active(settings)` holds: hops > 0, or dev and test;
  - its key is `ratelimit.client_key(request, trusted_proxy_hops)`, HMAC'd with `slot_id`, in a
    bounded `BurstWindow` (`services/clicks.py`: at most `BURST_MAX_KEYS` = 10 000, LRU, expired
    entries dropped on insert);
  - outside dev and test with hops 0 it is skipped, and `main.py`'s lifespan logs
    `clicks.burst_rule_disabled` once.
- Origin enforcement, best effort (`serve/origin.py`, `origin_allowed`):
  - loopback hosts (`LOCAL_HOSTS`, now with `::1`) count only in dev and test
    (`allow_local=settings.is_dev`);
  - an `Origin` that names no host (`null` included) is a mismatch unless the `Referer` names a
    matching host;
  - a request with neither header is a match;
  - a malformed `Origin` or `Referer` (e.g. `http://[`) no longer gives a 500. That bug was
    pre-existing, and showed only under enforcement.
- `api.yaml` sets `OPENAD_SERVE_ENFORCE_ORIGIN: "true"`; local dev and compose keep it off.
- Runbook:
  - §9: a load balancer, if used, fronts every api path on the `API_URL` host. Cloud CDN caches
    `/v1/serve/*/media` only, through a path-scoped backend, and never with `FORCE_CACHE_ALL`
    on `/v1/serve/{slot_id}` (inferred).
  - §11 "Click integrity": the checks, and "Behind a load balancer, every api request must take
    the same proxies": set the api's ingress to `internal-and-cloud-load-balancing`, and make
    `API_URL` the load balancer's host. Closing ingress is the fix: while `run.app` stays open,
    a direct client can forge an `X-Forwarded-For` entry and pick a new burst key per click.
- ADR-0017 says the same; ARCHITECTURE §3.4, §3.8 and a §8 bullet (the burst map); the guide's
  `embed-code.md`; T13 amended in place.

**Reviews:**
- R1 (Opus) FIX:
  - L2: under enforcement, `[::1]` never matched, and `Origin: null` with no `Referer` counted
    as a match;
  - L3s: `slot_id` in the burst key was untested; `.env.example` needed an inferred marker; the
    XFF-shorter-than-hops case was undocumented;
  - → fix round 1, as decided at ~12:00 UTC. Accepted deviation: the opaque rule covers any
    `Origin` that names no host, not only a literal `null`.
- R2 FIX:
  - L2: runbook §9 and ADR-0017 still let non-media traffic go straight to Cloud Run, which
    contradicted §11;
  - L3: §11's parenthetical over-claimed "fails closed";
  - L3: `allow_local=settings.is_dev` was unpinned;
  - → fix round 2: the load balancer fronts every api path; a path-scoped CDN; "closing ingress
    is the fix"; `test_loopback_pages_are_not_the_slot_domain_in_prod`.
- R3 PASS.

**Checks:** ruff, format (src and tests) and mypy clean; pytest 336 passed / 6 skipped; with PG
341 / 1; mutations 24/24, then 18/20 (one equivalent `.lower()`; `allow_local` now caught).

**Follow-ups:**
- → 47: two "(inferred; verify before deploy)" markers, on §9's "The load balancer adds
  `X-Forwarded-For` entries" and §11's "so the hop count usually becomes `2`"; ARCHITECTURE §7's
  Media cache row and ADR-0017's Cloudflare line, which 47 already had.
- Pre-existing: an unscoped `ruff format` flags `0002_cpc.py` (7.7).


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

_Specced 2026-09-25 10:05 UTC (REPLAN). Amended at STEP_DONE 46 (~12:00 UTC): 46's leftover L3,
the stale lines that 45's R1 review found, the embed demo page's copy, and the launch-checklist
notes from 43's and 45's R1 decisions (D14 and D15 amendments). Amended again at STEP_DONE 44
and 45 (~14:15 UTC): the PR numbers known so far (42 is #20, 44 is #22, 45 is #21), and the
follow-ups from 42's, 44's and 45's reviews. Amended at STEP_DONE 42 (~15:40 UTC): #20 merged
as `a7f95f7`, ADR-0016 item 9 made precise, and the `api.ts` candidate dropped (by design, D15).
43's PR number isn't known yet: the orchestrator gives it when it launches 47, and it replaces
`#<43>` below._

**When and where:**
- Primary tree `/home/claude/OpenAd`, `chore/launch-final` (#16). It starts after 42–45 have all
  merged into main: 42 (#20 `a7f95f7`), 44 (#22 `5658fcb`) and 45 (#21 `599368a`) have, and 43
  is the last. 46 passed its review at `911d363`.
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
   - 6.11: the deploy images boot (#20);
   - 6.12: Cloud Run wiring (#<43>);
   - 6.13: a dedicated settler key (#22), with T20;
   - 6.14: CPC click integrity (#21), with T13 amended.

   Then:
   - 6.10's acceptance gains three conditions:
     - the settler is a dedicated, gas-only EOA (6.13);
     - the staging environment's `vars` are set (6.12);
     - every "(inferred; verify before deploy)" fact in the runbook has been checked.
   - 7.13: its `deploy.yml` placeholder part is done in 6.12 (#<43>): `--only stack|all` refuses
     unset URLs, and `deploy.yml` passes the environment's `vars`. The PSL-aware guard, the
     prod-mode IP-literal test and the macOS `host_of` check stay open.
   - 7.20 and up, only for the follow-ups that 42–45's handbacks or reviews deferred. Known so
     far (§8):
     - key IPv6 clients by /64 in the burst rule;
     - limit `workers/serve` to `/media` before it is ever deployed;
     - the settler's startup check also compares its key with the owners of `AdSlot`,
       `Marketplace` and `CreativeRegistry`, not only the vault's;
     - generate the runbook's §8 manual commands from the manifests;
     - optionally, `gcloud builds submit --async`, to drop `roles/logging.viewer`.
   - 7.7's note gains `contracts/script/deploy.py` L226 (`_seed_demo`), which runs over 100
     columns.
3. **ARCHITECTURE and the ADRs, after the merge:**
   - §3.3's "Serving (public, cacheable)" heading (L161 on main, L163 on #16 at `911d363`)
     matches 45's rule, e.g. "Serving (public; campaign responses are never cached, § 3.4)".
   - §3.3's publishers line (#16's L159, 139 characters): rewrap it to ≤ 100 (46's optional L3).
   - The §7 table, Media cache, production cell (main L603 at `5658fcb`, L582 on #16 before
     the merge): "GCS, plus an optional CDN on `/v1/serve/*/media` only (ADR-0017)". 45's R3
     review flagged it too.
   - §7's CI sentence: CI's `docker` job builds the api, web and web-demo images and boot-checks
     each (6.11).
   - §1's package map, "(may later move to a CDN worker)" (L17): only if it still reads as
     caching serve JSON at the edge, say that a CDN may cache `/media` only.
   - ADR-0014 L117-118: the burst HMAC is keyed by the trusted-hop client key and `slot_id`, in a
     bounded map, and skipped until the hop count is verified (6.14), not by `ip + slot_id`.
   - ADR-0017's Cloudflare alternative ("…purely as a CDN for serve traffic", main L176 at
     `5658fcb`): a CDN for `/v1/serve/*/media` only, as 45's lines say (main L155-160 and L193).
   - ADR-0016 item 9 ("Font-offline", L60-64) still says the demo's `transformIndexHtml` plugin
     drops the Google Fonts links, which 6.11 (#20) removed from `web/index.html` outright.
     Reword it: no build loads Google Fonts since 6.11 (the CSS stack falls back to system
     fonts), and the plugin only adds the empty inline favicon. Keep the item's last sentence
     (the `injected` connector over the simulator).
4. **Runbook `docs/deploy-gcp.md`, after the merge:**
   - §14: the bucket line uses `<MEDIA_BUCKET>` (43's per-project name).
   - §8's manual api command: add `OPENAD_SERVE_ENFORCE_ORIGIN=true` to `--set-env-vars`, as in
     `api.yaml` (45).
   - §3's connection-string paragraph (#16's text): one sentence that points at 43's
     verify-first note (unix socket versus private-IP TCP).
   - Two "(inferred; verify before deploy)" markers from 45's R3 review: §9's "The load balancer
     adds `X-Forwarded-For` entries" (main L413-414 at `5658fcb`) and §11's "adds its own
     `X-Forwarded-For` entry, so the hop count usually becomes `2`" (main L510-511).
   - 43 renders the api's ingress from `API_INGRESS`. Unless 43's round 4 already did it, §11's
     ingress bullet names `API_INGRESS` instead of "the `run.googleapis.com/ingress` annotation
     in `api.yaml`, `all` today".
5. **Launch checklist** (`docs/business/launch-checklist.md`).
   - Done:
     - L12 becomes "Docker images build and boot-check in CI (`api`, `web`, `web-demo`)",
       citing #20;
     - add one row each for #<43>, #22 and #21.
   - User actions:
     - set the `staging` environment's `vars` in GitHub (the list in 43's `deploy.yml`);
     - grant the WIF deployer the Cloud Build roles; pre-create the builds staging bucket
       `gs://<PROJECT_ID>-openad-builds` (uniform access; `BUILD_STAGING_BUCKET` overrides the
       name) and grant the deployer `roles/storage.admin` on it only; grant the build's runner
       service account `roles/cloudbuild.builds.builder` and `roles/artifactregistry.writer`
       (§2, §10);
     - create a dedicated, gas-only settler EOA:
       - fund it with a little Base Sepolia ETH;
       - export `OPENAD_SETTLER_ADDRESS` for the contracts deploy, never in the repo-root
         `.env`, which Moccasin loads for every network;
       - store its key as `openad-settler-key-<ENV>` (`docs/deploy-sepolia.md`);
     - optionally, get a WalletConnect project id (without one, the app offers browser wallets
       only). With one, add the extra `CSP_CONNECT_SRC` hosts that runbook §6 lists (#20), then
       check the browser console for CSP reports in staging;
     - map `demo.<domain>`, and set `WEB_DEMO_URL` and `DEMO_URL` (§9);
     - the XFF row (L35): verifying the chain and setting `OPENAD_TRUSTED_PROXY_HOPS` also turns
       on the CPC click burst rule (6.14). If a load balancer fronts the api, every api
       request must take the same proxies: api ingress `internal-and-cloud-load-balancing`,
       and `OPENAD_PUBLIC_URL` is the LB host (runbook §11, click integrity);
     - only if 43 shipped `PUBLIC_INVOKER`: where the org's domain-restricted sharing refuses
       `allUsers`, deploy with `PUBLIC_INVOKER=iam-disabled` (§6-8);
     - verify the runbook's "(inferred; verify before deploy)" facts in staging.
6. **READMEs, the deck and `.gitignore`.**
   - README "What's in the box": one bullet for the launch fixes (#20, #21, #22 and #<43>):
     - images that boot on Cloud Run;
     - private database networking, and public services that anyone can reach;
     - a dedicated settler key;
     - CPC click integrity.
   - `pitch-deck.md` Slide 11, "Built": add "deploy and click-integrity fixes". The orchestrator
     regenerates the deck.
   - `contracts/README.md`: the `script/` layout lists `settler.py` and `set_settler.py` (main
     L21), and the `base-sepolia` deploy line needs an exported `OPENAD_SETTLER_ADDRESS` (L38).
   - `api/README.md` (#16's version, after the merge): the `settler/` line lists `identity.py`.
   - `.gitignore`: `contracts/.deployments.db`, which Moccasin writes on a `base-sepolia`
     deploy.
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
grep -n "drops the Google Fonts" docs/adr/0016-web-demo-mode.md && echo "FAIL adr-0016" || echo ok
grep -c "settler.py\|identity.py" contracts/README.md api/README.md   # each file > 0
git check-ignore -q contracts/.deployments.db && echo ok || echo "FAIL ignore"
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
- The contracts and api READMEs and `.gitignore` cover 44's scripts, and ADR-0016's font item
  is true.
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
    - then #21 `599368a` (45), #22 `5658fcb` (44) and #20 `a7f95f7` (42), plus 43's PR, whose
      merge commit is read from `git log --merges` at CLOSE;
    - #16 "merges last" (its commit doesn't exist yet at CLOSE).
  - A **step → PR map**: 36b's table (in git history at `486ab0b`), plus:
    - 42 → #20, 43 → #<43>, 44 → #22, 45 → #21;
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
      - behind a load balancer, the burst key can be trusted only once the api's ingress is
        closed (`internal-and-cloud-load-balancing`);
      - the settler's startup check compares its key only with the vault's owner and the
        artifact's deployer (Phase 7);
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
- 2026-09-25 14:15 UTC — STEP_DONE 44 and 45 (both merged), plus 42's R1 and 43's R2. **45 DONE**: PR #21 (`90d523d`, 15 files, +777/−74) merged as `599368a`, CI 5/5. R1 FIX (as recorded at ~12:00) → fix round 1 (`origin_allowed`: loopback, now with `::1`, only in dev and test; an `Origin` naming no host is a mismatch unless the `Referer` names a matching host, an accepted deviation from literal `null`; neither header is a match; a malformed header no longer 500s; the burst test covers slot 2; the §11 LB bullet) → R2 FIX (L2: §9 and ADR-0017 still let non-media traffic reach Cloud Run directly, contradicting §11; L3: §11 over-claimed "fail closed"; L3: `allow_local` unpinned) → fix round 2 (the LB fronts every api path on the `API_URL` host; Cloud CDN only for `/v1/serve/*/media`, through a path-scoped backend, never `FORCE_CACHE_ALL`; "closing ingress is the fix"; a prod loopback test) → R3 PASS. pytest 336/6, PG 341/1; mutations 24/24, then 18/20 (one equivalent). **44 DONE**: PR #22 (`406b996`, 15 files, +1494/−29) merged as `5658fcb`, cleanly on top of #21; CI 5/5. R1 FIX (L2: after ownership moved to a Safe, `set_settler` let the deployer become the settler, reproduced on base and base-sepolia; L3s: refuse the artifact deployer at startup, export-only Sepolia advice because Moccasin loads `../.env` for every network, two surviving mutants, PROTOCOL wording) → fix round 1 (`resolve_settler(forbidden=…)`, `LoadedVault(vault, deployer)`, a rotation that refuses `owner()` and the deployer and really sends from the checked sender, `settler.key_is_deployer`) → R2 PASS, plus a test that kills the last mutant. Contracts 130, api PG 313/1 (the orchestrator, locally). §5's specs for 44 and 45 are replaced by as-shipped records (the full text is at `c9cf63f`). **42** (draft #20, `a2a9738`, CI green): R1 FIX (L1: runbook §6 lacks the staging flag, and its `--tag` example is invalid; L2: the boot check passes at first paint; L2: the CI fixture would clobber a committed `84532.json`; six L3s) → fix round 1 with the coder. **43** (uncommitted): R2 FIX (L2: the api smoke always uses `status.url`, which fails once the api's ingress is `internal-and-cloud-load-balancing` per #21's §11, so `--only all` stops before web; L2: the `[/?#]` cut, the guard order and the live-URL smoke are untested; L3s: `host[:digits]` only, `PUBLIC_INVOKER=iam-disabled` against `services replace`, doc gaps) → round 3 with a new Opus coder, after committing and merging main. The planner recommends choosing the api smoke URL by the ingress the script deploys; 43 may render `api.yaml` L15 (D14, ~14:15 amendment). D15 corrected: the smoke rule, the no-host `Origin` rule, and "fails closed" (it stops no one; closing ingress is the fix); `VITE_API_URL` noted as the exception to "empty means unset". 47 gains the PR numbers #20, #21 and #22, two inferred markers (§9, §11), ADR-0016 item 9, `contracts/README.md` L21 and L38, `api/README.md`'s settler line, `contracts/.deployments.db` in `.gitignore`, current main line numbers, and more 7.20+ candidates. CLOSE gains the merge commits and two residual risks. Backlog: three notes.
- 2026-09-25 15:40 UTC — STEP_DONE 42 (merged). **42 DONE**: PR #20 merged as `a7f95f7`, CI 5/5 on `e945590` (run 36138557635). R1 FIX (as recorded at ~14:15) → fix round 1 (`60c2af8`: the boot check re-checks `#root` and page errors after a settle window, and parses its flags in any order; the CI fixture writes, and later deletes, `84532.json` only when none is committed; runbook §6 shows one valid build command with the staging flag, plus a `docker build` and `docker push` form; the web build steps force BuildKit) → main merged in (`d09712a`) → R2 FIX (L2: the `check-sh.sh` unset reached base L110, 43's shared dry-run line; L3: the WalletConnect CSP advice; L3: `web/Dockerfile`'s header) → round 3 with an Opus coder (`e945590`: L110 restored, the default bucket checked from its own run with the override unset; extra wallet hosts go in `CSP_CONNECT_SRC` only) → R3 PASS: `check:sh` passes with `BUILD_STAGING_BUCKET` unset and exported, the check-sh diff is one hunk (`@@ -115,0 +116,36 @@`), and a merge test against 43's working copy is clean in all 9 shared files, with the merged `--only all` dry-run running 43's guards, then 42's, then `builds submit` with `gs://p-openad-builds/source`. §5's spec is replaced by an as-shipped record (the full text is at `a0d91a8`). D14: the as-merged record, and 43, the last fix branch, merges main (now with #20) in first; 43's spec gains a "Main moved" note. D15: 42's as-shipped rules; `VITE_API_URL`'s `??` judged by design (an empty value means same-origin, and `||` would bake `http://localhost:8000` into the bundle), so the §8 note is struck and 47's 7.20+ candidate is dropped. 47: 42, 44 and 45 merged, only 43 left; ADR-0016 item 9 made precise; the WalletConnect user action names runbook §6's extra CSP hosts; `#<43>` stays a placeholder, and 6.11 cites #20. CLOSE gains #20's merge commit. JIT_INDEX: an Image rule bullet (shipped) split from the Cloud Run rules (43). 43 stays [>] (R3 re-review).
- 2026-09-25 16:05 UTC — REPLAN 43 (R3 FIX, narrowed). The orchestrator committed round 3 as `223f979` and merged main `a7f95f7` in as `ba94757` (clean; check:sh 71 ok). The Opus R3 review: FIX, but the code is right and every R2 finding is resolved; the gaps are tests and docs. L2: 4 of 40 check-sh mutants survive, all on earlier rules (the api and web invoker bindings, the api bound after its smoke, `RPC_ORIGINS` defaulting to `RPC_URL`). L3s: runbook L325-333 (`internal-and-cloud-load-balancing` only once the LB serves `API_URL`; a first deploy keeps `all`), §11's host naming against §9, and four untested rules (the scheme refusal, `API_URL` with a path, `render()`'s env prefix and the `MEDIA_BUCKET` default, the awk annotator). Reviewer answers: `@` refusal costs only `*.` wildcard hosts; the top `unset` block is harmless; smoking `API_URL` under LB ingress is right. Round 4 (the orchestrator's approach, which the planner keeps): the same Opus coder, tests and docs only, in 43's part of `check-sh.sh` and its runbook hunks, with each mutant shown failing in a scratch copy; then R4 and, on PASS, the PR. The planner adds one optional item: §11's ingress bullet names `API_INGRESS` (else 47 item 4). 43's spec gains the R3 FIX and round-4 block; D14 and D15 amended (`API_INGRESS`, `host[:digits]`, the rendered iam-disabled annotation); JIT_INDEX updated.

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
- ~~`web/src/lib/api.ts` reads `VITE_API_URL` with `??`, so an empty value means same-origin, not unset (the rule D15 states for `VITE_*` inputs). Use `||` → a 7.20+ candidate for 47 (from 42's R1 review; Cloud Build always passes `_API_URL`, and 43 refuses an unset `API_URL`, so it is latent).~~ → judged not needed (15:40): same-origin is what an empty `VITE_API_URL` is meant to mean (D15, and `web/Dockerfile`'s header since #20), and `||` would bake the dev default `http://localhost:8000` into a bundle built with an empty value.
- The settler's startup check compares its key with the vault's `owner()` and the artifact's `deployer` only: a key that owns `AdSlot`, `Marketplace` or `CreativeRegistry` but not the vault isn't caught → a 7.20+ candidate for 47 (from 44's review).
- `contracts/script/deploy.py` L226 (`_seed_demo`) runs over 100 columns (pre-existing) → a 7.7 note for 47.
