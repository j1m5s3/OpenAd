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
for f in setup.sh dev-up.sh dev-down.sh stack-docker.sh; do
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
if command -v shellcheck >/dev/null 2>&1; then
    echo "==> shellcheck"
    if ! shellcheck "${SCRIPT_DIR}"/*.sh; then
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
