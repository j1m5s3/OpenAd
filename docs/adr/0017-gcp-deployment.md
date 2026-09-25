# ADR-0017: GCP production deployment topology

- **Status:** Accepted
- **Date:** 2026-09-24
- **Scope:** repo, api

## Context

Phase 6 needs a real production target: a hosted demo site and a working staging/production
API so a prospective publisher or advertiser can use OpenAd without anyone running the local
stack for them. The repo already runs four processes (`api`, `indexer`, `settler`, `web`) plus
Postgres, and `AGENTS.md` fixes who may hold keys: `api`/`web` never sign or hold spending
keys; the settler process alone may hold `OPENAD_SETTLER_KEY` and may only call
`CampaignVault.settle_batch` (ADR-0014).

Docker Compose (`docker-compose.yml`, `docker-compose.stack.yml`) is the local/dev answer.
It assumes one host with a shared filesystem: the indexer writes verified creative bytes to
`OPENAD_MEDIA_CACHE_DIR` (`api/src/openad/services/media.py` → `services/media_store.py`) and
the api's serve router reads them back from the same path
(`api/src/openad/routers/serve.py` `serve_media`). Cloud Run — the natural fit for four small
stateless-ish HTTP/worker processes with a managed Postgres alongside — runs each service as
its own container on ephemeral, per-instance disk. Two Cloud Run services never share a
filesystem, so the local media cache silently breaks the serve path (worst case: publishers'
verified creatives never render) the moment `api` and `indexer` are split across instances.
That is the deployment-shaped decision this ADR exists to make, alongside the rest of the
topology needed to run this repo's processes on GCP without loosening any custody invariant.

The question: what GCP topology serves `api`/`indexer`/`settler`/`web`, where does Postgres and
the media cache live, and how does the media cache keep working once `api` and `indexer` are
separate containers.

## Decision

**Cloud Run services, Cloud SQL Postgres, a GCS-backed media cache behind a storage
interface, and a Cloud Run Job for migrations.**

### Services (Cloud Run)

- `openad-api` — public ingress, `min-instances=1` (cold starts on the serve path are a bad
  publisher/advertiser experience), `--port=8000` (matches `EXPOSE 8000` / `uvicorn --port 8000`
  in `api/Dockerfile`). Runs `uvicorn openad.main:app`. No migrations in the container's `CMD`
  (see "Migrations" below — that changes in step 27+28; this ADR records the decision now since
  it is a direct consequence of running >1 instance).
- `openad-indexer` — **no ingress**, `--ingress=internal`, `--no-allow-unauthenticated`
  (never reachable from the internet; it is a worker, not an HTTP service).
  `min-instances = max-instances = 1` with `--no-cpu-throttling` (Cloud Run's default "CPU only
  during requests" would stall the poll loop between requests, and indexer handlers must not run
  concurrently against the cursor). Runs `python -m openad.indexer`.
- `openad-settler` — same flags as `openad-indexer` (`--ingress=internal`,
  `--no-allow-unauthenticated`, `min-instances=max-instances=1`, `--no-cpu-throttling`). Runs
  `python -m openad.settler`. Its service account is the only one bound to the
  `OPENAD_SETTLER_KEY` secret (Secret Manager IAM, not a repo-level grant), and per ADR-0014
  this process may only ever call `settle_batch`. `api` and `web` service accounts get no
  access to that secret. The secret holds a dedicated, gas-only settler EOA's key, never the
  contracts' owner (deploy) key, which stays in the contracts environment (Moccasin wallet, or
  the Safe on Base); off Anvil the process refuses to start if its key owns `CampaignVault` or
  is the deployer.
- `openad-web` — a static site (nginx serving the Vite build; step 27+28 adds the
  `web/Dockerfile` and service YAML) behind Cloud Run or a bucket + load balancer. The demo
  build (`VITE_DEMO_MODE=1`, ADR-0016) is a **separate** Cloud Run service or a separate bucket
  path so the demo and the real site can be promoted/rolled back independently.

### Migrations: a Cloud Run Job, not the api container's `CMD`

Today `api/Dockerfile`'s `CMD` runs `alembic upgrade head` before `uvicorn` on every container
start. With `min-instances=1` and rolling deploys that is at least two containers racing the
same migration on startup — harmless while migrations are idempotent no-ops on a stable schema,
but a real hazard the moment a deploy lands a new revision mid-rollout. The fix is a Cloud Run
**Job** `openad-migrate` (same image, override command to `alembic upgrade head`) run once by
the deploy pipeline before traffic shifts to the new `api` revision. This ADR records the
decision; the `api/Dockerfile` `CMD` change and the job's Cloud Build/YAML wiring land in step
27+28 so this step's Verify command (which builds nothing) stays accurate to what's implemented.

### `$PORT` for no-ingress workers: a tiny stdlib liveness listener

Cloud Run health-checks every container's `$PORT` on startup — including a "no ingress"
service — to decide whether the revision is up. `openad-indexer` and `openad-settler` are pure
poll loops with nothing to serve; deployed as plain `gcloud run deploy` services they would
never open `$PORT` and Cloud Run would report them stuck starting.

`api/src/openad/health.py` adds a minimal stdlib (`http.server`, no new dependency) liveness
listener, started **only when the `PORT` environment variable is set** — Cloud Run always sets
it; local runs (`python -m openad.indexer` / `.settler`) never do, so local behaviour is
unchanged. `GET /` and `GET /healthz` return `200` while the poll loop has ticked recently and
`503` once it has gone stale (`max(poll_interval × 5, 30s)`), so Cloud Run can tell "still
looping" from "stuck" or "crash-looping in a tight backoff." Both `IndexerRunner` and
`SettlerRunner` take an optional `liveness: Liveness | None` and call `.tick()` once per loop
iteration (success or failure) right before sleeping — a hang *inside* an iteration correctly
goes stale; a failing-but-still-looping iteration does not. `PORT` is a platform-injected
container contract, not an `OPENAD_*` application setting, so `health.py` reads it directly
from `os.environ` rather than adding it to `Settings` — the same carve-out already made for
`OPENAD_SETTLER_KEY` (ARCHITECTURE §3.8).

**Alternative considered:** `gcloud beta run worker-pools`, a Cloud Run resource kind built
specifically for "a process with no HTTP surface" — no `$PORT` listener needed at all. It was
still `beta` when this ADR was written, so this step uses the stdlib listener on stable
`gcloud run deploy` instead. Revisit once `worker-pools` is GA: dropping the listener is a
one-line change (remove the `liveness` argument), not a rearchitecture.

`openad-api` deliberately gets no `Liveness`/`health.py` listener of its own: uvicorn already
binds `$PORT` and `GET /v1/health` already exists (`api/src/openad/routers/health.py`), so
Cloud Run's own startup/liveness probe against that real endpoint is sufficient. `health.py`
exists solely for `openad-indexer` and `openad-settler`, the two processes with nothing else
listening on `$PORT`.

### Database: Cloud SQL Postgres 16

Managed Postgres 16, matching local (`docker-compose.yml` also runs Postgres 16). `api`,
`indexer`, `settler` and `openad-migrate` connect over a private IP / the Cloud SQL Auth Proxy
sidecar (no public IP on the instance). A private IP Cloud SQL instance needs Private Services
Access set
up once per VPC (an allocated peering IP range plus a `servicenetworking.googleapis.com` VPC
peering to that range) before instance creation; the runbook's §3 does this ahead of
`gcloud sql instances create`. `OPENAD_DATABASE_URL` for each service comes from Secret
Manager, not a plain env var, since it embeds a password.

Reaching the private IP from Cloud Run needs its own route: `api`, `indexer`, `settler` and the
`openad-migrate` job each get Direct VPC egress (`run.googleapis.com/network-interfaces` +
`run.googleapis.com/vpc-access-egress: private-ranges-only`, docs/deploy-gcp.md §3). The
instance is created with `--edition=ENTERPRISE`: new Postgres 16 instances default to
Enterprise Plus, which doesn't offer the `db-custom-*` tier this ADR uses (both **inferred;
verify before deploy**).

### Media cache: `MediaStore` interface, GCS in production

`api/src/openad/services/media_store.py` (this step) defines a `MediaStore` Protocol with
`local` (unchanged disk cache — the default, and still what a single-host Compose deployment
uses) and `gcs` (`OPENAD_MEDIA_BACKEND=gcs`) implementations. In production, a single private,
uniform-bucket-level-access bucket `openad-media-<project>-<env>` (bucket names are global, so
per-project; docs/deploy-gcp.md §4) holds verified creative bytes; the
indexer's service account gets `roles/storage.objectUser` **scoped to that one bucket** (read +
write + overwrite, no bucket-level admin) — plain `objectCreator` cannot overwrite an existing
object, and the indexer legitimately re-writes the same `{creative_id}.bin` key on a replay
(reorg re-verification, or the scheduled re-check in `OPENAD_VERIFY_INTERVAL_SECONDS`); the
api's service account gets `roles/storage.objectViewer` (read-only) on the same bucket.
`GcsMediaStore.put` writes with no generation precondition specifically so that overwrite
succeeds rather than erroring. `cached_path` stores either an absolute local path or a
`gs://bucket/prefix/key` ref, and reads dispatch on the ref's scheme — so a database that
already holds local refs keeps reading after the backend flips (there is no migration step for
existing rows). Both storage backends' `get` reject a ref that does not match the *configured*
bucket/prefix (GCS) or does not resolve inside the configured cache root (local), logging and
returning "not cached" instead of ever reading outside the configured store — defense in depth
against a malformed or foreign `cached_path` row, even though every row we write ourselves is
already well-formed. Nothing about what `GET /v1/serve/{id}` or `GET /v1/serve/{id}/media`
return changes: serve still only ever reads bytes the indexer already verified and stored
itself, never an advertiser URL.

### Everything else

- Artifact Registry holds the `api` (also used, with different `CMD`s, for `indexer`,
  `settler` and `openad-migrate`) and `web` images. The `api` image carries
  `contracts/deployments` at `/app/contracts/deployments` and sets `OPENAD_DEPLOYMENTS_DIR` to
  that absolute path (`REPO_ROOT` resolves to `/` inside the image), so `indexer` and `settler`
  can `load_deployment` without the compose-only `/deployments` bind mount.
- Secret Manager holds `OPENAD_DATABASE_URL`, `OPENAD_SETTLER_KEY`, `OPENAD_SESSION_SECRET`,
  `OPENAD_CLICK_HMAC_SECRET`, and the Cloud SQL password. Every other `OPENAD_*` / `VITE_*`
  variable in `.env.example` is a plain Cloud Run env var.
- CI/CD is GitHub Actions with Workload Identity Federation to a deploy service account — no
  downloaded JSON service-account keys anywhere, in CI or on disk (step 27+28 wires the actual
  workflow job; it stays no-op without GCP secrets configured, and it never broadcasts to Base
  mainnet).
- Two environments: `staging` (Base Sepolia, `contracts/deployments/84532.json`) and `prod`
  (Base mainnet, `8453.json`), each its own GCP project or at minimum its own Cloud SQL
  instance, bucket and secrets. Promotion to `prod` is a manual approval step, matching
  `docs/deploy-mainnet.md`'s "do not broadcast until an explicit request" posture extended to
  deploys.
- A global load balancer may front `openad-api`. If it does, it fronts every api path on the
  `API_URL` host and nothing reaches the api around it (`docs/deploy-gcp.md` § 9 and § 11):
  click and media URLs share `OPENAD_PUBLIC_URL`, and the click burst rule's key needs every
  request to pass the same proxies. Cloud CDN on it caches `/v1/serve/*/media` only (verified
  bytes, `Cache-Control: public`, read-heavy), never `/v1/serve/{slot_id}`: a campaign
  response carries a one-time click token and is `private, no-store`, and every serve is an
  impression (ARCHITECTURE §3.4).

## Alternatives considered

- **GKE** — right shape (long-running workers, fine-grained network policy) but is a cluster to
  operate for four small processes with no need for custom scheduling, autoscaling groups, or
  a service mesh. Rejected as disproportionate for this repo's size.
- **App Engine** — Standard doesn't run arbitrary long-lived background workers well (the
  indexer's poll loop and the settler's poll loop are exactly that); Flexible is closer to
  Cloud Run's model with less control over min-instances and no free-tier no-ingress worker
  pattern. Rejected in favor of Cloud Run, which is a strict improvement here.
- **Cloud Functions** — request/response or event-triggered, not a fit for a process that must
  hold an open poll loop against `eth_getLogs` and a database cursor. Rejected.
- **Cloudflare-only (Workers + R2 + D1)** — would mean rewriting the API off SQLAlchemy/asyncpg
  and the indexer off `web3.py`/`httpx`, a rewrite this ADR is not proposing. Rejected; nothing
  stops adding Cloudflare in front of Cloud Run later purely as a CDN for `/v1/serve/*/media`
  only, never `/v1/serve/{slot_id}` itself.
- **Shared-disk single VM (all four processes on one host)** — sidesteps the media-cache problem
  entirely (this is exactly today's Docker Compose topology) but gives up independent scaling,
  independent deploys, and a managed database. Rejected as the production target; it remains
  the correct model for local dev and is unaffected by this ADR (`media_backend` defaults to
  `local`).

## Consequences

- **Easier:** `api` can scale past one instance without breaking the media cache; `indexer` and
  `settler` are isolated no-ingress services that cannot be reached from the internet even by
  misconfiguration of the api's own routes; secrets are scoped per service account instead of
  living in one shared `.env`.
- **Harder:** one more moving part (a bucket, plus IAM bindings) to provision per environment;
  `read_cached`/`MediaStore` now has two code paths to keep in sync with any future third
  backend; a Cloud Run Job adds one more deploy-pipeline step versus "the container migrates
  itself."
- **Must be revisited:** the CDN in front of serve media (`/v1/serve/*/media` only) is sized
  as "when serve traffic justifies it," not day one — revisit once there's real publisher
  traffic. The `staging`/`prod`
  project split (one project each vs. one project with two Cloud SQL instances) should be
  revisited once billing/ownership boundaries are clearer; this ADR does not mandate either.
- Step 27+28 implements the `api/Dockerfile` `CMD` change, the `web/Dockerfile`, the Cloud Run
  service YAMLs, `infra/gcp/cloudbuild.yaml`, `scripts/deploy-gcp.sh`, and the CI deploy job
  gated on GCP secrets. The actual `gcloud` deploy is user-run (step 29); this environment has
  no `gcloud` CLI or GCP credentials.

## References

- `docs/deploy-gcp.md` — copy-paste runbook for the topology in this ADR.
- `docs/ARCHITECTURE.md` §3.5 (media cache), §3.9 (settler process), §7 (environments table).
- `AGENTS.md` non-custodial invariants; ADR-0014 (settler key scope, `CampaignVault`).
- `docs/deploy-sepolia.md`, `docs/deploy-mainnet.md` — the contract-side deploy runbooks this
  ADR's `staging`/`prod` environments line up with.

## Amendment (step 14+15, ROADMAP 6.3): the web origin hosts the versioned embed script

`openad-web` also serves the versioned embed script at `embed/open-ad.v1.js`: `web/vite.config.ts`'s
`embedScriptCopy` plugin copies `embed/dist/open-ad.js` there on every build (normal and demo), and
`web/nginx/default.conf.template` caches `/embed/*` with `Cache-Control: public, max-age=86400`. A
publisher's `<script type="module" src="…">` snippet (`lib/embedSnippet.ts`) therefore points at
the same origin as the app by default, with no separate hosting step. A CDN or an `@openad/embed`
npm publish is a later option (`docs/business/*` backlog), not required to ship.

## Amendment (step 38, ROADMAP 6.9): connection budget, per-service scale caps, same-site domain

Three gaps found in a pre-launch capacity review, closed without changing the topology above:

- **Unbounded `maxScale`.** `api.yaml` set `minScale: "1"` with no `maxScale`, so Cloud Run's own
  default maximum instance count applies (commonly documented as 100; confirm against current
  Cloud Run docs before relying on it). At that scale, `api`'s connections alone could exceed
  `db-custom-1-3840`'s `max_connections` many times over, since every instance opens its own
  connection pool. `api.yaml` now sets `maxScale: "4"`; `web.yaml` and `web-demo.yaml` (no
  database, static sites) each get `maxScale: "10"` for cost control only. `docs/deploy-gcp.md`
  "Connection budget" has the worked numbers and cites the Cloud SQL docs page for this tier's
  default `max_connections`. In steady state the budget (31 connections, plus Postgres's 3
  superuser-reserved slots) fits even under a conservative 50-connection floor. A rolling deploy
  briefly runs old and new revisions side by side, and that worst case is ≈64, which does not
  fit under 50. So the runbook requires `max_connections` ≥ 100: §3 sets it explicitly with
  `--database-flags=max_connections=100` when creating the instance, and it is verified with
  `gcloud sql instances describe` (no database connection needed) before deploying.
- **Unbounded per-process pools.** `Database(url)` took no settings and always got
  `create_async_engine`'s own defaults (pool 5 + overflow 10) regardless of how many instances
  were running it. `Database` now takes an optional `settings` argument (a `PoolSettings`
  protocol satisfied by both `openad.config.Settings` and `openad.settler.settings.SettlerSettings`)
  and reads `OPENAD_DB_POOL_SIZE` / `OPENAD_DB_MAX_OVERFLOW` / `OPENAD_DB_POOL_TIMEOUT` /
  `OPENAD_DB_POOL_RECYCLE`, plus `pool_pre_ping=True` for any non-SQLite URL (a recycled or
  dropped Cloud SQL connection fails fast and is replaced, instead of erroring the next request).
  SQLite (unit tests, `db/bootstrap.py`) is unaffected — it always uses `StaticPool`. Each
  Cloud Run service now sets its own budget-sized `OPENAD_DB_POOL_SIZE`/`OPENAD_DB_MAX_OVERFLOW`:
  `api` 4/2 (× `maxScale: "4"`), `indexer` and `settler` 2/1 each (one pinned instance). The
  `openad-migrate` job sets neither: `alembic/env.py` builds its own engine directly
  (`async_engine_from_config`), not `openad.db.session.Database`, so those settings would be
  inert there — it always opens exactly one connection, which is what the budget counts it as.
- **Cross-site auth cookie.** The session cookie is `SameSite=Lax`. Cloud Run's default
  `*.run.app` URLs are each their own registrable domain (`run.app` is on the Public Suffix
  List — inferred; confirm against `publicsuffix.org` before relying on it), so an `api` and a
  `web` left on their default URLs are never same-site and sign-in silently fails. This ADR's
  topology already assumed a domain mapping (§9, the runbook's "9. Domain mapping" section);
  that section is now **required**, not optional, states the failure mode explicitly, and
  documents the alternative (a global external Application Load Balancer with serverless NEGs)
  for regions without domain mappings. `scripts/deploy-gcp.sh --only stack|all` refuses to
  deploy when `API_URL`/`WEB_URL` don't look same-site, unless `--allow-cross-site-auth` is
  passed.

None of this changes the Decision, the services, or the media-cache design above; it sizes and
guards what was already specified. `docs/threat-model.md` T17 ("Media fetch SSRF via redirect")
is a related fix from the same step, in `api/src/openad/services/media.py`'s `fetch_media`, not
in this ADR's scope.

## Amendment (2026-09-25, slice-review fixes)

A slice review of the launch state found the topology above described but not yet wired end to
end. Closed without changing the Decision:

- **VPC egress.** Cloud SQL's `--no-assign-ip` instance has no public IP, but nothing gave
  Cloud Run a route to it: `api`, `indexer`, `settler` and the `openad-migrate` job now each
  carry Direct VPC egress (`run.googleapis.com/network-interfaces` +
  `run.googleapis.com/vpc-access-egress: private-ranges-only`) against `VPC_NETWORK`/
  `VPC_SUBNET` (`scripts/deploy-gcp.sh`, default `default`/`default`). `private-ranges-only`
  keeps RPC/GCS traffic on Cloud Run's normal internet egress, so no Cloud NAT is needed.
- **Cloud SQL edition.** New Postgres 16 instances default to Enterprise Plus, which doesn't
  offer the `db-custom-*` tier this ADR uses, so §3's `gcloud sql instances create` now passes
  `--edition=ENTERPRISE` (both inferred; verify before deploy).
- **Invoker binding.** `gcloud run services replace` applies no IAM by itself, so
  `openad-api`/`openad-web`/`openad-web-demo` were reachable only by their deployer's own
  identity, not the public. `scripts/deploy-gcp.sh` now runs
  `gcloud run services add-iam-policy-binding <svc> --member=allUsers --role=roles/run.invoker`
  after each of those three (never the indexer or the settler). Where an org policy
  (domain-restricted sharing) refuses `allUsers`, the opt-in `PUBLIC_INVOKER=iam-disabled`
  replaces the binding: the script writes `run.googleapis.com/invoker-iam-disabled: "true"` into
  each of the three rendered specs before its replace, then runs
  `gcloud run services update <svc> --no-invoker-iam-check` (inferred; verify before deploy).
- **The api's ingress and its smoke check.** `api.yaml`'s ingress annotation is rendered from
  `API_INGRESS`: `all` by default, or `internal-and-cloud-load-balancing` behind a load balancer
  (docs/deploy-gcp.md §11, "Click integrity"). The script's post-deploy smoke check fetches
  `/v1/health` at the service's own `*.run.app` URL while it's `all`, so a first deploy works
  before any domain is mapped, and at `API_URL` (the load balancer's host) otherwise, since
  `*.run.app` then refuses outside requests (inferred; verify before deploy). Set
  `API_INGRESS=internal-and-cloud-load-balancing` only once the load balancer already serves
  `API_URL`.
- **WIF deployer roles.** §10's roles list (`run.admin`, `iam.serviceAccountUser`,
  `artifactregistry.writer`) could not itself run `gcloud builds submit`: it now also gets
  `cloudbuild.builds.editor`, `serviceusage.serviceUsageConsumer`, `logging.viewer`, and
  `storage.admin` scoped to a dedicated `gs://<PROJECT_ID>-openad-builds` source-upload bucket
  (named by `BUILD_STAGING_BUCKET`, §2), pre-created once, rather than the default
  `_cloudbuild` one (inferred; verify before deploy). The service account that *runs* the
  build is a separate identity from the deployer SA these roles belong to — often the Compute
  Engine default service account on a fresh project, which gets no roles automatically — and
  needs `roles/cloudbuild.builds.builder` to run at all plus `artifactregistry.writer` to push
  the built images (inferred; verify before deploy).
- **Placeholder guard.** `API_URL`/`WEB_URL` defaulted to `example.com` hosts even for a real
  `stack`/`all` deploy, and those defaults reached `OPENAD_PUBLIC_URL`/`OPENAD_CORS_ORIGINS`
  and the web build's `VITE_API_URL`. `scripts/deploy-gcp.sh --only stack|all` now refuses
  outright when either is unset or empty, before any default is applied.

Also closed, smaller: the media bucket name is now per-project
(`openad-media-<project>-<env>`, since bucket names are global); the web app's CSP
`RPC_ORIGINS` defaults to the public chain RPC it actually uses and is reduced to a bare
origin, never to the api/indexer/settler's own (possibly provider-keyed) `RPC_URL`; and
`openad-web-demo` gets a domain mapping and a resolved `WEB_DEMO_URL` for its post-deploy smoke
check instead of an undocumented placeholder host.
