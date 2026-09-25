#!/usr/bin/env bash
# Static self-test for scripts/*.sh: syntax-checks every script, exercises --help and
# --dry-run, and asserts key command lines appear (or don't). No docker daemon required.
# Every dry-run below runs against a throwaway temp directory (OPENAD_REPO_ROOT), never
# the real working tree, so it can't create/modify a real .env or deployment artifact.
# See docs/adr/0007-local-run-scripts.md (bash twins amendment).

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

FAIL=0

fail() {
    echo "FAIL: $1" >&2
    FAIL=1
}

echo "==> bash -n (syntax check)"
for f in "${SCRIPT_DIR}"/*.sh; do
    if ! bash -n "$f"; then
        fail "syntax error in $f"
    else
        echo "  ok: $(basename "$f")"
    fi
done

# A throwaway fake repo root: just enough for the scripts' `cd`s and file checks to
# succeed under --dry-run (real command execution is skipped by `run`, but `cd` and
# `[ -f ... ]` preflight checks are not). Never the real working tree.
FAKE_REPO="$(mktemp -d)"
cleanup() { rm -rf "$FAKE_REPO"; }
trap cleanup EXIT

cp "${REPO_ROOT}/docker-compose.yml" "${FAKE_REPO}/docker-compose.yml"
: >"${FAKE_REPO}/.env.example"
: >"${FAKE_REPO}/.env"
mkdir -p "${FAKE_REPO}/contracts/deployments" "${FAKE_REPO}/api"
echo '{"contracts":{"USDC":{"address":"0x0000000000000000000000000000000000000000"}}}' \
    >"${FAKE_REPO}/contracts/deployments/31337.json"

# Run one of the real scripts (by its real path, so it still finds the real lib.sh next
# to it) with OPENAD_REPO_ROOT pointed at the fake repo above.
run_fake() {
    local script="$1"
    shift
    (cd "$REPO_ROOT" && OPENAD_REPO_ROOT="$FAKE_REPO" DRY_RUN=1 bash "scripts/${script}" "$@")
}

# deploy-gcp.sh reads these from its environment. Unset once, here, so a caller's exported value
# (a CI job's, or a developer's shell) can't change what the tests below assert; each test sets
# what it needs on its own command line.
unset API_URL WEB_URL WEB_DEMO_URL RPC_URL RPC_ORIGINS MEDIA_BUCKET BUILD_STAGING_BUCKET \
    VPC_NETWORK VPC_SUBNET PUBLIC_INVOKER API_INGRESS WALLETCONNECT_PROJECT_ID GUIDE_URL DEMO_URL

echo ""
echo "==> --help on every runnable script"
for f in setup.sh dev-up.sh dev-down.sh stack-docker.sh deploy-gcp.sh; do
    if ! bash "${SCRIPT_DIR}/${f}" --help >/dev/null; then
        fail "${f} --help exited non-zero"
    else
        echo "  ok: ${f} --help"
    fi
done

echo ""
echo "==> setup.sh --dry-run --skip-docker (fake repo root; no .env.example needed)"
OUT="$(run_fake setup.sh --dry-run --skip-docker)"
if ! grep -q 'mox run deploy --network anvil' <<<"$OUT"; then
    fail "setup.sh --dry-run --skip-docker missing 'mox run deploy --network anvil'"
else
    echo "  ok: contains 'mox run deploy --network anvil'"
fi
if grep -qi 'mox install' <<<"$OUT"; then
    fail "setup.sh --dry-run must never mention 'mox install'"
else
    echo "  ok: no 'mox install'"
fi

echo ""
echo "==> dev-up.sh --dry-run (fake repo root: fake .env + 31337.json)"
UP_OUT="$(run_fake dev-up.sh --dry-run --embed)"
if ! grep -q 'mox run deploy --network anvil' <<<"$UP_OUT"; then
    fail "dev-up.sh --dry-run missing the conditional redeploy line"
else
    echo "  ok: contains the conditional 'mox run deploy --network anvil' preflight line"
fi
for name in api indexer settler web embed; do
    if ! grep -q "start ${name}" <<<"$UP_OUT"; then
        fail "dev-up.sh --dry-run --embed missing 'start ${name}'"
    fi
done
echo "  ok: starts api, indexer, settler, web, embed"

echo ""
echo "==> stack-docker.sh --dry-run (fake repo root)"
STACK_OUT="$(run_fake stack-docker.sh --dry-run)"
if ! grep -q 'docker-compose.stack.yml' <<<"$STACK_OUT"; then
    fail "stack-docker.sh --dry-run missing 'docker-compose.stack.yml'"
else
    echo "  ok: contains 'docker-compose.stack.yml'"
fi

echo ""
echo "==> dev-down.sh --dry-run --reset --yes"
DOWN_OUT="$(run_fake dev-down.sh --dry-run --reset --yes)"
if ! grep -q 'docker compose down -v' <<<"$DOWN_OUT"; then
    fail "dev-down.sh --dry-run --reset --yes missing 'docker compose down -v'"
else
    echo "  ok: contains 'docker compose down -v'"
fi

echo ""
echo "==> deploy-gcp.sh --dry-run --only demo (fake repo root; no gcloud/envsubst needed)"
DEPLOY_OUT="$(run_fake deploy-gcp.sh --dry-run --env staging --only demo --project p --region r --tag faketag)"
if ! grep -q 'builds submit' <<<"$DEPLOY_OUT"; then
    fail "deploy-gcp.sh --dry-run missing 'builds submit'"
else
    echo "  ok: contains 'builds submit'"
fi
# The web build inputs that mean "unset" when empty (web/src/lib/wagmi.ts, lib/copy.ts,
# WhyPage.tsx) must actually reach the builds-submit substitutions, not just default quietly to
# nothing inside cloudbuild.yaml.
if ! grep -q '_WALLETCONNECT_PROJECT_ID=' <<<"$DEPLOY_OUT"; then
    fail "deploy-gcp.sh --dry-run 'builds submit' missing '_WALLETCONNECT_PROJECT_ID='"
else
    echo "  ok: contains '_WALLETCONNECT_PROJECT_ID='"
fi
if ! grep -q '_GUIDE_URL=' <<<"$DEPLOY_OUT"; then
    fail "deploy-gcp.sh --dry-run 'builds submit' missing '_GUIDE_URL='"
else
    echo "  ok: contains '_GUIDE_URL='"
fi
if ! grep -q '_DEMO_URL=' <<<"$DEPLOY_OUT"; then
    fail "deploy-gcp.sh --dry-run 'builds submit' missing '_DEMO_URL='"
else
    echo "  ok: contains '_DEMO_URL='"
fi
# --gcs-source-staging-dir avoids gcloud's default-bucket ownership check (a bucket listing a
# bucket-scoped grant can't do, inferred) by staging to a bucket this deployer owns instead.
# The default gets its own capture, with BUILD_STAGING_BUCKET unset inside the command
# substitution's subshell only (this script's own environment is untouched): a value exported by
# whatever shell runs check-sh.sh would otherwise reach run_fake's child process and fail this
# assertion for a reason that has nothing to do with deploy-gcp.sh itself.
DEFAULT_OUT="$(unset BUILD_STAGING_BUCKET; run_fake deploy-gcp.sh --dry-run --env staging --only demo --project p --region r --tag faketag)"
if ! grep -qF -- '--gcs-source-staging-dir=gs://p-openad-builds/source' <<<"$DEFAULT_OUT"; then
    fail "deploy-gcp.sh --dry-run 'builds submit' missing the default '--gcs-source-staging-dir=gs://p-openad-builds/source'"
else
    echo "  ok: defaults --gcs-source-staging-dir to gs://p-openad-builds/source"
fi
BUCKET_OUT="$(BUILD_STAGING_BUCKET=custom-staging-bucket run_fake deploy-gcp.sh --dry-run --env staging --only demo --project p --region r --tag faketag)"
if ! grep -qF -- '--gcs-source-staging-dir=gs://custom-staging-bucket/source' <<<"$BUCKET_OUT"; then
    fail "deploy-gcp.sh --dry-run 'builds submit' ignored BUILD_STAGING_BUCKET=custom-staging-bucket"
else
    echo "  ok: BUILD_STAGING_BUCKET=custom-staging-bucket overrides --gcs-source-staging-dir"
fi
if ! grep -q 'run services replace' <<<"$DEPLOY_OUT"; then
    fail "deploy-gcp.sh --dry-run missing 'run services replace'"
else
    echo "  ok: contains 'run services replace'"
fi
# Its own capture, with 2>&1: resolve_service_url's dry-run diagnostic goes to stderr (its stdout
# is reserved for the resolved value alone, since real callers do VAR="$(resolve_service_url
# svc)"), and the "services describe" assertion below needs to see it. WEB_DEMO_URL is unset
# (see the unset near the top), so the script must ask Cloud Run for openad-web-demo's URL.
DEMO_OUT="$(run_fake deploy-gcp.sh --dry-run --env staging --only demo --project p --region r --tag faketag 2>&1)"
if ! grep -q 'services add-iam-policy-binding openad-web-demo' <<<"$DEMO_OUT" || ! grep -q 'allUsers' <<<"$DEMO_OUT"; then
    fail "deploy-gcp.sh --only demo missing the allUsers invoker binding on openad-web-demo"
else
    echo "  ok: binds allUsers/roles/run.invoker on openad-web-demo"
fi
if ! grep -q 'services describe openad-web-demo' <<<"$DEMO_OUT"; then
    fail "deploy-gcp.sh --only demo (WEB_DEMO_URL unset) missing the openad-web-demo URL lookup"
else
    echo "  ok: looks up openad-web-demo's URL when WEB_DEMO_URL is unset"
fi
if grep -q 'annotate_invoker_iam_disabled' <<<"$DEMO_OUT"; then
    fail "deploy-gcp.sh must not disable the invoker IAM check unless PUBLIC_INVOKER=iam-disabled: $DEMO_OUT"
else
    echo "  ok: no invoker-iam-disabled annotation by default (PUBLIC_INVOKER unset)"
fi

echo ""
echo "==> deploy-gcp.sh --only stack refuses without a deployments artifact (fake repo root)"
if run_fake deploy-gcp.sh --dry-run --env staging --only stack --project p --region r --tag faketag >/dev/null 2>&1; then
    fail "deploy-gcp.sh --only stack should refuse without contracts/deployments/84532.json"
else
    echo "  ok: refused without 84532.json"
fi

echo ""
echo "==> deploy-gcp.sh same-site guard (fake repo root; adds 84532.json to clear the guard above)"
echo '{}' >"${FAKE_REPO}/contracts/deployments/84532.json"
# The same-site guard's own wording. Not just "Refusing": the deployments-file and prod guards
# print that too, so matching it would let a refusal from one of them pass for this guard.
SAME_SITE_MSG="do not look like the same"
if OUT="$(API_URL="https://openad-api-abc-uc.a.run.app" WEB_URL="https://openad-web-def-uc.a.run.app" \
    run_fake deploy-gcp.sh --dry-run --env staging --only stack --project p --region r --tag faketag 2>&1)"; then
    fail "deploy-gcp.sh should refuse two different *.run.app hosts as cross-site"
elif ! grep -q "$SAME_SITE_MSG" <<<"$OUT"; then
    fail "deploy-gcp.sh refused two different *.run.app hosts, but not via the same-site guard (no '${SAME_SITE_MSG}' message): $OUT"
else
    echo "  ok: refused two different *.run.app hosts (via the same-site guard)"
fi
if OUT="$(API_URL="https://api.foo.com" WEB_URL="https://app.bar.com" \
    run_fake deploy-gcp.sh --dry-run --env staging --only stack --project p --region r --tag faketag 2>&1)"; then
    fail "deploy-gcp.sh should refuse mismatched custom domains"
elif ! grep -q "$SAME_SITE_MSG" <<<"$OUT"; then
    fail "deploy-gcp.sh refused mismatched custom domains, but not via the same-site guard (no '${SAME_SITE_MSG}' message): $OUT"
else
    echo "  ok: refused mismatched custom domains (api.foo.com / app.bar.com, via the same-site guard)"
fi
if ! API_URL="https://api.foo.com" WEB_URL="https://app.bar.com" \
    run_fake deploy-gcp.sh --dry-run --env staging --only stack --project p --region r --tag faketag \
    --allow-cross-site-auth >/dev/null 2>&1; then
    fail "deploy-gcp.sh --allow-cross-site-auth should bypass the same-site guard"
else
    echo "  ok: --allow-cross-site-auth bypasses the guard"
fi
if ! API_URL="https://api.foo.com" WEB_URL="https://app.foo.com" \
    run_fake deploy-gcp.sh --dry-run --env staging --only stack --project p --region r --tag faketag >/dev/null 2>&1; then
    fail "deploy-gcp.sh should accept api/web on the same registrable domain"
else
    echo "  ok: accepts api.foo.com / app.foo.com (same registrable domain)"
fi
# host_of must lowercase and strip userinfo + port before comparing; without either, these
# same-site pairs would compare unequal ("Example.com" / "user") and be wrongly refused.
if ! API_URL="https://API.Example.com" WEB_URL="https://app.example.com" \
    run_fake deploy-gcp.sh --dry-run --env staging --only stack --project p --region r --tag faketag >/dev/null 2>&1; then
    fail "deploy-gcp.sh should compare hosts case-insensitively (API.Example.com / app.example.com)"
else
    echo "  ok: accepts API.Example.com / app.example.com (host_of lowercases)"
fi
if ! API_URL="https://user:pw@api.example.com:8443" WEB_URL="https://app.example.com" \
    run_fake deploy-gcp.sh --dry-run --env staging --only stack --project p --region r --tag faketag >/dev/null 2>&1; then
    fail "deploy-gcp.sh should strip userinfo and port before comparing hosts (user:pw@api.example.com:8443 / app.example.com)"
else
    echo "  ok: accepts user:pw@api.example.com:8443 / app.example.com (host_of strips userinfo + port)"
fi
if ! API_URL="https://openad-api-abc-uc.a.run.app" WEB_URL="https://openad-web-def-uc.a.run.app" \
    run_fake deploy-gcp.sh --dry-run --env staging --only demo --project p --region r --tag faketag >/dev/null 2>&1; then
    fail "deploy-gcp.sh --only demo should never apply the same-site guard (even with two mismatched *.run.app hosts)"
else
    echo "  ok: --only demo ignores API_URL/WEB_URL, even two different *.run.app hosts"
fi

# ran_gcloud <output> — 0 if a dry-run printed any gcloud command. Every guard must refuse
# before the first side effect, and Cloud Build (`builds submit`) is the first of them.
ran_gcloud() {
    grep -q -e 'builds submit' -e '^+ gcloud ' <<<"$1"
}

# first_line <output> <regex> — the number of the first output line matching regex, or "".
first_line() {
    grep -n -e "$2" <<<"$1" | head -n 1 | cut -d: -f1 || true
}

echo ""
echo "==> deploy-gcp.sh --only stack refuses when API_URL/WEB_URL are unset or empty (fake repo root)"
URL_GUARD_MSG="must both be set"
# API_URL/WEB_URL are unset for this whole script (see the unset near the top).
if OUT="$(run_fake deploy-gcp.sh --dry-run --env staging --only stack --project p --region r --tag faketag 2>&1)"; then
    fail "deploy-gcp.sh --only stack should refuse with API_URL/WEB_URL unset"
elif ! grep -q "$URL_GUARD_MSG" <<<"$OUT"; then
    fail "deploy-gcp.sh refused with API_URL/WEB_URL unset, but not via the new guard (no '${URL_GUARD_MSG}' message): $OUT"
elif ran_gcloud "$OUT"; then
    fail "deploy-gcp.sh ran a gcloud command before refusing unset API_URL/WEB_URL: $OUT"
else
    echo "  ok: refused with API_URL/WEB_URL unset (via the new guard, before any gcloud command)"
fi
if OUT="$(API_URL="" WEB_URL="" run_fake deploy-gcp.sh --dry-run --env staging --only stack --project p --region r --tag faketag 2>&1)"; then
    fail "deploy-gcp.sh --only stack should refuse with API_URL/WEB_URL set but empty"
elif ! grep -q "$URL_GUARD_MSG" <<<"$OUT"; then
    fail "deploy-gcp.sh refused with API_URL/WEB_URL empty, but not via the new guard (no '${URL_GUARD_MSG}' message): $OUT"
elif ran_gcloud "$OUT"; then
    fail "deploy-gcp.sh ran a gcloud command before refusing empty API_URL/WEB_URL: $OUT"
else
    echo "  ok: refused with API_URL/WEB_URL set but empty (via the new guard, before any gcloud command)"
fi

# "No key in the output" alone can pass vacuously: origin_of would strip RPC_URL's key even if
# RPC_ORIGINS wrongly defaulted to RPC_URL. The tests below also read web.yaml's own resolved
# API_ORIGIN/RPC_ORIGINS — printed as "Resolved web CSP origins: ...", no secret beyond what the
# CSP header would itself carry — and drive origin_of directly through RPC_ORIGINS, to prove the
# defaults, the reduction and the refusals actually happen.
RESOLVED_MSG="Resolved web CSP origins:"
# resolved_field <output> <FIELD> — the value of FIELD= on the last "Resolved web CSP origins:
# ..." line (e.g. resolved_field "$OUT" RPC_ORIGINS), assuming FIELD is the last field on the
# line (true for RPC_ORIGINS; API_ORIGIN is not the last field, so it's read differently below).
resolved_field() {
    local out="$1" field="$2" line
    line="$(grep "$RESOLVED_MSG" <<<"$out" | tail -n1)"
    printf '%s' "${line#*"${field}"=}"
}

echo ""
echo "==> deploy-gcp.sh --only all with a keyed RPC_URL on another host and an API_URL with a path and query (fake repo root)"
# RPC_URL is api/indexer/settler's own RPC and may carry a provider key. RPC_ORIGINS (web.yaml's
# public CSP) defaults to the public Sepolia origin, never to RPC_URL, not even to RPC_URL's
# key-free origin. API_ORIGIN is API_URL's bare origin: path and query dropped.
if ! OUT="$(RPC_URL="https://rpc.example/v2/SECRETKEY" API_URL="https://api.foo.com/base?v=1" \
    WEB_URL="https://app.foo.com" \
    run_fake deploy-gcp.sh --dry-run --env staging --only all --project p --region r --tag faketag 2>&1)"; then
    fail "deploy-gcp.sh --only all with a keyed RPC_URL (but no RPC_ORIGINS) should still succeed under --dry-run: $OUT"
elif grep -q 'SECRETKEY' <<<"$OUT"; then
    fail "deploy-gcp.sh leaked RPC_URL's SECRETKEY into its output"
else
    echo "  ok: no output line contains RPC_URL's SECRETKEY"
fi
GOT="$(resolved_field "$OUT" RPC_ORIGINS)"
if [ "$GOT" != "https://sepolia.base.org" ]; then
    fail "deploy-gcp.sh --env staging RPC_ORIGINS should default to https://sepolia.base.org, never RPC_URL's origin; got '${GOT}': $OUT"
else
    echo "  ok: RPC_ORIGINS defaults to the public Sepolia origin (https://sepolia.base.org), not RPC_URL's"
fi
if ! grep -q "API_ORIGIN=https://api.foo.com RPC_ORIGINS=" <<<"$OUT"; then
    fail "deploy-gcp.sh API_ORIGIN should reduce API_URL https://api.foo.com/base?v=1 to its bare origin (https://api.foo.com): $OUT"
else
    echo "  ok: API_ORIGIN reduces API_URL's path and query to its bare origin"
fi
# Same run: api and web are each replaced, then bound to allUsers, then smoke-checked. On a first
# deploy, a smoke check before the binding (or with none) gets Cloud Run's own 403.
for svc in api web; do
    REPLACE_AT="$(first_line "$OUT" "run services replace .*/${svc}\.yaml ")"
    BIND_AT="$(first_line "$OUT" "add-iam-policy-binding openad-${svc} --member=allUsers ")"
    SMOKE_AT="$(first_line "$OUT" "curl .*<openad-${svc}-url>/")"
    if [ -z "$REPLACE_AT" ] || [ -z "$BIND_AT" ] || [ -z "$SMOKE_AT" ] ||
        [ "$REPLACE_AT" -ge "$BIND_AT" ] || [ "$BIND_AT" -ge "$SMOKE_AT" ]; then
        fail "deploy-gcp.sh must replace openad-${svc}, then bind allUsers to it, then smoke-check it: $OUT"
    else
        echo "  ok: openad-${svc}: services replace, then the allUsers binding, then the smoke check"
    fi
done

echo ""
echo "==> deploy-gcp.sh reduces a keyed RPC_ORIGINS to its bare origin: key in a path, a query or a fragment (fake repo root)"
# Each case is <label>|<RPC_ORIGINS>|<expected origin>. The query-only and fragment-only cases
# have no "/" before their "?" or "#", so an authority cut only at "/" fails them.
for CASE in \
    "path, query and fragment|https://rpc.example/v2/SECRETKEY?apikey=SECRETKEY#SECRETKEY|https://rpc.example" \
    "query only|https://rpc.example?apikey=SECRETKEY|https://rpc.example" \
    "fragment only|https://rpc.example#SECRETKEY|https://rpc.example" \
    "port and query only|https://rpc.example:8545?apikey=SECRETKEY|https://rpc.example:8545"; do
    LABEL="${CASE%%|*}"
    REST="${CASE#*|}"
    IN="${REST%%|*}"
    WANT="${REST#*|}"
    if ! OUT="$(RPC_ORIGINS="$IN" API_URL="https://api.foo.com" WEB_URL="https://app.foo.com" \
        run_fake deploy-gcp.sh --dry-run --env staging --only all --project p --region r --tag faketag 2>&1)"; then
        fail "deploy-gcp.sh should accept and reduce a keyed RPC_ORIGINS (${LABEL}), not refuse it: $OUT"
    elif grep -q 'SECRETKEY' <<<"$OUT"; then
        fail "deploy-gcp.sh leaked a keyed RPC_ORIGINS (${LABEL}) into its output: $OUT"
    elif GOT="$(resolved_field "$OUT" RPC_ORIGINS)" && [ "$GOT" != "$WANT" ]; then
        fail "deploy-gcp.sh reduced a keyed RPC_ORIGINS (${LABEL}) to '${GOT}', not ${WANT}"
    else
        echo "  ok: ${LABEL}: reduced to ${WANT}, key never printed"
    fi
done

echo ""
echo "==> deploy-gcp.sh refuses an RPC_ORIGINS with userinfo or any other \"@\", unprinted, before any gcloud command (fake repo root)"
ORIGIN_USERINFO_MSG="origin_of: refusing a URL with userinfo"
# Each case is <label>|<RPC_ORIGINS>. An unencoded "/", "?" or "#" in the userinfo ends the
# authority early, so a check of the authority alone would let "https://USERX:SECRET" (or a
# host USERX on port 12) through into the CSP header.
for CASE in \
    "userinfo|https://USERX:SECRETPW@rpc.example" \
    "a \"/\" in the password|https://USERX:SECRET/PW@rpc.example" \
    "a \"?\" in the password|https://USERX:SECRET?PW@rpc.example" \
    "a \"#\" in the password|https://USERX:SECRET#PW@rpc.example" \
    "a numeric password, then \"/\"|https://USERX:12/SECRETPW@rpc.example" \
    "a \"/\" in the user|https://USERX/SECRETPW@rpc.example"; do
    LABEL="${CASE%%|*}"
    IN="${CASE#*|}"
    if OUT="$(RPC_ORIGINS="$IN" API_URL="https://api.foo.com" WEB_URL="https://app.foo.com" \
        run_fake deploy-gcp.sh --dry-run --env staging --only all --project p --region r --tag faketag 2>&1)"; then
        fail "deploy-gcp.sh should refuse an RPC_ORIGINS with ${LABEL}: $OUT"
    elif ! grep -q "$ORIGIN_USERINFO_MSG" <<<"$OUT"; then
        fail "deploy-gcp.sh refused an RPC_ORIGINS with ${LABEL}, but not with origin_of's userinfo message: $OUT"
    elif grep -q -e 'USERX' -e 'SECRET' <<<"$OUT"; then
        fail "deploy-gcp.sh printed (part of) a refused RPC_ORIGINS with ${LABEL}: $OUT"
    elif ran_gcloud "$OUT"; then
        fail "deploy-gcp.sh ran a gcloud command before refusing an RPC_ORIGINS with ${LABEL}: $OUT"
    elif grep -q "$SAME_SITE_MSG" <<<"$OUT" || grep -q "$URL_GUARD_MSG" <<<"$OUT"; then
        fail "deploy-gcp.sh refused an RPC_ORIGINS with ${LABEL} via the wrong guard: $OUT"
    else
        echo "  ok: refuses ${LABEL} (origin_of's message, value not printed, no gcloud command)"
    fi
done

echo ""
echo "==> deploy-gcp.sh refuses an RPC_ORIGINS whose host[:port] isn't host[:digits] (fake repo root)"
ORIGIN_HOSTPORT_MSG="origin_of: refusing a URL whose host[:port] is not a hostname"
for CASE in \
    "a non-numeric port|https://rpc.example:notaport" \
    "an empty port|https://rpc.example:" \
    "no host|https://:8545"; do
    LABEL="${CASE%%|*}"
    IN="${CASE#*|}"
    if OUT="$(RPC_ORIGINS="$IN" API_URL="https://api.foo.com" WEB_URL="https://app.foo.com" \
        run_fake deploy-gcp.sh --dry-run --env staging --only all --project p --region r --tag faketag 2>&1)"; then
        fail "deploy-gcp.sh should refuse an RPC_ORIGINS with ${LABEL}: $OUT"
    elif ! grep -qF "$ORIGIN_HOSTPORT_MSG" <<<"$OUT"; then
        fail "deploy-gcp.sh refused an RPC_ORIGINS with ${LABEL}, but not with origin_of's host[:port] message: $OUT"
    elif grep -q -e 'notaport' -e "$RESOLVED_MSG" <<<"$OUT"; then
        fail "deploy-gcp.sh printed (part of) a refused RPC_ORIGINS with ${LABEL}: $OUT"
    elif ran_gcloud "$OUT"; then
        fail "deploy-gcp.sh ran a gcloud command before refusing an RPC_ORIGINS with ${LABEL}: $OUT"
    else
        echo "  ok: refuses ${LABEL} (origin_of's host[:port] message, no gcloud command)"
    fi
done

echo ""
echo "==> deploy-gcp.sh refuses an RPC_ORIGINS without an http/https/ws/wss scheme, unprinted, before any gcloud command (fake repo root)"
# A value with no scheme must not be misread as its own scheme: a bare host would become
# "rpc.example://rpc.example". The refusal must not print any part of the value, host or key.
for CASE in \
    "no scheme|rpc.example/v2/SECRETKEY" \
    "an ftp:// scheme|ftp://rpc.example/v2/SECRETKEY" \
    "a bare host|rpc.example"; do
    LABEL="${CASE%%|*}"
    IN="${CASE#*|}"
    if OUT="$(RPC_ORIGINS="$IN" API_URL="https://api.foo.com" WEB_URL="https://app.foo.com" \
        run_fake deploy-gcp.sh --dry-run --env staging --only all --project p --region r --tag faketag 2>&1)"; then
        fail "deploy-gcp.sh should refuse an RPC_ORIGINS with ${LABEL}: $OUT"
    elif ! grep -q 'origin_of: refusing a URL with no http/https/ws/wss scheme' <<<"$OUT"; then
        fail "deploy-gcp.sh refused an RPC_ORIGINS with ${LABEL}, but not with origin_of's scheme message: $OUT"
    elif grep -q -e 'SECRETKEY' -e 'rpc\.example' <<<"$OUT"; then
        fail "deploy-gcp.sh printed (part of) a refused RPC_ORIGINS with ${LABEL}: $OUT"
    elif ran_gcloud "$OUT"; then
        fail "deploy-gcp.sh ran a gcloud command before refusing an RPC_ORIGINS with ${LABEL}: $OUT"
    else
        echo "  ok: refuses ${LABEL} (origin_of's scheme message, value not printed, no gcloud command)"
    fi
done

echo ""
echo "==> deploy-gcp.sh smoke-checks openad-api at its *.run.app URL while API_INGRESS is all, else at API_URL (fake repo root)"
# api.yaml's ingress annotation must be rendered from the same variable the smoke check reads,
# or the two could disagree about which URL answers.
# shellcheck disable=SC2016  # a literal ${API_INGRESS} placeholder, not an expansion
if ! grep -qF 'run.googleapis.com/ingress: ${API_INGRESS}' "${REPO_ROOT}/infra/gcp/services/api.yaml"; then
    fail "infra/gcp/services/api.yaml's run.googleapis.com/ingress annotation must be rendered from \${API_INGRESS}"
else
    echo "  ok: api.yaml renders its ingress annotation from \${API_INGRESS}"
fi
SMOKE_OUT="$(API_URL="https://api.foo.com" WEB_URL="https://app.foo.com" \
    run_fake deploy-gcp.sh --dry-run --env staging --only stack --project p --region r --tag faketag 2>&1)"
if ! grep -qF 'services describe openad-api ' <<<"$SMOKE_OUT" || ! grep -qF '<openad-api-url>/v1/health' <<<"$SMOKE_OUT"; then
    fail "deploy-gcp.sh --only stack (API_INGRESS unset) should smoke openad-api at the URL 'services describe openad-api' returns: $SMOKE_OUT"
elif grep -qF 'https://api.foo.com/v1/health' <<<"$SMOKE_OUT"; then
    fail "deploy-gcp.sh --only stack (API_INGRESS unset) smoked API_URL, not openad-api's *.run.app URL: $SMOKE_OUT"
else
    echo "  ok: API_INGRESS unset (all): smokes <openad-api-url>/v1/health, from 'services describe openad-api'"
fi
SMOKE_OUT="$(API_INGRESS="internal-and-cloud-load-balancing" API_URL="https://api.foo.com" WEB_URL="https://app.foo.com" \
    run_fake deploy-gcp.sh --dry-run --env staging --only stack --project p --region r --tag faketag 2>&1)"
if ! grep -qF 'https://api.foo.com/v1/health' <<<"$SMOKE_OUT"; then
    fail "deploy-gcp.sh API_INGRESS=internal-and-cloud-load-balancing should smoke API_URL (https://api.foo.com/v1/health): $SMOKE_OUT"
elif grep -qF 'services describe openad-api ' <<<"$SMOKE_OUT" || grep -qF '<openad-api-url>' <<<"$SMOKE_OUT"; then
    fail "deploy-gcp.sh API_INGRESS=internal-and-cloud-load-balancing still smoked openad-api's *.run.app URL: $SMOKE_OUT"
else
    echo "  ok: API_INGRESS=internal-and-cloud-load-balancing: smokes API_URL (https://api.foo.com/v1/health)"
fi
# web.yaml's ingress is always all, so openad-web keeps its *.run.app URL whatever API_INGRESS is.
SMOKE_OUT="$(API_INGRESS="internal-and-cloud-load-balancing" API_URL="https://api.foo.com" WEB_URL="https://app.foo.com" \
    run_fake deploy-gcp.sh --dry-run --env staging --only all --project p --region r --tag faketag 2>&1)"
if ! grep -qF 'services describe openad-web ' <<<"$SMOKE_OUT" || ! grep -qF '<openad-web-url>/healthz' <<<"$SMOKE_OUT"; then
    fail "deploy-gcp.sh --only all should smoke openad-web at the URL 'services describe openad-web' returns: $SMOKE_OUT"
elif grep -qF 'https://app.foo.com/healthz' <<<"$SMOKE_OUT"; then
    fail "deploy-gcp.sh --only all smoked WEB_URL, not openad-web's *.run.app URL: $SMOKE_OUT"
else
    echo "  ok: smokes <openad-web-url>/healthz, from 'services describe openad-web'"
fi
for BAD in internal bogus; do
    if OUT="$(API_INGRESS="$BAD" API_URL="https://api.foo.com" WEB_URL="https://app.foo.com" \
        run_fake deploy-gcp.sh --dry-run --env staging --only stack --project p --region r --tag faketag 2>&1)"; then
        fail "deploy-gcp.sh should refuse API_INGRESS=${BAD}: $OUT"
    elif ! grep -q 'API_INGRESS must be' <<<"$OUT"; then
        fail "deploy-gcp.sh refused API_INGRESS=${BAD}, but not with its own message: $OUT"
    elif ran_gcloud "$OUT"; then
        fail "deploy-gcp.sh ran a gcloud command before refusing API_INGRESS=${BAD}: $OUT"
    else
        echo "  ok: refuses API_INGRESS=${BAD} before any gcloud command"
    fi
done

echo ""
echo "==> deploy-gcp.sh never binds an invoker (allUsers or --no-invoker-iam-check) on openad-indexer/openad-settler (fake repo root)"
ALL_OUT="$(API_URL="https://api.foo.com" WEB_URL="https://app.foo.com" \
    run_fake deploy-gcp.sh --dry-run --env staging --only all --project p --region r --tag faketag 2>&1)"
if grep -q 'add-iam-policy-binding openad-indexer' <<<"$ALL_OUT" || grep -q 'add-iam-policy-binding openad-settler' <<<"$ALL_OUT"; then
    fail "deploy-gcp.sh must never bind allUsers on openad-indexer/openad-settler: $ALL_OUT"
elif grep -q 'services update openad-indexer' <<<"$ALL_OUT" || grep -q 'services update openad-settler' <<<"$ALL_OUT"; then
    fail "deploy-gcp.sh must never run --no-invoker-iam-check on openad-indexer/openad-settler: $ALL_OUT"
elif grep -q 'annotate_invoker_iam_disabled' <<<"$ALL_OUT"; then
    fail "deploy-gcp.sh must not disable the invoker IAM check unless PUBLIC_INVOKER=iam-disabled: $ALL_OUT"
else
    echo "  ok: no invoker binding (allUsers or --no-invoker-iam-check) for openad-indexer or openad-settler"
fi

echo ""
echo "==> deploy-gcp.sh PUBLIC_INVOKER=iam-disabled: annotates each public service's rendered copy before its replace, never allUsers (fake repo root)"
IAM_DISABLED_OUT="$(PUBLIC_INVOKER="iam-disabled" \
    run_fake deploy-gcp.sh --dry-run --env staging --only demo --project p --region r --tag faketag 2>&1)"
if grep -q 'allUsers' <<<"$IAM_DISABLED_OUT"; then
    fail "deploy-gcp.sh PUBLIC_INVOKER=iam-disabled must never bind allUsers: $IAM_DISABLED_OUT"
elif ! grep -q 'services update openad-web-demo' <<<"$IAM_DISABLED_OUT" || ! grep -q -- '--no-invoker-iam-check' <<<"$IAM_DISABLED_OUT"; then
    fail "deploy-gcp.sh PUBLIC_INVOKER=iam-disabled missing --no-invoker-iam-check on openad-web-demo: $IAM_DISABLED_OUT"
else
    echo "  ok: PUBLIC_INVOKER=iam-disabled uses --no-invoker-iam-check on openad-web-demo, never allUsers"
fi
# `services replace` applies the whole spec, so the annotation must already be in the rendered
# copy it applies, or the replace turns the invoker IAM check back on (inferred) until the
# `services update` after it runs.
IAM_DISABLED_OUT="$(PUBLIC_INVOKER="iam-disabled" API_URL="https://api.foo.com" WEB_URL="https://app.foo.com" \
    run_fake deploy-gcp.sh --dry-run --env staging --only all --project p --region r --tag faketag 2>&1)"
if grep -q 'allUsers' <<<"$IAM_DISABLED_OUT"; then
    fail "deploy-gcp.sh PUBLIC_INVOKER=iam-disabled --only all must never bind allUsers: $IAM_DISABLED_OUT"
else
    echo "  ok: PUBLIC_INVOKER=iam-disabled --only all never binds allUsers"
fi
for svc in api web-demo web; do
    ANNOTATE_AT="$(first_line "$IAM_DISABLED_OUT" "annotate_invoker_iam_disabled .*/${svc}\.yaml\$")"
    REPLACE_AT="$(first_line "$IAM_DISABLED_OUT" "run services replace .*/${svc}\.yaml ")"
    if [ -z "$ANNOTATE_AT" ] || [ -z "$REPLACE_AT" ] || [ "$ANNOTATE_AT" -ge "$REPLACE_AT" ]; then
        fail "deploy-gcp.sh PUBLIC_INVOKER=iam-disabled must annotate the rendered ${svc}.yaml before replacing openad-${svc}: $IAM_DISABLED_OUT"
    else
        echo "  ok: annotates the rendered ${svc}.yaml before replacing openad-${svc}"
    fi
done
if grep -q -e 'annotate_invoker_iam_disabled .*/indexer\.yaml' -e 'annotate_invoker_iam_disabled .*/settler\.yaml' <<<"$IAM_DISABLED_OUT" ||
    grep -q -e 'services update openad-indexer' -e 'services update openad-settler' <<<"$IAM_DISABLED_OUT"; then
    fail "deploy-gcp.sh PUBLIC_INVOKER=iam-disabled must leave openad-indexer/openad-settler's invoker check alone: $IAM_DISABLED_OUT"
else
    echo "  ok: never touches openad-indexer's or openad-settler's invoker check"
fi
if OUT="$(PUBLIC_INVOKER="bogus" run_fake deploy-gcp.sh --dry-run --env staging --only demo --project p --region r --tag faketag 2>&1)"; then
    fail "deploy-gcp.sh should refuse an invalid PUBLIC_INVOKER value"
elif ! grep -q 'PUBLIC_INVOKER must be' <<<"$OUT"; then
    fail "deploy-gcp.sh refused PUBLIC_INVOKER=bogus, but not with its own message: $OUT"
elif ran_gcloud "$OUT"; then
    fail "deploy-gcp.sh ran a gcloud command before refusing PUBLIC_INVOKER=bogus: $OUT"
else
    echo "  ok: refuses an invalid PUBLIC_INVOKER value before any gcloud command"
fi

echo ""
echo "==> deploy-gcp.sh --env prod refuses under CI=true (fake repo root)"
if CI=true run_fake deploy-gcp.sh --dry-run --env prod --project p --region r --i-understand-this-is-mainnet --tag faketag >/dev/null 2>&1; then
    fail "deploy-gcp.sh --env prod should refuse when CI=true"
else
    echo "  ok: refused under CI=true"
fi

echo ""
if command -v shellcheck >/dev/null 2>&1; then
    echo "==> shellcheck"
    # -x follows `source` directives; the scripts' `# shellcheck source=scripts/lib.sh`
    # comments are relative to the repo root, so run from there (not from scripts/).
    if ! (cd "$REPO_ROOT" && shellcheck -x scripts/*.sh); then
        fail "shellcheck reported issues"
    else
        echo "  ok: shellcheck clean"
    fi
else
    echo "shellcheck not installed (ok; skipping)"
fi

echo ""
if [ "$FAIL" -ne 0 ]; then
    echo "check-sh: FAILED" >&2
    exit 1
fi
echo "check-sh: all checks passed"
