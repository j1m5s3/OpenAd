# Launch checklist

USDC-only friction (market-fit blocker 5) is mitigated with a guide link, not new code:
[`docs/guide/advertiser/getting-usdc-on-base.md`](../guide/advertiser/getting-usdc-on-base.md).

## Done

| Item                                                                                            | Status | Link                                                                |
| ----------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------- |
| Hosted demo live (simulated data, simulated wallet)                                             | Done   | https://claude.ai/artifact/AzkEcWfmUT23GCo2qkWxE7                   |
| Pitch deck                                                                                      | Done   | https://claude.ai/artifact/Day12XXUFNi7CJdNpa2MUH                   |
| Docker images build in CI (`api`, `web`)                                                        | Done   | `.github/workflows/ci.yml`                                          |
| Deploy artifacts (Cloud Run configs, migrate job, nginx image)                                  | Done   | `docs/deploy-gcp.md`, `infra/gcp/`                                  |
| Analytics read model (CTR, eCPM, spend/earnings trend) + UI                                     | Done   | `docs/ARCHITECTURE.md` §3.1, `api/src/openad/services/analytics.py` |
| Cross-platform run scripts (bash + PowerShell)                                                  | Done   | `scripts/*.sh`, `scripts/*.cmd`                                     |
| Publisher growth: embed code panel, serve CORS fix, shareable slot page, "Advertise here" badge | Done   | PR #10                                                              |
| Slot listings: publisher-written audience description + category filter                         | Done   | PR #13                                                              |
| Auth hardening: SIWE bound to allowed origins, atomic nonce use, pruning, opt-in rate limit     | Done   | PR #15                                                              |
| Capacity and deploy hardening: DB pool budget, Cloud Run scale caps, same-site domain guard     | Done   | PR #14                                                              |
| Outbound-fetch bounds: overall media-fetch deadline, per-pass verify budget, per-slot cooldown  | Done   | PR #17                                                              |
| Discover and the slot page follow the open-ended calendar, not just the first period            | Done   | PR #19                                                              |
| Periods endpoint capped at 60 per request, leases read in one query                             | Done   | PR #18                                                              |
| Sourcemaps off by default for the production web build                                          | Done   | PR #16 (`web/vite.config.ts`, `VITE_SOURCEMAP`)                     |

## User actions

| Item                                                                                                                                                                                                                                           | Owner | Link                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | -------------------------------------------------------------------------------- |
| Share the demo and deck Artifacts with the intended audience                                                                                                                                                                                   | User  | above                                                                            |
| Republish the hosted demo after PR #16 merges (it currently ships `.map` files; the sourcemap fix above removes them from the next build)                                                                                                      | Team  | https://claude.ai/artifact/AzkEcWfmUT23GCo2qkWxE7                                |
| Create a GCP project and follow the deploy runbook                                                                                                                                                                                             | User  | `docs/deploy-gcp.md`                                                             |
| Set the GitHub Workload Identity Federation (WIF) secrets for CI deploy                                                                                                                                                                        | User  | `docs/deploy-gcp.md`                                                             |
| Deploy contracts to Base Sepolia and commit the resulting `84532.json`                                                                                                                                                                         | User  | `contracts/script/deploy.py`, `contracts/deployments/`, `docs/deploy-sepolia.md` |
| Register a custom domain and map both `api` and `web` under it (required: `SameSite=Lax` sessions need one registrable domain)                                                                                                                 | User  | `docs/deploy-gcp.md` §9                                                          |
| Verify the `X-Forwarded-For` chain in staging, then enable the auth rate limit (off by default; ROADMAP 6.8)                                                                                                                                   | User  | `docs/deploy-gcp.md` §11                                                         |
| Confirm `max_connections` ≥ 100 before the first deploy (`gcloud sql instances describe openad-<ENV> --format='value(settings.databaseFlags)'`), and redo the connection budget in `docs/deploy-gcp.md` §3 before raising `maxScale` or a pool | User  | `docs/deploy-gcp.md` §3                                                          |
| Commission a security audit before any mainnet deploy                                                                                                                                                                                          | User  | —                                                                                |
| Legal: Terms of Service, privacy policy, advertiser content policy                                                                                                                                                                             | User  | Placeholders only here — consult counsel before publishing any of these          |
| Register a production domain and support email                                                                                                                                                                                                 | User  | —                                                                                |
| Mainnet deploy: a human runs `scripts/deploy-gcp.sh --env prod --i-understand-this-is-mainnet` directly — `deploy.yml` only ever deploys staging, never prod                                                                                   | User  | `docs/deploy-mainnet.md`, `docs/deploy-gcp.md`                                   |

## Next PRs

See `docs/ROADMAP.md` Phase 7 for the full, current backlog (analytics refinements, listing
moderation, the `useSiwe` race, auth and media-fetch follow-ups, an independent audit, and more).
Nothing here duplicates that list.

## First 30 days

Metrics to track, consistent with `gtm-marketing.md`'s funnel:

- Landing-page → demo start → demo completion (advertiser and publisher paths).
- Publisher sign-ups → slots minted → terms set → first lease or campaign settlement (time to
  first payout).
- Advertiser sign-ups → creatives registered → first buy or campaign funded.
- GMV (LEASE `buy` + CPC `settle_batch` volume).
- Fill rate: periods sold vs. periods available; campaigns funded vs. eligible impressions.

No targets are set here — these are the metrics to instrument and watch, not commitments.
