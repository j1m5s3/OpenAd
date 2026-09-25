# GCP production deployment runbook (ADR-0017, ROADMAP 6.6)

Topology and rationale: `docs/adr/0017-gcp-deployment.md`. This is the copy-paste companion.

**This environment has no `gcloud` CLI and no GCP credentials.** Every command below is for
you to run from a machine with `gcloud` installed and authenticated
(`gcloud auth login && gcloud auth application-default login`). Replace `<PROJECT_ID>`,
`<REGION>` (e.g. `us-central1`) and `<ENV>` (`staging` or `prod`) throughout. Never paste a
real project id, key, or secret value into this file or into a commit — placeholders only.

## 0. Prerequisites

- A GCP project, billing enabled: `<PROJECT_ID>`.
- `contracts/deployments/84532.json` (staging, Base Sepolia) or `8453.json` (prod, Base
  mainnet) already committed — see `docs/deploy-sepolia.md` / `docs/deploy-mainnet.md`. GCP
  deploy does not broadcast contracts.
- The `gcs` extra buildable: `api/pyproject.toml` `[project.optional-dependencies] gcs`.

## 1. Enable APIs

```bash
gcloud config set project <PROJECT_ID>
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com \
  storage.googleapis.com \
  cloudbuild.googleapis.com \
  iamcredentials.googleapis.com
```

## 2. Artifact Registry

```bash
gcloud artifacts repositories create openad \
  --repository-format=docker --location=<REGION> \
  --description="OpenAd images (api/indexer/settler share one image; web separate)"
```

## 3. Private Services Access + Cloud SQL Postgres 16

A private-IP Cloud SQL instance needs a VPC peering to Google's service producer network, set
up once per VPC (`default` here) before the instance exists:

```bash
gcloud compute addresses create google-managed-services-default \
  --global --purpose=VPC_PEERING --prefix-length=16 --network=default

gcloud services vpc-peerings connect \
  --service=servicenetworking.googleapis.com \
  --ranges=google-managed-services-default --network=default
```

```bash
gcloud sql instances create openad-<ENV> \
  --database-version=POSTGRES_16 --tier=db-custom-1-3840 \
  --region=<REGION> --no-assign-ip --network=default

gcloud sql databases create openad --instance=openad-<ENV>

# Generates its own password; do not type one into this shell's history.
gcloud sql users create openad \
  --instance=openad-<ENV> --password="$(openssl rand -base64 32)"
```

Build the connection string as
`postgresql+asyncpg://openad:<PASSWORD>@/openad?host=/cloudsql/<PROJECT_ID>:<REGION>:openad-<ENV>`
(Cloud SQL Auth Proxy / unix socket — no public IP) and store it in Secret Manager (step 5);
never in a plain Cloud Run env var.

## 4. GCS media bucket + service accounts

```bash
gcloud storage buckets create gs://openad-media-<ENV> \
  --location=<REGION> --uniform-bucket-level-access

gcloud iam service-accounts create openad-api-<ENV> --display-name="OpenAd api <ENV>"
gcloud iam service-accounts create openad-indexer-<ENV> --display-name="OpenAd indexer <ENV>"
gcloud iam service-accounts create openad-settler-<ENV> --display-name="OpenAd settler <ENV>"
gcloud iam service-accounts create openad-migrate-<ENV> --display-name="OpenAd migrate job <ENV>"

gcloud storage buckets add-iam-policy-binding gs://openad-media-<ENV> \
  --member="serviceAccount:openad-api-<ENV>@<PROJECT_ID>.iam.gserviceaccount.com" \
  --role="roles/storage.objectViewer"

# objectUser (not objectCreator): the indexer legitimately overwrites the same key on a
# replay (reorg re-verification, or the scheduled re-check), which objectCreator can't do.
# Scoped to this one bucket only, not project-wide.
gcloud storage buckets add-iam-policy-binding gs://openad-media-<ENV> \
  --member="serviceAccount:openad-indexer-<ENV>@<PROJECT_ID>.iam.gserviceaccount.com" \
  --role="roles/storage.objectUser"

# Cloud SQL client role for api / indexer / settler / the migrate job's service account.
for SA in openad-api openad-indexer openad-settler openad-migrate; do
  gcloud projects add-iam-policy-binding <PROJECT_ID> \
    --member="serviceAccount:${SA}-<ENV>@<PROJECT_ID>.iam.gserviceaccount.com" \
    --role="roles/cloudsql.client"
done
```

## 5. Secrets

```bash
# Database URL (built in step 3), one secret per env.
printf '%s' 'postgresql+asyncpg://openad:<PASSWORD>@/openad?host=/cloudsql/<PROJECT_ID>:<REGION>:openad-<ENV>' \
  | gcloud secrets create openad-database-url-<ENV> --data-file=-

# Settler key — ONLY this secret's IAM binding names the settler service account.
# Generate/import the deployer/settler EOA's private key out of band; never echo it here.
gcloud secrets create openad-settler-key-<ENV> --data-file=/path/to/local/key/file
gcloud secrets add-iam-policy-binding openad-settler-key-<ENV> \
  --member="serviceAccount:openad-settler-<ENV>@<PROJECT_ID>.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

# SIWE session secret and click HMAC secret (random, per env).
printf '%s' "$(openssl rand -hex 32)" | gcloud secrets create openad-session-secret-<ENV> --data-file=-
printf '%s' "$(openssl rand -hex 32)" | gcloud secrets create openad-click-hmac-secret-<ENV> --data-file=-
```

Grant `roles/secretmanager.secretAccessor` on `openad-database-url-<ENV>`,
`openad-session-secret-<ENV>` and `openad-click-hmac-secret-<ENV>` to the `openad-api-<ENV>`,
`openad-migrate-<ENV>` service accounts (and `openad-indexer-<ENV>` for the database URL only —
it never needs the session or click secrets).

## 6-8. Build, migrate, deploy — the primary path: `scripts/deploy-gcp.sh`

Steps 1-5 above (APIs, Artifact Registry, Cloud SQL, the GCS bucket + service accounts, and
the secrets) are one-time, per-environment setup and stay manual. Once they're done, building
the images, running the migration job and deploying the services is one command
(`infra/gcp/README.md` documents every file it renders):

```bash
cd /path/to/OpenAd
./scripts/deploy-gcp.sh --env staging --only demo  --project <PROJECT_ID> --region <REGION>
./scripts/deploy-gcp.sh --env staging --only stack --project <PROJECT_ID> --region <REGION>
# --only all does both plus the real (non-demo) web site. --dry-run prints every command
# instead of running it. --env prod additionally requires
# --i-understand-this-is-mainnet and is refused outright when CI=true.
./scripts/deploy-gcp.sh --help
```

This is exactly what `.github/workflows/deploy.yml` runs on `main` (staging only, gated on
`GCP_WORKLOAD_IDENTITY_PROVIDER` being set — see step 10 below) — there is no difference
between the CI path and running it yourself. The rest of this section (§6-§8) is the manual
fallback: the individual `gcloud` commands the script above wraps, for debugging one step in
isolation or if you'd rather not use the script.

### 6. Build and push images (manual fallback)

```bash
gcloud builds submit --config infra/gcp/cloudbuild.yaml --project <PROJECT_ID> \
  --substitutions=_REGION=<REGION>,_REPO=openad,_ENV=<ENV>,_API_URL=https://api.<ENV>.example.com,_CHAIN_ID=<CHAIN_ID>
```

Or build one image directly, e.g. `gcloud builds submit --tag
<REGION>-docker.pkg.dev/<PROJECT_ID>/openad/api:latest -f api/Dockerfile --build-arg
UV_EXTRAS=gcs .` (and `-f web/Dockerfile`, with `--build-arg VITE_DEMO_MODE=1` for the demo
variant). `indexer` and `settler` reuse the `api` image with a different Cloud Run `command`
(`python -m openad.indexer` / `python -m openad.settler`), so nothing extra to build there.

### 7. Run the migration job (manual fallback)

```bash
envsubst <infra/gcp/jobs/migrate.yaml # with PROJECT_ID, REGION, ENV, IMAGE_TAG set
gcloud run jobs replace <rendered-migrate.yaml> --project <PROJECT_ID> --region <REGION>
gcloud run jobs execute openad-migrate --project <PROJECT_ID> --region <REGION> --wait
```

Run this job **before** shifting traffic to a new `api` revision on every deploy (ADR-0017
"Migrations" — the `api` image's `CMD` no longer runs migrations on start).

### 8. Deploy the services (manual fallback)

```bash
gcloud run services replace <rendered-api.yaml>      --project <PROJECT_ID> --region <REGION>
gcloud run services replace <rendered-indexer.yaml>  --project <PROJECT_ID> --region <REGION>
gcloud run services replace <rendered-settler.yaml>  --project <PROJECT_ID> --region <REGION>
gcloud run services replace <rendered-web.yaml>      --project <PROJECT_ID> --region <REGION>
gcloud run services replace <rendered-web-demo.yaml> --project <PROJECT_ID> --region <REGION>
```

Each `infra/gcp/services/*.yaml` is rendered from its `${VAR}` placeholders with `envsubst`
first (`infra/gcp/README.md` lists every placeholder); `scripts/deploy-gcp.sh` does this
rendering into a throwaway temp directory automatically. Env vars below are the non-secret
subset of `.env.example`; adjust per environment (`OPENAD_CHAIN_ID`, `OPENAD_RPC_URL`,
`OPENAD_DEPLOYMENTS_DIR` point at the committed
`84532.json`/`8453.json` baked into the image, or an external RPC URL).

```bash
gcloud run deploy openad-api \
  --image=<REGION>-docker.pkg.dev/<PROJECT_ID>/openad/api:latest \
  --region=<REGION> --platform=managed --allow-unauthenticated \
  --port=8000 --min-instances=1 \
  --service-account=openad-api-<ENV>@<PROJECT_ID>.iam.gserviceaccount.com \
  --set-cloudsql-instances=<PROJECT_ID>:<REGION>:openad-<ENV> \
  --set-env-vars=OPENAD_ENV=<ENV>,OPENAD_MEDIA_BACKEND=gcs,OPENAD_MEDIA_GCS_BUCKET=openad-media-<ENV>,OPENAD_CHAIN_ID=<CHAIN_ID>,OPENAD_RPC_URL=<RPC_URL>,OPENAD_PUBLIC_URL=https://api.<ENV>.example.com,OPENAD_CORS_ORIGINS=https://<ENV>.example.com \
  --set-secrets=OPENAD_DATABASE_URL=openad-database-url-<ENV>:latest,OPENAD_SESSION_SECRET=openad-session-secret-<ENV>:latest,OPENAD_CLICK_HMAC_SECRET=openad-click-hmac-secret-<ENV>:latest

# No --port here: Cloud Run injects $PORT (default 8080) into every container regardless of
# ingress, and openad.health's liveness listener (ADR-0017) binds whatever $PORT it finds —
# nothing else in the indexer needs a port.
gcloud run deploy openad-indexer \
  --image=<REGION>-docker.pkg.dev/<PROJECT_ID>/openad/api:latest \
  --region=<REGION> --platform=managed --no-allow-unauthenticated --ingress=internal \
  --min-instances=1 --max-instances=1 --no-cpu-throttling \
  --command="uv,run,python,-m,openad.indexer" \
  --service-account=openad-indexer-<ENV>@<PROJECT_ID>.iam.gserviceaccount.com \
  --set-cloudsql-instances=<PROJECT_ID>:<REGION>:openad-<ENV> \
  --set-env-vars=OPENAD_ENV=<ENV>,OPENAD_MEDIA_BACKEND=gcs,OPENAD_MEDIA_GCS_BUCKET=openad-media-<ENV>,OPENAD_CHAIN_ID=<CHAIN_ID>,OPENAD_RPC_URL=<RPC_URL> \
  --set-secrets=OPENAD_DATABASE_URL=openad-database-url-<ENV>:latest

gcloud run deploy openad-settler \
  --image=<REGION>-docker.pkg.dev/<PROJECT_ID>/openad/api:latest \
  --region=<REGION> --platform=managed --no-allow-unauthenticated --ingress=internal \
  --min-instances=1 --max-instances=1 --no-cpu-throttling \
  --command="uv,run,python,-m,openad.settler" \
  --service-account=openad-settler-<ENV>@<PROJECT_ID>.iam.gserviceaccount.com \
  --set-cloudsql-instances=<PROJECT_ID>:<REGION>:openad-<ENV> \
  --set-env-vars=OPENAD_ENV=<ENV>,OPENAD_CHAIN_ID=<CHAIN_ID>,OPENAD_RPC_URL=<RPC_URL> \
  --set-secrets=OPENAD_DATABASE_URL=openad-database-url-<ENV>:latest,OPENAD_SETTLER_KEY=openad-settler-key-<ENV>:latest

gcloud run deploy openad-web \
  --image=<REGION>-docker.pkg.dev/<PROJECT_ID>/openad/web:latest \
  --region=<REGION> --platform=managed --allow-unauthenticated
```

`openad-settler` is the **only** service with `OPENAD_SETTLER_KEY` bound, and its service
account is the only one with `secretAccessor` on that secret (step 5) — matches ADR-0014 and
`AGENTS.md`'s non-custodial invariant. Confirm with
`gcloud secrets get-iam-policy openad-settler-key-<ENV>` before going further.

## 9. Domain mapping / CDN in front of serve

```bash
gcloud run domain-mappings create --service=openad-api --domain=api.<ENV>.example.com --region=<REGION>
gcloud run domain-mappings create --service=openad-web --domain=<ENV>.example.com --region=<REGION>
```

Optional: put a global HTTPS load balancer + Cloud CDN in front of `openad-api` scoped to
`/v1/serve/*` and `/v1/serve/*/media`, since those responses are already
`Cache-Control: public, max-age=<ttl>` (ARCHITECTURE §3.4). Everything else can go straight
through Cloud Run's own HTTPS endpoint.

## 10. Workload Identity Federation for GitHub Actions (no JSON keys)

```bash
gcloud iam workload-identity-pools create github --location=global

# --attribute-condition restricts the provider to THIS repo's tokens; without it any GitHub
# repo could mint a token this pool would accept as long as it satisfies the attribute mapping.
gcloud iam workload-identity-pools providers create-oidc github-actions \
  --location=global --workload-identity-pool=github \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository=='<ORG>/<REPO>'"

gcloud iam service-accounts create openad-deployer-<ENV>
gcloud iam service-accounts add-iam-policy-binding \
  openad-deployer-<ENV>@<PROJECT_ID>.iam.gserviceaccount.com \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/github/attribute.repository/<ORG>/<REPO>"

# Minimum roles the deployer SA needs to build, push and deploy: it must NOT get
# roles/owner or roles/editor.
for ROLE in roles/run.admin roles/iam.serviceAccountUser roles/artifactregistry.writer; do
  gcloud projects add-iam-policy-binding <PROJECT_ID> \
    --member="serviceAccount:openad-deployer-<ENV>@<PROJECT_ID>.iam.gserviceaccount.com" \
    --role="${ROLE}"
done
```

`roles/iam.serviceAccountUser` lets the deployer SA deploy Cloud Run revisions *as*
`openad-api-<ENV>` / `openad-indexer-<ENV>` / `openad-settler-<ENV>` without itself gaining
access to those service accounts' secrets (it is `actAs`, not `secretAccessor`).

Store the Workload Identity Provider resource name and the deployer service account email as
GitHub repo/environment secrets `GCP_WORKLOAD_IDENTITY_PROVIDER` and `GCP_SERVICE_ACCOUNT`,
plus `GCP_PROJECT_ID` and `GCP_REGION` for `scripts/deploy-gcp.sh --project`/`--region`.
`.github/workflows/deploy.yml`'s `gate` job checks `GCP_WORKLOAD_IDENTITY_PROVIDER` and skips
the `deploy` job entirely when it is absent; the workflow only ever targets `staging` and never
broadcasts to Base mainnet regardless of what secrets are configured.

## 11. Smoke checks

```bash
curl -sf https://api.<ENV>.example.com/v1/health
curl -sf https://api.<ENV>.example.com/v1/serve/1
curl -sf https://<ENV>.example.com/embed-demo   # or /demo/ for the demo build
```

### Sign-in origin

Sign-in is bound to the web app's origin (ADR-0009 amendment). The API accepts a SIWE message
only if its `domain` is the `host:port`, and its `URI` the origin, of an allowed origin:
`OPENAD_SIWE_ALLOWED_ORIGINS`, or `OPENAD_CORS_ORIGINS` (`${WEB_URL}` in `api.yaml`) when that
is unset. Open the web app, connect a wallet and sign in. A 401 `domain not allowed` from
`/v1/auth/verify` means the page's exact origin (scheme, host, port) is not in that list. If
users reach the web app on more than one origin, list each one in both variables.

### Auth rate limit: verify the X-Forwarded-For chain in staging, then enable

`infra/gcp/services/api.yaml` leaves `OPENAD_AUTH_RATE_LIMIT_PER_MINUTE` and
`OPENAD_TRUSTED_PROXY_HOPS` unset, so the limiter is **off**. The limiter keys each client by
the TCP peer (hops `0`) or by the N-th `X-Forwarded-For` entry from the right (hops `N`).

- **Why it is off.** It is only safe once you know which `X-Forwarded-For` entry Google's front
  end writes. The Cloud Run functions request-header reference says only that the *first*
  entry is "generally" the client
  (https://docs.cloud.google.com/functions/docs/reference/headers).
  The first entry is the one a client can forge. The Cloud Run container contract
  (https://docs.cloud.google.com/run/docs/container-contract) says nothing about the header.
- **Never enable it with hops `0` on Cloud Run.** The container's TCP peer is Google's proxy,
  not the visitor, so every client would share one bucket (inferred; verify before deploy).
- **Leave uvicorn's `FORWARDED_ALLOW_IPS` unset.** Set to `*`, uvicorn replaces the peer with
  the left-most `X-Forwarded-For` entry, which the client controls.

To verify and enable:

1. Turn the limiter on in **staging only**, at a low rate with one trusted hop, and cap the
   staging api at **one instance** (`--max-instances=1`) for the test. Buckets live in each
   instance's memory, so with more than one instance the checks below prove nothing: the
   fourth request in step 2 can pass because it reached an instance whose bucket is still
   full, and a `200` in step 3 can come from another instance's fresh bucket rather than
   from a different client key.

   ```bash
   gcloud run services update openad-api --region=<REGION> --max-instances=1 \
     --update-env-vars=OPENAD_AUTH_RATE_LIMIT_PER_MINUTE=3,OPENAD_TRUSTED_PROXY_HOPS=1
   ```

2. From one machine, send four requests, each with a different forged header:

   ```bash
   API=https://api.staging.example.com
   for spoof in 198.51.100.1 198.51.100.2 198.51.100.3 198.51.100.4; do
     curl -s -o /dev/null -w '%{http_code}\n' -X POST -H "X-Forwarded-For: ${spoof}" "${API}/v1/auth/nonce"
   done
   curl -si -X POST "${API}/v1/auth/nonce" | grep -i '^retry-after'
   ```

   Expect `200 200 200 429`, then a `Retry-After` line. If the fourth request is not refused,
   the key comes from an entry the client controls: stop, and keep the limiter off.
3. Straight away, from a **different network** (for example a phone hotspot), send one
   request. Expect `200`: with a single instance, that means a different bucket, so the key
   is the caller's own address. A `429` means the key is a shared proxy address, not the
   client, so the hop count is wrong.
4. Only when both checks pass, add the variables to the `env` list in
   `infra/gcp/services/api.yaml`, with the verified hop count and the production rate (for
   example `OPENAD_AUTH_RATE_LIMIT_PER_MINUTE=30`), and redeploy with
   `scripts/deploy-gcp.sh`. It applies that file with `gcloud run services replace`, so values
   set only with `gcloud run services update`, including the test's one-instance cap, do not
   survive it (inferred; verify before deploy). If a check failed, redeploy the same way
   without the variables: the limiter goes back off and the cap is lifted.
5. Repeat the checks whenever the path in front of `openad-api` changes, such as adding a load
   balancer (§ 9). A load balancer adds its own `X-Forwarded-For` entries, so the hop count
   usually becomes `2` (inferred; verify before deploy).

**Per instance, not global.** Each `openad-api` instance keeps its own buckets, so the real
limit is the setting times the number of instances, and a restart resets it. It only slows
nonce flooding and signature spraying from one address. For a global limit, put Cloud Armor
rate limiting on `/v1/auth/*` on an external Application Load Balancer in front of
`openad-api`. Cloud Armor policies attach to a load balancer's backend service, not to a bare
`run.app` URL, and the rate-limit rule actions are `throttle` and `rate_based_ban` (both
inferred; verify before deploy).

## 12. Rollback

```bash
gcloud run revisions list --service=openad-api --region=<REGION>
gcloud run services update-traffic openad-api --region=<REGION> --to-revisions=<REVISION>=100
```

Repeat per service. Rolling back `openad-api` does not roll back the database; if a bad deploy
included a destructive migration, restore from the Cloud SQL automated backup instead.

## 13. Cost notes (approximate; check current GCP pricing)

- Cloud Run: `openad-api` with `min-instances=1` and `openad-indexer`/`openad-settler` each
  pinned at 1 always-on instance are the dominant cost (roughly one always-on small instance's
  worth each, machine-hours billed continuously since they never scale to zero).
- Cloud SQL `db-custom-1-3840`: a fixed monthly instance cost plus storage.
- GCS: pennies at this data volume (creative images only, capped at
  `OPENAD_MAX_MEDIA_BYTES` = 2 MiB each).
- Artifact Registry / Secret Manager / WIF: negligible at this scale.

Staging can safely use smaller Cloud SQL tiers and `min-instances=0` on `openad-api` (accepting
cold starts) to cut cost; production should not, per this ADR's `min-instances=1`.

## 14. Teardown

```bash
gcloud run services delete openad-api openad-indexer openad-settler openad-web --region=<REGION>
gcloud run jobs delete openad-migrate --region=<REGION>
gcloud sql instances delete openad-<ENV>
gcloud storage rm --recursive gs://openad-media-<ENV>
gcloud secrets delete openad-database-url-<ENV> openad-settler-key-<ENV> \
  openad-session-secret-<ENV> openad-click-hmac-secret-<ENV>
```
