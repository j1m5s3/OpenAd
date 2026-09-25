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
if ! grep -q 'run services replace' <<<"$DEPLOY_OUT"; then
    fail "deploy-gcp.sh --dry-run missing 'run services replace'"
else
    echo "  ok: contains 'run services replace'"
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
