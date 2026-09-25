# JIT_PLAN — Market fit, hardening and launch (archived)

Created 2026-09-24 10:40 (CREATE, base `45668c6`). Closed 2026-09-25 19:00 UTC; #16 merges last.
ROADMAP 6.1–6.9 and 6.11–6.14 are `[x]`. 6.10, the live GCP deploy, stays open (user-run). Phase 7
(7.1–7.20) is the post-launch backlog. The full plan, through STEP_DONE 43, is in git history at
`6251ed7`; step 47 and CLOSE are recorded only here.

Verdict (step 1): technically sound, not yet market-ready. The protocol wasn't blocking adoption.
Product and GTM gaps were: no demo, thin publisher onboarding, no performance numbers,
PowerShell-only scripts and no production hosting. Revenue is GMV × `fee_bps`, so the plan raised
GMV without a contract change.

## Decisions

- **D1 Branch per slice:** one branch and one PR per slice, off the then-current `main`. A
  parallel slice runs in its own worktree.
- **D2 Business docs** live in `docs/business/` (market fit, GTM, pitch-deck source, demo
  script, competitive table, launch checklist). The hosted deck is built from `pitch-deck.md`.
- **D3 Demo mode (ADR-0016):** `VITE_DEMO_MODE=1` runs on seeded in-memory fixtures and a
  simulated wallet. It never opens an RPC connection, calls the API or requests a real
  signature. It shows a persistent banner, is tree-shaken out of normal builds, and hosts
  statically.
- **D4 Analytics read model:** CTR, eCPM and trends come off-chain from `serve_events` and the
  indexed leases and settlements, in integer math. The endpoints are read-only; no new events.
- **D5 GCP deploy (ADR-0017):** Cloud Run (api, indexer, settler, web, web-demo), Cloud SQL, a
  GCS media cache behind `MediaStore`, and Secret Manager. CI deploys staging only, and only
  with WIF secrets; no mainnet broadcast from CI. The live deploy is the user's (6.10).
- **D6 Cross-platform scripts:** bash twins of `scripts/*.ps1`, `stack:docker`, and `check:sh`
  in CI (an ADR-0007 amendment).
- **D7 ROADMAP Phase 6** mirrors the slices, and each ship ticks its task.
- **D8 No protocol contract changes.** Revenue is GMV × `fee_bps` (250, cap 1000), paid to the
  owner-settable treasury.
- **D9 Harden before the final docs pass:** auth (6.8) and capacity (6.9) merged before the
  launch docs. 6.10 is the user-run deploy, and Phase 7 holds the backlog.
- **D10 SIWE binding (ADR-0009 amendment):** the EIP-4361 `domain` and `URI` must match an
  allowed web origin, and clients sign as the web origin. Nonces are consumed atomically.
  Messages need strict ABNF and EIP-55 addresses, with ±300 s clock skew. The auth limiter is
  opt-in, per instance, and keyed by the right-most trusted `X-Forwarded-For` hop.
- **D11 One registrable domain** for web and api in production (`SameSite=Lax`), guarded by
  `deploy-gcp.sh`. The guard compares two DNS labels, so it isn't PSL-aware.
- **D12 Connection budget:** `max_connections=100` is set by flag. The api runs 4 instances of
  (4 + 2), the indexer and settler 2 + 1 each, and the migrate job 1. That is 31 steady, 34
  with Postgres's reserved connections, and ≈64 during a rollout overlap.
- **D13 Merge order to launch:** independent fixes merge as they go green, each merging main in
  first. #16, the final pass, merges last and is the only branch that edits ROADMAP and README.
- **D14 Slice-review fix split:** the Opus slice review of main `f50076d` plus #16 returned FIX
  (six L1s, eight L2s). Steps 42–45 fixed them in parallel worktrees off `f50076d`, each owning
  pre-assigned hunks; no textual conflict occurred. 46 fixed docs truth on #16, and 47 merged
  main in and documented the result. Numbers were pre-assigned: T20 (44), T13 amended (45),
  ROADMAP 6.11–6.14 (42–45), 7.19 (46) and 7.20 (47). GCP facts the repo can't prove are marked
  "(inferred; verify before deploy)".
- **D15 Fix rules** (durable; kept in `JIT_INDEX.md`):
  - images (#20): the api image carries `contracts/deployments` and sets
    `OPENAD_DEPLOYMENTS_DIR`. An empty `VITE_*` input means unset, except `VITE_API_URL`, where
    it means same-origin. `img-src` comes from `CSP_IMG_SRC`, no build loads Google Fonts, and
    CI boot-checks all three images;
  - Cloud Run (#23): Direct VPC egress; `--edition=ENTERPRISE`; an `allUsers` invoker on the
    public services only (or `PUBLIC_INVOKER=iam-disabled`); the api's ingress from
    `API_INGRESS`; every guard before the first side effect; CSP entries are origins;
  - settler (#22): a dedicated, gas-only EOA, never the deployer, the owner or the Safe (T20);
  - click integrity (#21): campaign serves are `private, no-store`, and a CDN caches `/media`
    only. The burst rule keys on the trusted-hop client key and stays off until the hop count
    is verified. Origin enforcement is best effort (T13).

## Outcome

- **PRs in merge order, with merge commits and slices:**
  - #4 `801440e` (A, market fit and GTM), #5 `8887adb` (E, bash scripts), #6 `e8a34b8` (H,
    fresh-DB Alembic);
  - #7 `866d7fe` (F, GCP deploy), #8 `591e576` (B, demo mode), #9 `07eeece` (D, analytics);
  - #10 `eba40cd` (C, publisher growth), #11 `c3f39dc` (G, launch docs), #12 `d5d46a0` (I, buy
    receipt), #13 `abb2b81` (C, slot listings);
  - #15 `2c4101b` (J, auth hardening), #14 `5f27fb8` (K, ops hardening);
  - #17 `3605473` (L, outbound-fetch bounds), #18 `289bb72` (N, periods cap), #19 `f50076d`
    (M, discover state);
  - #21 `599368a` (R, click integrity), #22 `5658fcb` (Q, settler key), #20 `a7f95f7` (O,
    deploy images), #23 `ab3dfbe` (P, Cloud Run wiring);
  - #16 (Final) merges last.
- **Step → PR map** (code comments and docs cite JIT step numbers):

  | Steps           | PR  |
  | --------------- | --- |
  | 1, 3            | #4  |
  | 4–13            | #8  |
  | 14+15           | #10 |
  | 16              | #13 |
  | 19–22           | #9  |
  | 23+24           | #5  |
  | 25–29           | #7  |
  | 30+31           | #11 |
  | 34              | #6  |
  | 35              | #12 |
  | 36, 36b, 46, 47 | #16 |
  | 37              | #15 |
  | 38              | #14 |
  | 39              | #17 |
  | 40              | #19 |
  | 41              | #18 |
  | 42              | #20 |
  | 43              | #23 |
  | 44              | #22 |
  | 45              | #21 |

  Steps 2, 17+18 and 32+33 were folded into other steps.
- **The final pass on #16** (steps 36, 36b, 46 and 47):
  - 36 and 36b: ROADMAP ticks and Phase 7, sourcemaps off, the onramp guide, README, the
    business docs, runbook truth fixes and re-captured screenshots, merging main in each time.
  - 46: docs truth. It fixed the demo script's CPC track, Slide 4 and ARCHITECTURE §3.3, said
    honestly that there is no phishing blocklist (ROADMAP 7.19), and changed the `/why`
    presets.
  - 47 (DONE 2026-09-25 19:00):
    - origin/main `ab3dfbe` merged in as `3c7810d`, with no conflicts;
    - `99f264b` wrote ROADMAP 6.11–6.14 (#20, #23, #22, #21), 6.10's and 7.13's updates and
      7.20. It brought ARCHITECTURE, ADR-0014, ADR-0016, ADR-0017, the runbook, the launch
      checklist, the READMEs, `.gitignore` and the `/embed-demo` copy in line with 42–45;
    - R1 FIX. L1: two inferred markers were missing. L2: the `/embed-demo` sentence was false
      on a local stack. L2: no test caught the copy in demo mode. Plus L3s. Fixed in `777fa9d`
      and `43d68ec` → R2 PASS;
    - **spec correction:** item 7's copy now reads "Where the API enforces origins (staging and
      production), paid creatives show only on the slot's own domain…". It still shows only
      when `!DEMO_MODE`, and `EmbedDemoPage.demoMode.test.tsx` pins that;
    - deviations: the launch checklist was re-prettified, and 7.20 cites "PR #23's
      mutation-testing round" instead of JIT step numbers;
    - gates:
      - contracts 130;
      - api 370 passed / 6 skipped (SQLite), 375 / 1 (PG);
      - web 245, embed 5, sim 13 / 1 skipped;
      - `check:sh` 75, `test:demo` 15/15, `build:demo` and `check-demo-bundle`;
      - two capture runs, with no PNG change;
      - the YAML e2e suite was skipped, because the docker stack was down.
- **Targeted Opus re-review** of the slice review, at `99f264b`: **PASS**.
  - All 14 L1 and L2 findings are closed, with file:line evidence and pinning tests. The slice
    L3s are closed too.
  - Residuals are ROADMAP 7.19 and 7.20. The 8 new L3s it raised were all fixed.
  - CI: run 36148027240 on `99f264b` was 5/5, including the docker job's image and boot checks,
    and `ab3dfbe` is green.
- **Links** (private until the owner shares them):
  - the demo, https://claude.ai/artifact/AzkEcWfmUT23GCo2qkWxE7, is rebuilt from main after #16
    merges;
  - the deck, https://claude.ai/artifact/Day12XXUFNi7CJdNpa2MUH, is at v7: v6 changed Slide 4
    and v7 Slide 11. Its source is `docs/business/pitch-deck.md`.
- **Open user actions:**
  - the 6.10 live deploy, following the runbook (`docs/deploy-gcp.md` §1–§11) and the launch
    checklist;
  - a custom domain: web and api under one registrable domain. Map `demo.<domain>` and set
    `WEB_DEMO_URL` and `DEMO_URL` to it;
  - the WIF secrets, and the `staging` environment's `vars` in GitHub;
  - the WIF deployer's Cloud Build roles, the builds staging bucket
    `gs://<PROJECT_ID>-openad-builds`, and the build runner SA's roles;
  - the Base Sepolia deploy: commit `84532.json`, then rebuild the api image;
  - a dedicated, gas-only settler EOA. Export `OPENAD_SETTLER_ADDRESS` (never in the repo-root
    `.env`), and store its key as `openad-settler-key-<ENV>`;
  - verify the `X-Forwarded-For` chain, then enable the auth limiter and set
    `OPENAD_TRUSTED_PROXY_HOPS`. That also turns on the click burst rule;
  - confirm `max_connections`;
  - optionally, a WalletConnect project id. It needs the extra `CSP_CONNECT_SRC` hosts; then
    check the CSP reports in staging;
  - `PUBLIC_INVOKER=iam-disabled` where domain-restricted sharing refuses `allUsers`;
  - if a load balancer fronts the api: `API_INGRESS=internal-and-cloud-load-balancing` once it
    serves `API_URL`, and `OPENAD_PUBLIC_URL` set to its host;
  - verify every "(inferred; verify before deploy)" fact in staging;
  - the security audit (7.10) before any mainnet deploy, and a legal review;
  - share the demo and deck Artifacts, and fill in the deck's Team and Ask slides, which still
    hold placeholders.
- **Residual risks:**
  - not audited;
  - the per-instance auth limiter and the click burst rule stay off until the hop count is
    verified;
  - DNS rebinding (T17, 7.12); T18's per-address verify limit and per-pass concurrency (7.14);
  - DNS TXT verification doesn't work (7.16); the same-site guard isn't PSL-aware (7.13);
  - origin enforcement is best effort: a script can forge `Origin`, and a request with neither
    `Origin` nor `Referer` counts as a match;
  - the burst rule keys IPv6 clients by their full address (7.20). Behind a load balancer, its
    key can be trusted only once the api's ingress is closed;
  - the settler's startup check compares its key only with the vault's owner and the
    artifact's deployer (7.20). Until `set_settler` rotates a leaked settler key, it can
    over-report payable clicks within the caps (T20);
  - no phishing or malware check on click URLs (7.19);
  - the GCP facts marked "inferred" stay unverified until staging.
- **Phase 7:** ROADMAP 7.1–7.20.

## Identity fence

Non-custodial api/web; slots leased not sold; one-tx LEASE buy; Marketplace empty after tx;
CampaignVault holds only open `remaining`; serve never reads chain / never proxies advertiser
media; integer USDC; Unix seconds; spec ↔ interface ↔ code in sync; demo mode never touches a
chain or API (D3).
