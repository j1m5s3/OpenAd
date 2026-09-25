#!/usr/bin/env bash
# Renders infra/gcp/*.yaml and deploys OpenAd to Cloud Run (ADR-0017, docs/deploy-gcp.md).
# This script only ever talks to `staging` fully; `prod` requires an explicit human flag and
# is refused outright in CI. It never broadcasts to any chain — it builds/pushes images and
# applies Cloud Run specs only.
#
# Usage: scripts/deploy-gcp.sh --env staging|prod [--only demo|stack|all] --project <id>
#                               --region <region> [--tag <tag>] [--dry-run]
#                               [--i-understand-this-is-mainnet] [--allow-cross-site-auth]
#                               [-h|--help]

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib.sh
source "${SCRIPT_DIR}/lib.sh"

usage() {
    cat <<'EOF'
Usage: scripts/deploy-gcp.sh --env staging|prod --project <id> --region <region>
                              [--only demo|stack|all] [--tag <tag>] [--dry-run]
                              [--i-understand-this-is-mainnet] [--allow-cross-site-auth]
                              [-h|--help]

Renders infra/gcp/*.yaml with envsubst and deploys via `gcloud builds submit` /
`gcloud run jobs replace` + `execute --wait` / `gcloud run services replace`. Never edits
infra/gcp/*.yaml in place; rendering happens into a throwaway temp directory. Never prints a
secret value (secrets are referenced by name via secretKeyRef, not rendered here).

  --env <staging|prod>   Required. Target environment.
  --only <demo|stack|all>
                         demo (default): build + deploy only the static demo site
                         (openad-web-demo). stack: build + deploy api/indexer/settler and run
                         the migrate job (requires contracts/deployments/<chainId>.json for
                         this env's chain). all: stack + demo + the real web site (openad-web).
  --project <id>         GCP project id.
  --region <region>      Cloud Run / Artifact Registry region (e.g. us-central1).
  --tag <tag>            Image tag to deploy. Default: the current short git SHA.
  --dry-run              Print every command instead of running it. Guards below still apply.
  --i-understand-this-is-mainnet
                         Required in addition to --env prod. `prod` is Base mainnet
                         (docs/deploy-mainnet.md's posture extended to deploys).
  --allow-cross-site-auth
                         Skip the same-site guard below (docs/deploy-gcp.md §9). Only pass this
                         if you accept that SameSite=Lax sign-in may not work, e.g. deploying
                         --only stack before any web build points at it.
  -h, --help             Show this help and exit.

Guards (checked even under --dry-run):
  - --only stack (or all) refuses without contracts/deployments/<chainId>.json for this env's
    chain (84532 staging, 8453 prod) already committed.
  - --env prod refuses without --i-understand-this-is-mainnet, and refuses outright when
    CI=true, regardless of flags.
  - --only stack (or all) refuses when API_URL's and WEB_URL's hosts don't look same-site
    (both default *.run.app hosts, or their last two DNS labels differ — a heuristic, not real
    Public Suffix List logic), unless --allow-cross-site-auth is passed. See docs/deploy-gcp.md
    §9: the session cookie is SameSite=Lax, so a cross-site api/web split breaks sign-in.
  - `gcloud` and `envsubst` must be on PATH unless --dry-run.
EOF
}

# host_of <url> — strips scheme, userinfo, path and port, and lowercases what's left:
# "https://User@API.example.com:8443/x" -> "api.example.com". Lowercasing and stripping
# userinfo matter because the comparisons below are plain string equality, not real host
# parsing. Lowercases with `tr`, not bash 4's case-modifying parameter expansion: macOS's
# /bin/bash 3.2 is supported (see stack-docker.sh), and there that aborts "bad substitution".
host_of() {
    local u="${1#*://}"
    u="${u%%/*}"
    u="${u##*@}"
    u="${u%%:*}"
    u="$(printf '%s' "$u" | tr '[:upper:]' '[:lower:]')"
    printf '%s' "$u"
}

# is_run_app_host <host> — 0 if host is (or ends in) a Cloud Run default *.run.app hostname.
is_run_app_host() {
    case "$1" in
        *.run.app | run.app) return 0 ;;
        *) return 1 ;;
    esac
}

# last_two_labels <host> — a naive, non-PSL-aware registrable-domain guess: the last two
# dot-separated labels (e.g. "api.staging.example.com" -> "example.com"). Documented as a
# heuristic in docs/deploy-gcp.md §9; real registrable-domain logic needs the Public Suffix
# List, which is why *.run.app is special-cased separately in the caller instead of relying on
# this alone (two different *.run.app hosts can share their last two labels, e.g. "a.run.app",
# while still being different sites). *.run.app is the only public suffix special-cased this
# way: any OTHER multi-part public suffix (e.g. "co.uk", "web.app") has the same false-accept
# failure mode and is NOT caught here — "api.foo.co.uk" and "app.bar.co.uk" both reduce to
# "co.uk" and would wrongly compare equal. See docs/deploy-gcp.md §9 for the full explanation;
# domains on a multi-label public suffix should be checked by hand, not trusted to this guard.
last_two_labels() {
    printf '%s' "$1" | awk -F. '{ if (NF >= 2) print $(NF-1)"."$NF; else print $0 }'
}

ENV=""
ONLY="demo"
PROJECT=""
REGION=""
TAG=""
UNDERSTAND_MAINNET=0
ALLOW_CROSS_SITE_AUTH=0

while [ "$#" -gt 0 ]; do
    case "$1" in
        --env)
            ENV="${2:-}"
            shift 2
            ;;
        --only)
            ONLY="${2:-}"
            shift 2
            ;;
        --project)
            PROJECT="${2:-}"
            shift 2
            ;;
        --region)
            REGION="${2:-}"
            shift 2
            ;;
        --tag)
            TAG="${2:-}"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=1
            shift
            ;;
        --i-understand-this-is-mainnet)
            UNDERSTAND_MAINNET=1
            shift
            ;;
        --allow-cross-site-auth)
            ALLOW_CROSS_SITE_AUTH=1
            shift
            ;;
        -h | --help)
            usage
            exit 0
            ;;
        *)
            echo "Unknown argument: $1" >&2
            usage >&2
            exit 1
            ;;
    esac
done

case "$ENV" in
    staging | prod) ;;
    *)
        echo "--env is required and must be 'staging' or 'prod' (got: '${ENV}')." >&2
        exit 1
        ;;
esac

case "$ONLY" in
    demo | stack | all) ;;
    *)
        echo "--only must be 'demo', 'stack' or 'all' (got: '${ONLY}')." >&2
        exit 1
        ;;
esac

if [ -z "$PROJECT" ]; then
    echo "--project is required." >&2
    exit 1
fi
if [ -z "$REGION" ]; then
    echo "--region is required." >&2
    exit 1
fi

# prod guard: never in CI, and only with the explicit flag. Checked before anything else runs,
# and before --dry-run short-circuits any other guard.
if [ "$ENV" = "prod" ]; then
    if [ "${CI:-}" = "true" ]; then
        echo "Refusing --env prod: CI=true. Mainnet deploys are always run by a human," \
            "never CI (see docs/deploy-mainnet.md's posture, extended to deploys)." >&2
        exit 1
    fi
    if [ "$UNDERSTAND_MAINNET" != "1" ]; then
        echo "Refusing --env prod without --i-understand-this-is-mainnet." >&2
        exit 1
    fi
fi

if [ "$ENV" = "staging" ]; then
    CHAIN_ID="84532"
else
    CHAIN_ID="8453"
fi

# stack (and all) deploy api/indexer/settler against a real chain: refuse without that chain's
# deployment artifact already committed. The demo site needs no contracts deployment at all.
if [ "$ONLY" = "stack" ] || [ "$ONLY" = "all" ]; then
    DEPLOYMENTS_FILE="${REPO_ROOT}/contracts/deployments/${CHAIN_ID}.json"
    if [ ! -f "$DEPLOYMENTS_FILE" ]; then
        echo "Refusing --only ${ONLY} for --env ${ENV}: ${DEPLOYMENTS_FILE} is missing." >&2
        echo "Deploy the contracts to chain ${CHAIN_ID} first (docs/deploy-sepolia.md /" >&2
        echo "docs/deploy-mainnet.md); GCP deploy never broadcasts contracts itself." >&2
        exit 1
    fi
fi

if [ "$DRY_RUN" != "1" ]; then
    require_cmd gcloud envsubst curl
fi

cd "$REPO_ROOT"

if [ -z "$TAG" ]; then
    TAG="$(git rev-parse --short HEAD)"
fi

API_URL="${API_URL:-https://api.${ENV}.example.com}"
WEB_URL="${WEB_URL:-https://${ENV}.example.com}"
WEB_DEMO_URL="${WEB_DEMO_URL:-https://demo.${ENV}.example.com}"
RPC_URL="${RPC_URL:-$([ "$ENV" = "staging" ] && echo https://sepolia.base.org || echo https://mainnet.base.org)}"
RPC_ORIGINS="${RPC_ORIGINS:-$RPC_URL}"
API_ORIGIN="${API_ORIGIN:-$API_URL}"

# Same-site guard (docs/deploy-gcp.md §9): the session cookie is SameSite=Lax, so the web app
# and the api must share a registrable domain or sign-in silently breaks. Only relevant once the
# api (stack/all) is in the picture — the demo site has no sign-in.
if [ "$ONLY" = "stack" ] || [ "$ONLY" = "all" ]; then
    if [ "$ALLOW_CROSS_SITE_AUTH" != "1" ]; then
        API_HOST="$(host_of "$API_URL")"
        WEB_HOST="$(host_of "$WEB_URL")"
        CROSS_SITE=0
        if is_run_app_host "$API_HOST" && is_run_app_host "$WEB_HOST"; then
            # Both on Cloud Run's default domain: never same-site, even if their last two
            # labels happen to match (e.g. two different "*.a.run.app" hosts).
            CROSS_SITE=1
        elif [ "$(last_two_labels "$API_HOST")" != "$(last_two_labels "$WEB_HOST")" ]; then
            CROSS_SITE=1
        fi
        if [ "$CROSS_SITE" = "1" ]; then
            echo "Refusing: api (${API_HOST}) and web (${WEB_HOST}) do not look like the same" >&2
            echo "registrable domain. The session cookie is SameSite=Lax (docs/deploy-gcp.md" >&2
            echo "§9), so sign-in silently breaks unless api and web share a domain. Set" >&2
            echo "API_URL/WEB_URL (or map both under one domain first), or pass" >&2
            echo "--allow-cross-site-auth if you accept sign-in may not work." >&2
            exit 1
        fi
    fi
fi

echo "Deploying OpenAd: env=${ENV} only=${ONLY} project=${PROJECT} region=${REGION} tag=${TAG}"

step "Cloud Build: api/web/web-demo images" run gcloud builds submit \
    --project "$PROJECT" \
    --config infra/gcp/cloudbuild.yaml \
    --substitutions="_REGION=${REGION},_REPO=openad,_ENV=${ENV},_API_URL=${API_URL},_CHAIN_ID=${CHAIN_ID},_TAG=${TAG}"

# Render infra/gcp/*.yaml into a throwaway temp dir; the source files under infra/gcp/ are
# never modified. Skipped under --dry-run (nothing downstream reads the rendered files then).
RENDER_DIR="$(mktemp -d)"
cleanup() { rm -rf "$RENDER_DIR"; }
trap cleanup EXIT

render() {
    local src="$1" dest="$2"
    if [ "$DRY_RUN" = "1" ]; then
        printf '+ envsubst < %s > %s\n' "$src" "$dest"
        return 0
    fi
    PROJECT_ID="$PROJECT" REGION="$REGION" ENV="$ENV" IMAGE_TAG="$TAG" CHAIN_ID="$CHAIN_ID" \
        RPC_URL="$RPC_URL" API_URL="$API_URL" WEB_URL="$WEB_URL" API_ORIGIN="$API_ORIGIN" \
        RPC_ORIGINS="$RPC_ORIGINS" \
        envsubst <"$src" >"$dest"
}

if [ "$ONLY" = "stack" ] || [ "$ONLY" = "all" ]; then
    render infra/gcp/jobs/migrate.yaml "${RENDER_DIR}/migrate.yaml"
    step "Cloud Run Job: openad-migrate (replace)" run gcloud run jobs replace \
        "${RENDER_DIR}/migrate.yaml" --project "$PROJECT" --region "$REGION"
    step "Cloud Run Job: openad-migrate (execute --wait)" run gcloud run jobs execute \
        openad-migrate --project "$PROJECT" --region "$REGION" --wait

    for svc in api indexer settler; do
        render "infra/gcp/services/${svc}.yaml" "${RENDER_DIR}/${svc}.yaml"
        step "Cloud Run service: openad-${svc}" run gcloud run services replace \
            "${RENDER_DIR}/${svc}.yaml" --project "$PROJECT" --region "$REGION"
    done

    step "Smoke check: openad-api /v1/health" run curl --fail --silent --show-error \
        --retry 5 --retry-delay 3 --retry-connrefused "${API_URL}/v1/health"
fi

if [ "$ONLY" = "demo" ] || [ "$ONLY" = "all" ]; then
    render infra/gcp/services/web-demo.yaml "${RENDER_DIR}/web-demo.yaml"
    step "Cloud Run service: openad-web-demo" run gcloud run services replace \
        "${RENDER_DIR}/web-demo.yaml" --project "$PROJECT" --region "$REGION"
    step "Smoke check: openad-web-demo /healthz" run curl --fail --silent --show-error \
        --retry 5 --retry-delay 3 --retry-connrefused "${WEB_DEMO_URL}/healthz"
fi

if [ "$ONLY" = "all" ]; then
    render infra/gcp/services/web.yaml "${RENDER_DIR}/web.yaml"
    step "Cloud Run service: openad-web" run gcloud run services replace \
        "${RENDER_DIR}/web.yaml" --project "$PROJECT" --region "$REGION"
    step "Smoke check: openad-web /healthz" run curl --fail --silent --show-error \
        --retry 5 --retry-delay 3 --retry-connrefused "${WEB_URL}/healthz"
fi

echo ""
echo "Done: env=${ENV} only=${ONLY} tag=${TAG}"
