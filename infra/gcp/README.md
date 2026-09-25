# `infra/gcp/` — Cloud Run deploy config (ADR-0017)

Topology and rationale: `docs/adr/0017-gcp-deployment.md`. Manual copy-paste commands:
`docs/deploy-gcp.md`. This directory holds the machine-readable versions those manual commands
turn into once `scripts/deploy-gcp.sh` exists.

## Files

- `cloudbuild.yaml` — builds and pushes the `api`, `web` and `web-demo` images to Artifact
  Registry, tagged `$SHORT_SHA` and `latest-<env>`. Substitutions: `_REGION`, `_REPO`, `_ENV`,
  `_API_URL`, `_CHAIN_ID`. Run via `gcloud builds submit --config infra/gcp/cloudbuild.yaml`.
- `services/api.yaml`, `services/indexer.yaml`, `services/settler.yaml`, `services/web.yaml`,
  `services/web-demo.yaml` — Cloud Run (Knative `serving.knative.dev/v1`) service specs, one
  per `gcloud run services replace`. `${VAR}` placeholders, not real values — see each file's
  header comment for which vars it needs.
- `jobs/migrate.yaml` — the Cloud Run Job that runs `alembic upgrade head` once, before traffic
  shifts to a new `openad-api` revision (ADR-0017 "Migrations"). Applied with
  `gcloud run jobs replace`, run with `gcloud run jobs execute openad-migrate --wait`.

## How `scripts/deploy-gcp.sh` renders these

Every `${VAR}` placeholder above is rendered with `envsubst` into a throwaway temp directory,
then applied with the matching `gcloud run ... replace` command. The script never edits these
source files in place. Placeholders used across the service/job specs:

| Placeholder    | Meaning                                                        |
| -------------- | --------------------------------------------------------------- |
| `PROJECT_ID`   | GCP project id (`--project`)                                    |
| `REGION`       | Cloud Run / Artifact Registry region (`--region`)                |
| `ENV`          | `staging` or `prod`                                              |
| `IMAGE_TAG`    | Image tag to deploy (`--tag`, default the short git SHA)         |
| `CHAIN_ID`     | `84532` (staging, Base Sepolia) or `8453` (prod, Base mainnet)   |
| `RPC_URL`      | Base RPC URL for this env                                        |
| `API_URL`      | This env's public API URL (`OPENAD_PUBLIC_URL`)                  |
| `WEB_URL`      | This env's public web URL (`OPENAD_CORS_ORIGINS`)                |
| `API_ORIGIN`   | API origin for `web.yaml`'s CSP `connect-src`                    |
| `RPC_ORIGINS`  | RPC origin(s) for `web.yaml`'s CSP `connect-src`                  |

Secrets (`openad-database-url-<ENV>`, `openad-settler-key-<ENV>`, `openad-session-secret-<ENV>`,
`openad-click-hmac-secret-<ENV>`) are referenced by name only, via `secretKeyRef` — never
rendered as plain values in these files or by the script. `services/settler.yaml` is the only
file referencing `openad-settler-key-<ENV>` (ADR-0014 / `AGENTS.md`: only the settler process
may hold `OPENAD_SETTLER_KEY`).

## What is not here

- No real project id, key, or secret value — every value above is a placeholder.
- No actual `gcloud` invocation happens in CI or in this repo's automation without
  `GCP_WORKLOAD_IDENTITY_PROVIDER`/`GCP_SERVICE_ACCOUNT` secrets configured
  (`.github/workflows/deploy.yml`), and even then only for `staging`. Deploying `prod` is
  always a human running `scripts/deploy-gcp.sh --env prod --i-understand-this-is-mainnet`
  themselves (ADR-0017 Consequences; `docs/deploy-mainnet.md`'s posture extended to deploys).
