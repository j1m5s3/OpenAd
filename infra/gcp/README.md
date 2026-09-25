# `infra/gcp/` — Cloud Run deploy config (ADR-0017)

Topology and rationale: `docs/adr/0017-gcp-deployment.md`. Manual copy-paste commands:
`docs/deploy-gcp.md`. This directory holds the machine-readable specs that
`scripts/deploy-gcp.sh` renders (with `envsubst`) and applies (with `gcloud run ... replace`).

## Files

- `cloudbuild.yaml` — builds and pushes the `api`, `web` and `web-demo` images to Artifact
  Registry, tagged `$SHORT_SHA` and `latest-<env>`. Substitutions: `_REGION`, `_REPO`, `_ENV`,
  `_API_URL`, `_CHAIN_ID`, `_WALLETCONNECT_PROJECT_ID`, `_GUIDE_URL`, `_DEMO_URL` (the last three
  default to `""`, meaning unset — see `web/Dockerfile`). Run via
  `gcloud builds submit --config infra/gcp/cloudbuild.yaml`.
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

| Placeholder     | Meaning                                                            |
| --------------- | -------------------------------------------------------------------- |
| `PROJECT_ID`    | GCP project id (`--project`)                                       |
| `REGION`        | Cloud Run / Artifact Registry region (`--region`)                  |
| `ENV`           | `staging` or `prod`                                                |
| `IMAGE_TAG`     | Image tag to deploy (`--tag`, default the short git SHA)           |
| `CHAIN_ID`      | `84532` (staging, Base Sepolia) or `8453` (prod, Base mainnet)     |
| `RPC_URL`       | Base RPC URL for this env                                          |
| `API_URL`       | This env's public API URL (`OPENAD_PUBLIC_URL`)                    |
| `WEB_URL`       | This env's public web URL (`OPENAD_CORS_ORIGINS`)                  |
| `API_ORIGIN`    | API origin for `web.yaml`'s CSP `connect-src`                      |
| `RPC_ORIGINS`   | RPC origin(s) for `web.yaml`'s CSP `connect-src`                   |
| `MEDIA_BUCKET`  | GCS bucket name, `api.yaml`/`indexer.yaml`'s `OPENAD_MEDIA_GCS_BUCKET` |
| `VPC_NETWORK`, `VPC_SUBNET` | Direct VPC egress target for `api`/`indexer`/`settler`/`migrate` to reach Cloud SQL's private IP (docs/deploy-gcp.md §3) |
| `API_INGRESS`   | `api.yaml`'s `run.googleapis.com/ingress`: `all` (default) or `internal-and-cloud-load-balancing` behind a load balancer (docs/deploy-gcp.md §11, "Click integrity") |

`WEB_DEMO_URL` is not an envsubst placeholder in any of these files: it's `scripts/deploy-gcp.sh`'s
own input for `openad-web-demo`'s post-deploy smoke check, unset by default (the script then
asks Cloud Run for the deployed URL with `gcloud run services describe`).

Secrets (`openad-database-url-<ENV>`, `openad-settler-key-<ENV>`, `openad-session-secret-<ENV>`,
`openad-click-hmac-secret-<ENV>`) are referenced by name only, via `secretKeyRef` — never
rendered as plain values in these files or by the script. `services/settler.yaml` is the only
file referencing `openad-settler-key-<ENV>` (ADR-0014 / `AGENTS.md`: only the settler process
may hold `OPENAD_SETTLER_KEY`).

`scripts/deploy-gcp.sh` also does a few things beyond rendering and applying these files:

- After each `services replace` of `openad-api`, `openad-web` and `openad-web-demo` it grants
  `allUsers`/`roles/run.invoker` (never for the indexer or the settler), since `services replace`
  applies no IAM of its own. Where an org policy refuses `allUsers`, `PUBLIC_INVOKER=iam-disabled`
  replaces that binding: the script adds `run.googleapis.com/invoker-iam-disabled: "true"` to
  those three services' rendered copies (never these source files) before each replace, then runs
  `gcloud run services update <svc> --no-invoker-iam-check` (inferred; verify before deploy).
- For `--only stack|all` it refuses outright when `API_URL` or `WEB_URL` is unset or empty,
  rather than silently deploying against an `example.com` placeholder.
- It smoke-checks `openad-api` at its own `*.run.app` URL while `API_INGRESS` is `all`, and at
  `API_URL` (the load balancer's host) when it's `internal-and-cloud-load-balancing`. Set
  `API_INGRESS=internal-and-cloud-load-balancing` only once the load balancer already serves
  `API_URL` — switching earlier fails that smoke check (inferred; verify before deploy).

## What is not here

- No real project id, key, or secret value — every value above is a placeholder.
- No actual `gcloud` invocation happens in CI or in this repo's automation without
  `GCP_WORKLOAD_IDENTITY_PROVIDER`/`GCP_SERVICE_ACCOUNT` secrets configured
  (`.github/workflows/deploy.yml`), and even then only for `staging`. Deploying `prod` is
  always a human running `scripts/deploy-gcp.sh --env prod --i-understand-this-is-mainnet`
  themselves (ADR-0017 Consequences; `docs/deploy-mainnet.md`'s posture extended to deploys).
