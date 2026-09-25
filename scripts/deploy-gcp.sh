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

Environment variables (all optional unless noted; an empty value counts as unset):
  API_URL, WEB_URL       Required for --only stack|all: this env's public api/web URLs. Never
                         defaulted from a placeholder for stack/all — see the guard below.
  WEB_DEMO_URL           The demo site's public URL, for its post-deploy smoke check. Unset
                         means "ask Cloud Run" (`gcloud run services describe` after deploying
                         openad-web-demo); --dry-run prints a placeholder instead.
  MEDIA_BUCKET           GCS bucket for verified creative bytes. Default:
                         openad-media-<PROJECT>-<ENV> (bucket names are global, so per-project).
  BUILD_STAGING_BUCKET   The bucket `gcloud builds submit` (docs/deploy-gcp.md §6) stages its
                         source upload in, instead of the default `<PROJECT>_cloudbuild` bucket.
                         Default: <PROJECT>-openad-builds. Pre-create it once (docs/deploy-gcp.md
                         §2) — this script never creates GCS buckets itself.
  VPC_NETWORK, VPC_SUBNET
                         The VPC network/subnet Direct VPC egress uses to reach Cloud SQL's
                         private IP. Default: "default" for both.
  RPC_URL                This env's Base RPC URL, used by api/indexer/settler only. Default:
                         the public Base Sepolia/mainnet RPC for --env.
  RPC_ORIGINS            Origin(s) the web app's CSP connect-src allows for chain RPC calls
                         (space-separated if more than one). Default: the same public RPC
                         origin as RPC_URL's default — never RPC_URL itself, which may carry a
                         provider key in its path and must never reach a public response header.
  WALLETCONNECT_PROJECT_ID
                         Fed to the web build (Cloud Build substitution). Unset or empty means
                         injected (browser) wallets only, with no WalletConnect option.
  GUIDE_URL              Fed to the web build: the header's guide link. Unset or empty means
                         the hosted guide, https://pam-2.gitbook.io/open-ad-docs, so a build
                         from this script always shows the link.
  DEMO_URL               Fed to the web build: the "Try the demo" link. Unset or empty hides it.
  PUBLIC_INVOKER <allusers|iam-disabled>
                         How api/web/web-demo become publicly reachable (never indexer/settler).
                         Default: allusers (`gcloud run services add-iam-policy-binding ...
                         --member=allUsers --role=roles/run.invoker`). iam-disabled is for an
                         organization whose domain restricted sharing policy forbids an allUsers
                         binding outright: it writes run.googleapis.com/invoker-iam-disabled:
                         "true" into each rendered copy before its `services replace` (so the
                         replace itself doesn't turn the IAM check back on), then runs
                         `gcloud run services update <svc> --no-invoker-iam-check`
                         (inferred; verify before deploy).
  API_INGRESS <all|internal-and-cloud-load-balancing>
                         openad-api's ingress, rendered into api.yaml's run.googleapis.com/ingress
                         annotation. Default: all. Behind a load balancer, set
                         internal-and-cloud-load-balancing so nothing reaches the api around it,
                         and make API_URL the load balancer's host (docs/deploy-gcp.md §11,
                         "Click integrity"; inferred; verify before deploy).

Smoke checks: openad-api's /v1/health is fetched at its own *.run.app URL (status.url, from
`gcloud run services describe`) while API_INGRESS is all, so a first run works before
docs/deploy-gcp.md §9 maps any domain. With internal-and-cloud-load-balancing, *.run.app refuses
outside requests (inferred; verify before deploy), so the check uses API_URL instead.
openad-web's /healthz is fetched at its *.run.app URL (web.yaml's ingress is always all), and
openad-web-demo's at WEB_DEMO_URL when set, else at its *.run.app URL.

Guards (checked even under --dry-run, before the first gcloud command):
  - --only stack (or all) refuses without contracts/deployments/<chainId>.json for this env's
    chain (84532 staging, 8453 prod) already committed.
  - --env prod refuses without --i-understand-this-is-mainnet, and refuses outright when
    CI=true, regardless of flags.
  - --only stack (or all) refuses when API_URL or WEB_URL is unset or empty. --only demo needs
    neither.
  - --only all refuses an RPC_ORIGINS entry, or an API_URL, that doesn't reduce to a bare
    scheme://host[:port] origin for web.yaml's CSP: no http/https/ws/wss scheme, an "@" anywhere
    (userinfo, even with an unencoded "/", "?" or "#" in it), or a host[:port] that isn't a
    hostname with an optional numeric port. The refusal never prints the value.
  - --only stack (or all) refuses when API_URL's and WEB_URL's hosts don't look same-site
    (both default *.run.app hosts, or their last two DNS labels differ — a heuristic, not real
    Public Suffix List logic), unless --allow-cross-site-auth is passed. See docs/deploy-gcp.md
    §9: the session cookie is SameSite=Lax, so a cross-site api/web split breaks sign-in.
  - PUBLIC_INVOKER must be "allusers" or "iam-disabled" when set.
  - API_INGRESS must be "all" or "internal-and-cloud-load-balancing" when set.
  - WALLETCONNECT_PROJECT_ID, GUIDE_URL and DEMO_URL must not contain a comma: gcloud splits
    --substitutions on commas.
  - `gcloud`, `envsubst` and `curl` must be on PATH unless --dry-run.
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

# origin_of <url> <label> — reduces a URL to just its origin ("scheme://host[:port]"), the form
# a CSP header entry must take: never a path, query string, fragment or credential. The
# authority ends at the first "/", "?" or "#", so a query or fragment with no path before it
# ("https://rpc.example?apikey=...") is dropped too. Refuses (prints to stderr, returns 1):
#   - a URL without an http/https/ws/wss scheme up front, so a bare host ("rpc.example") isn't
#     misread as both its own scheme and host;
#   - a URL with an "@" anywhere. Userinfo is the obvious case, but an unencoded "/", "?" or
#     "#" inside a password ends the authority early: "https://user:pa/ss@rpc.example" would
#     otherwise cut to "https://user:pa", and "https://user:12/ss@rpc.example" to host "user"
#     on port 12 — part of a credential either way;
#   - a host[:port] that isn't a hostname (dot-separated letters, digits and "-") with an
#     optional numeric port, e.g. "rpc.example:notaport".
# No message prints any part of the value, which may be the very key- or credential-bearing
# string being refused: only <label> (e.g. "RPC_ORIGINS entry 2"), so the operator can find it.
origin_of() {
    local u="$1" label="$2"
    local hostport_re='^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*(:[0-9]{1,5})?$'
    case "$u" in
        http://* | https://* | ws://* | wss://*) ;;
        *)
            echo "origin_of: refusing a URL with no http/https/ws/wss scheme (${label}; value not printed)" >&2
            return 1
            ;;
    esac
    case "$u" in
        *@*)
            echo "origin_of: refusing a URL with userinfo or another \"@\" (${label}; value not printed)" >&2
            return 1
            ;;
    esac
    local scheme="${u%%://*}"
    local rest="${u#*://}"
    local hostport="${rest%%[/?#]*}"
    if ! [[ "$hostport" =~ $hostport_re ]]; then
        echo "origin_of: refusing a URL whose host[:port] is not a hostname with an optional numeric port (${label}; value not printed)" >&2
        return 1
    fi
    printf '%s://%s' "$scheme" "$hostport"
}

# normalize_origins <space-separated urls> — reduces each entry of a caller-set RPC_ORIGINS
# (which may list more than one chain RPC) through origin_of and rejoins them with one space.
# Split with `read -a`, not an unquoted expansion, so an entry is never glob-expanded first.
normalize_origins() {
    local out="" u reduced i=0
    local -a urls=()
    read -r -a urls <<<"$1"
    if [ "${#urls[@]}" -eq 0 ]; then
        echo "normalize_origins: RPC_ORIGINS has no entries" >&2
        return 1
    fi
    for u in "${urls[@]}"; do
        i=$((i + 1))
        reduced="$(origin_of "$u" "RPC_ORIGINS entry ${i}")" || return 1
        out="${out:+$out }${reduced}"
    done
    printf '%s' "$out"
}

# resolve_service_url <cloud-run-service> — the service's live URL (its Cloud Run-assigned
# *.run.app host, status.url, via `gcloud run services describe`), to smoke-check right after
# deploying it. Not API_URL/WEB_URL themselves while the service's ingress is `all`: on a fresh
# project those may already name a custom domain that docs/deploy-gcp.md §9 only maps (and makes
# reachable) *after* the service exists (see api_smoke_url below for the other case). --dry-run
# has nothing real to ask, so it prints the same `describe` command for visibility and returns a
# placeholder instead. Every diagnostic line here goes to stderr, since callers do
# `VAR="$(resolve_service_url svc)"` and a stdout line would otherwise land inside "$VAR".
resolve_service_url() {
    local svc="$1"
    if [ "$DRY_RUN" = "1" ]; then
        run gcloud run services describe "$svc" \
            --project "$PROJECT" --region "$REGION" --format='value(status.url)' >&2
        printf '<%s-url>' "$svc"
        return 0
    fi
    echo "" >&2
    echo "==> Cloud Run service: ${svc} (reading its assigned URL)" >&2
    gcloud run services describe "$svc" \
        --project "$PROJECT" --region "$REGION" --format='value(status.url)'
}

# api_smoke_url — the base URL to smoke-check openad-api at, picked from API_INGRESS, the value
# api.yaml's run.googleapis.com/ingress annotation is rendered from. While it's `all`: the
# service's own *.run.app URL (resolve_service_url above). internal-and-cloud-load-balancing
# (behind a load balancer, docs/deploy-gcp.md §11, "Click integrity") refuses outside requests
# to *.run.app (inferred; verify before deploy), so there API_URL, the load balancer's host, is
# the only URL that answers.
api_smoke_url() {
    if [ "$API_INGRESS" = "all" ]; then
        resolve_service_url openad-api
        return
    fi
    echo "" >&2
    echo "==> openad-api: API_INGRESS=${API_INGRESS} refuses outside requests to *.run.app," \
        "so the smoke check uses API_URL (the load balancer's host)" >&2
    printf '%s' "$API_URL"
}

# annotate_invoker_iam_disabled <rendered-yaml> — for PUBLIC_INVOKER=iam-disabled: writes
# run.googleapis.com/invoker-iam-disabled: "true" into the rendered copy's Service-level
# metadata.annotations (never the source manifest), replacing any copy already there. `services
# replace` applies the whole spec, so a spec without it would turn the invoker IAM check back on,
# and public traffic would 403 until `services update --no-invoker-iam-check` ran (inferred;
# verify before deploy). Refuses a manifest with no Service-level `  annotations:` block.
annotate_invoker_iam_disabled() {
    local f="$1"
    if ! awk '
        /^metadata:/ { m = 1; print; next }
        /^[^ \t#]/ { m = 0 }
        m && /^[ \t]+run\.googleapis\.com\/invoker-iam-disabled:/ { next }
        { print }
        m && !done && /^  annotations:[ \t]*$/ {
            print "    run.googleapis.com/invoker-iam-disabled: \"true\""
            done = 1
        }
        END { if (!done) exit 1 }' "$f" >"${f}.tmp"; then
        rm -f "${f}.tmp"
        echo "annotate_invoker_iam_disabled: no Service-level metadata.annotations block in ${f}" >&2
        return 1
    fi
    mv "${f}.tmp" "$f"
}

# bind_public_invoker <cloud-run-service> — makes <service> publicly reachable. Default
# (PUBLIC_INVOKER=allusers) binds roles/run.invoker to allUsers, same as `services replace`
# always required (it applies no IAM itself). Some organizations' "domain restricted sharing"
# org policy forbids an allUsers IAM binding outright; PUBLIC_INVOKER=iam-disabled opts into
# `gcloud run services update --no-invoker-iam-check` instead, which serves the same public
# traffic with no IAM binding at all (inferred; verify before deploy — confirm
# --no-invoker-iam-check is accepted and has no other side effects for this org/project first).
# With iam-disabled, render_public has already put the matching annotation into the spec the
# replace applied, so this update is an idempotent confirmation, not the only thing that turns
# the check off. Never called for indexer or settler, which stay --ingress=internal with no
# invoker binding.
bind_public_invoker() {
    local svc="$1"
    case "$PUBLIC_INVOKER" in
        allusers)
            step "IAM: allow public access to ${svc}" run gcloud run services add-iam-policy-binding \
                "$svc" --member=allUsers --role=roles/run.invoker \
                --project "$PROJECT" --region "$REGION"
            ;;
        iam-disabled)
            step "IAM: allow public access to ${svc} (--no-invoker-iam-check)" run \
                gcloud run services update "$svc" --no-invoker-iam-check \
                --project "$PROJECT" --region "$REGION"
            ;;
    esac
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

PUBLIC_INVOKER="${PUBLIC_INVOKER:-allusers}"
case "$PUBLIC_INVOKER" in
    allusers | iam-disabled) ;;
    *)
        echo "PUBLIC_INVOKER must be 'allusers' or 'iam-disabled' (got: '${PUBLIC_INVOKER}')." >&2
        exit 1
        ;;
esac

# openad-api's ingress, rendered into api.yaml's run.googleapis.com/ingress annotation. The api
# is public either way: `all` (its *.run.app URL and any domain mapping answer), or
# internal-and-cloud-load-balancing (only a load balancer in front of it does; docs/deploy-gcp.md
# §11, "Click integrity"). `internal` would take it off the internet, so it's refused here.
API_INGRESS="${API_INGRESS:-all}"
case "$API_INGRESS" in
    all | internal-and-cloud-load-balancing) ;;
    *)
        echo "API_INGRESS must be 'all' or 'internal-and-cloud-load-balancing' (got: '${API_INGRESS}')." >&2
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

# stack/all deploy real services behind API_URL/WEB_URL: refuse rather than silently pointing
# them at the example.com placeholder below when the caller left either unset (or set empty).
# --only demo needs neither. Checked by string, not by pattern-matching "example.com" — the
# same host check-sh.sh's own accept-case tests legitimately use.
if { [ "$ONLY" = "stack" ] || [ "$ONLY" = "all" ]; } && { [ -z "${API_URL:-}" ] || [ -z "${WEB_URL:-}" ]; }; then
    echo "Refusing --only ${ONLY}: API_URL and WEB_URL must both be set to this env's real" >&2
    echo "public URLs. Only --only demo needs neither." >&2
    exit 1
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
# Unset means "ask Cloud Run" once openad-web-demo is deployed, below; --dry-run prints a
# placeholder instead, since there is nothing running yet to ask.
WEB_DEMO_URL="${WEB_DEMO_URL:-}"
# The public chain RPC the web app actually uses (wagmi.ts's `http()` transport) — a fixed,
# per-env literal. RPC_ORIGINS defaults to THIS, never to RPC_URL: RPC_URL is api/indexer/
# settler's own backend RPC and may carry a provider key in its path, which must never reach
# the public CSP header web.yaml renders RPC_ORIGINS into. Reduced to a bare origin (and
# refused if it carries userinfo) only where it's actually used — the `--only all` block below
# — since neither matters for api/indexer/settler/web-demo, none of which reference it.
DEFAULT_RPC_ORIGIN="$([ "$ENV" = "staging" ] && echo https://sepolia.base.org || echo https://mainnet.base.org)"
RPC_URL="${RPC_URL:-$DEFAULT_RPC_ORIGIN}"
RPC_ORIGINS="${RPC_ORIGINS:-$DEFAULT_RPC_ORIGIN}"
# Always derived from API_URL — not itself a caller-settable override (there is no provider-key
# concern here the way there is for RPC_URL vs RPC_ORIGINS: API_URL is already the public URL).
# Assigned unconditionally so it exists under `set -u` even for --only stack, which needs it for
# render()'s env prefix below despite web.yaml (the only consumer) never being rendered there.
API_ORIGIN="$API_URL"
# Bucket names are global, so default to one scoped to this project (docs/deploy-gcp.md §4).
MEDIA_BUCKET="${MEDIA_BUCKET:-openad-media-${PROJECT}-${ENV}}"
# The VPC Direct VPC egress uses to reach Cloud SQL's private IP (docs/deploy-gcp.md §3).
VPC_NETWORK="${VPC_NETWORK:-default}"
VPC_SUBNET="${VPC_SUBNET:-default}"

# web.yaml is the only manifest that renders API_ORIGIN/RPC_ORIGINS into a public CSP header, so
# these are reduced to bare origins (and refused if either isn't one: see origin_of) only when
# --only all will actually render it — api/indexer/settler/web-demo never reference either.
# Done here, before Cloud Build/migrate/the stack replaces/any IAM binding below, so a bad
# RPC_ORIGINS or API_URL aborts before an --only all deploy is half-applied.
# --only stack is intentionally exempt (API_ORIGIN/RPC_ORIGINS are assigned above but never
# validated or used there) — see check-sh.sh's userinfo API_URL/WEB_URL same-site test.
if [ "$ONLY" = "all" ]; then
    if ! RPC_ORIGINS="$(normalize_origins "$RPC_ORIGINS")"; then
        exit 1
    fi
    if ! API_ORIGIN="$(origin_of "$API_ORIGIN" "API_URL")"; then
        exit 1
    fi
    echo "Resolved web CSP origins: API_ORIGIN=${API_ORIGIN} RPC_ORIGINS=${RPC_ORIGINS}"
fi

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

# Web build inputs that reach Cloud Build as-is (infra/gcp/cloudbuild.yaml's
# _WALLETCONNECT_PROJECT_ID/_GUIDE_URL/_DEMO_URL -> web/Dockerfile's matching VITE_* build args ->
# web/src/lib/wagmi.ts / lib/copy.ts / features/marketing/WhyPage.tsx). Each defaults to unset
# rather than a fake value: an empty WalletConnect id means injected (browser) wallets only, and
# an empty guide/demo URL hides that link — never a placeholder that would silently mislead.
WALLETCONNECT_PROJECT_ID="${WALLETCONNECT_PROJECT_ID:-}"
GUIDE_URL="${GUIDE_URL:-https://pam-2.gitbook.io/open-ad-docs}"
DEMO_URL="${DEMO_URL:-}"

# gcloud splits --substitutions on commas: a comma inside any of these three would silently
# corrupt every substitution after it, so refuse rather than mis-build.
case "$WALLETCONNECT_PROJECT_ID" in
    *,*)
        echo "Refusing: WALLETCONNECT_PROJECT_ID contains a comma, which breaks --substitutions (gcloud splits on it)." >&2
        exit 1
        ;;
esac
case "$GUIDE_URL" in
    *,*)
        echo "Refusing: GUIDE_URL contains a comma, which breaks --substitutions (gcloud splits on it)." >&2
        exit 1
        ;;
esac
case "$DEMO_URL" in
    *,*)
        echo "Refusing: DEMO_URL contains a comma, which breaks --substitutions (gcloud splits on it)." >&2
        exit 1
        ;;
esac

# Without --gcs-source-staging-dir, gcloud stages source to the default <PROJECT>_cloudbuild
# bucket and checks its ownership by listing the project's buckets, which a bucket-scoped grant
# doesn't allow (inferred). Point it at gs://<project>-openad-builds instead, a bucket this
# deployer can be scoped to (created and documented as BUILD_STAGING_BUCKET elsewhere in infra
# setup). The inline default (rather than a WALLETCONNECT_PROJECT_ID-style block above) means
# this works whether or not BUILD_STAGING_BUCKET is exported. `$PROJECT`, not a `PROJECT_ID` env
# var: this script never sets one at this point (the `render()` step below sets `PROJECT_ID`
# only in envsubst's own environment, after this step has already run).
step "Cloud Build: api/web/web-demo images" run gcloud builds submit \
    --project "$PROJECT" \
    --config infra/gcp/cloudbuild.yaml \
    --substitutions="_REGION=${REGION},_REPO=openad,_ENV=${ENV},_API_URL=${API_URL},_CHAIN_ID=${CHAIN_ID},_TAG=${TAG},_WALLETCONNECT_PROJECT_ID=${WALLETCONNECT_PROJECT_ID},_GUIDE_URL=${GUIDE_URL},_DEMO_URL=${DEMO_URL}" \
    --gcs-source-staging-dir="gs://${BUILD_STAGING_BUCKET:-${PROJECT}-openad-builds}/source"

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
        RPC_ORIGINS="$RPC_ORIGINS" MEDIA_BUCKET="$MEDIA_BUCKET" VPC_NETWORK="$VPC_NETWORK" \
        VPC_SUBNET="$VPC_SUBNET" API_INGRESS="$API_INGRESS" \
        envsubst <"$src" >"$dest"
}

# render_public <src> <dest> — render() for a service meant to be public (api, web, web-demo;
# never indexer or settler). With PUBLIC_INVOKER=iam-disabled it then marks the rendered copy
# with the invoker-iam-disabled annotation (annotate_invoker_iam_disabled above), before the
# caller's `services replace` applies it.
render_public() {
    render "$1" "$2"
    if [ "$PUBLIC_INVOKER" = "iam-disabled" ]; then
        run annotate_invoker_iam_disabled "$2"
    fi
}

if [ "$ONLY" = "stack" ] || [ "$ONLY" = "all" ]; then
    render infra/gcp/jobs/migrate.yaml "${RENDER_DIR}/migrate.yaml"
    step "Cloud Run Job: openad-migrate (replace)" run gcloud run jobs replace \
        "${RENDER_DIR}/migrate.yaml" --project "$PROJECT" --region "$REGION"
    step "Cloud Run Job: openad-migrate (execute --wait)" run gcloud run jobs execute \
        openad-migrate --project "$PROJECT" --region "$REGION" --wait

    render_public infra/gcp/services/api.yaml "${RENDER_DIR}/api.yaml"
    step "Cloud Run service: openad-api" run gcloud run services replace \
        "${RENDER_DIR}/api.yaml" --project "$PROJECT" --region "$REGION"
    # The indexer and the settler are never public: plain render(), no invoker annotation.
    for svc in indexer settler; do
        render "infra/gcp/services/${svc}.yaml" "${RENDER_DIR}/${svc}.yaml"
        step "Cloud Run service: openad-${svc}" run gcloud run services replace \
            "${RENDER_DIR}/${svc}.yaml" --project "$PROJECT" --region "$REGION"
    done

    # `services replace` applies no IAM by itself. api is the only one of these three meant to
    # be public; the indexer and settler stay --ingress=internal with no invoker binding at all.
    bind_public_invoker openad-api

    # Its *.run.app URL while API_INGRESS is `all`, else API_URL (api_smoke_url above).
    API_SMOKE_URL="$(api_smoke_url)"
    step "Smoke check: openad-api /v1/health" run curl --fail --silent --show-error \
        --retry 5 --retry-delay 3 --retry-connrefused "${API_SMOKE_URL}/v1/health"
fi

if [ "$ONLY" = "demo" ] || [ "$ONLY" = "all" ]; then
    render_public infra/gcp/services/web-demo.yaml "${RENDER_DIR}/web-demo.yaml"
    step "Cloud Run service: openad-web-demo" run gcloud run services replace \
        "${RENDER_DIR}/web-demo.yaml" --project "$PROJECT" --region "$REGION"
    bind_public_invoker openad-web-demo
    if [ -z "$WEB_DEMO_URL" ]; then
        WEB_DEMO_URL="$(resolve_service_url openad-web-demo)"
    fi
    step "Smoke check: openad-web-demo /healthz" run curl --fail --silent --show-error \
        --retry 5 --retry-delay 3 --retry-connrefused "${WEB_DEMO_URL}/healthz"
fi

if [ "$ONLY" = "all" ]; then
    render_public infra/gcp/services/web.yaml "${RENDER_DIR}/web.yaml"
    step "Cloud Run service: openad-web" run gcloud run services replace \
        "${RENDER_DIR}/web.yaml" --project "$PROJECT" --region "$REGION"
    bind_public_invoker openad-web

    # Smoke-checked at its own live *.run.app URL, not WEB_URL: on a fresh project WEB_URL may
    # name a custom domain that docs/deploy-gcp.md §9 only maps after this point. web.yaml's
    # ingress is `all` (not a variable), so its *.run.app URL always answers.
    WEB_LIVE_URL="$(resolve_service_url openad-web)"
    step "Smoke check: openad-web /healthz" run curl --fail --silent --show-error \
        --retry 5 --retry-delay 3 --retry-connrefused "${WEB_LIVE_URL}/healthz"
fi

echo ""
echo "Done: env=${ENV} only=${ONLY} tag=${TAG}"
