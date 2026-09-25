# Launch checklist

## Done

| Item                                                           | Status | Link                                                                |
| -------------------------------------------------------------- | ------ | ------------------------------------------------------------------- |
| Hosted demo live (simulated data, simulated wallet)            | Done   | https://claude.ai/artifact/AzkEcWfmUT23GCo2qkWxE7                   |
| Pitch deck                                                     | Done   | https://claude.ai/artifact/Day12XXUFNi7CJdNpa2MUH                   |
| Docker images build in CI (`api`, `web`)                       | Done   | `.github/workflows/ci.yml`                                          |
| Deploy artifacts (Cloud Run configs, migrate job, nginx image) | Done   | `docs/deploy-gcp.md`, `infra/gcp/`                                  |
| Analytics read model (CTR, eCPM, spend/earnings trend) + UI    | Done   | `docs/ARCHITECTURE.md` §3.1, `api/src/openad/services/analytics.py` |
| Cross-platform run scripts (bash + PowerShell)                 | Done   | `scripts/*.sh`, `scripts/*.cmd`                                     |

## User actions

| Item                                                                                                                                                         | Owner | Link                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- | -------------------------------------------------------------------------------- |
| Share the demo and deck Artifacts with the intended audience                                                                                                 | User  | above                                                                            |
| Create a GCP project and follow the deploy runbook                                                                                                           | User  | `docs/deploy-gcp.md`                                                             |
| Set the GitHub Workload Identity Federation (WIF) secrets for CI deploy                                                                                      | User  | `docs/deploy-gcp.md`                                                             |
| Deploy contracts to Base Sepolia and commit the resulting `84532.json`                                                                                       | User  | `contracts/script/deploy.py`, `contracts/deployments/`, `docs/deploy-sepolia.md` |
| Commission a security audit before any mainnet deploy                                                                                                        | User  | —                                                                                |
| Legal: Terms of Service, privacy policy, advertiser content policy                                                                                           | User  | Placeholders only here — consult counsel before publishing any of these          |
| Register a production domain and support email                                                                                                               | User  | —                                                                                |
| Mainnet deploy: a human runs `scripts/deploy-gcp.sh --env prod --i-understand-this-is-mainnet` directly — `deploy.yml` only ever deploys staging, never prod | User  | `docs/deploy-mainnet.md`, `docs/deploy-gcp.md`                                   |

## Next PRs

| Item                                                                                                                                              | Notes                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Publisher growth: embed code panel, serve CORS fix, shareable slot page, "Advertise here" badge                                                   | ROADMAP 6.3, in progress on a separate branch |
| Slot listings: publisher-written audience description + category filter                                                                           | ROADMAP 6.3, in progress on a separate branch |
| Set `build.sourcemap: false` (or upload privately) for the production web image                                                                   | Backlog item found in the GCP deploy slice    |
| Slot listing text moderation                                                                                                                      | Backlog item, after slot listings ship        |
| Analytics refinements: CPC-only advertiser CTR, a separate "booked (upcoming)" tile, a neutral hint for a CPC slot with impressions but no clicks | Backlog items found in the analytics slice    |

## First 30 days

Metrics to track, consistent with `gtm-marketing.md`'s funnel:

- Landing-page → demo start → demo completion (advertiser and publisher paths).
- Publisher sign-ups → slots minted → terms set → first lease or campaign settlement (time to
  first payout).
- Advertiser sign-ups → creatives registered → first buy or campaign funded.
- GMV (LEASE `buy` + CPC `settle_batch` volume).
- Fill rate: periods sold vs. periods available; campaigns funded vs. eligible impressions.

No targets are set here — these are the metrics to instrument and watch, not commitments.
