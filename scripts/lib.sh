#!/usr/bin/env bash
# Shared helpers for scripts/*.sh. Source this file; do not execute it directly.
# See docs/adr/0007-local-run-scripts.md (bash twins amendment).

set -euo pipefail

# Repo root, resolved from this file's location (works when sourced via a symlink-free path).
# OPENAD_REPO_ROOT overrides this — used by scripts/check-sh.sh to run dry-runs against a
# throwaway temp directory instead of ever touching the real working tree's files.
REPO_ROOT="${OPENAD_REPO_ROOT:-$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)}"

DRY_RUN="${DRY_RUN:-0}"

# run <cmd...> — executes, or with DRY_RUN=1 prints "+ cmd" instead of executing.
run() {
    if [ "$DRY_RUN" = "1" ]; then
        printf '+ %s\n' "$*"
        return 0
    fi
    "$@"
}

# step "<title>" cmd... — prints "==> title", runs the rest of the args as a command,
# and fails with the title on non-zero exit.
step() {
    local title="$1"
    shift
    echo ""
    echo "==> ${title}"
    if ! "$@"; then
        echo "Step failed: ${title}" >&2
        exit 1
    fi
}

# require_cmd name... — fails listing every missing command.
require_cmd() {
    local missing=()
    local cmd
    for cmd in "$@"; do
        if ! command -v "$cmd" >/dev/null 2>&1; then
            missing+=("$cmd")
        fi
    done
    if [ "${#missing[@]}" -gt 0 ]; then
        echo "Missing on PATH: $(
            IFS=', '
            echo "${missing[*]}"
        ). Install the missing tools and retry." >&2
        exit 1
    fi
}

# compose_service_healthy <service> — 0 if the compose service reports healthy.
compose_service_healthy() {
    local service="$1"
    local id
    id="$(docker compose ps -q "$service" 2>/dev/null || true)"
    if [ -z "$id" ]; then
        return 1
    fi
    local status
    status="$(docker inspect --format '{{.State.Health.Status}}' "$id" 2>/dev/null || true)"
    [ "$status" = "healthy" ]
}

# wait_compose_healthy service... — polls docker compose ps + docker inspect until every
# named service is healthy, or times out after 120s.
wait_compose_healthy() {
    local deadline=$((SECONDS + 120))
    local svc
    local all_ok
    while [ "$SECONDS" -lt "$deadline" ]; do
        all_ok=1
        for svc in "$@"; do
            if ! compose_service_healthy "$svc"; then
                all_ok=0
                break
            fi
        done
        if [ "$all_ok" = "1" ]; then
            return 0
        fi
        sleep 2
    done
    echo "Timed out waiting for services to become healthy (docker compose ps): $*" >&2
    return 1
}

# wait_anvil_rpc — polls the host Anvil JSON-RPC endpoint until it answers, or times out
# after 30s.
wait_anvil_rpc() {
    local deadline=$((SECONDS + 30))
    local code
    while [ "$SECONDS" -lt "$deadline" ]; do
        code="$(curl -s -o /dev/null -w '%{http_code}' -X POST \
            -H 'Content-Type: application/json' \
            --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' \
            http://127.0.0.1:8545 2>/dev/null || true)"
        if [ "$code" = "200" ]; then
            return 0
        fi
        sleep 1
    done
    echo "Timed out waiting for Anvil JSON-RPC on http://127.0.0.1:8545 (host)." >&2
    return 1
}

# anvil_key — reads the Foundry Anvil account #0 private key from the docker-compose.yml
# comment, exactly as Get-AnvilPrivateKey does. Public local-only key; never echoed by callers.
anvil_key() {
    local compose_path="${REPO_ROOT}/docker-compose.yml"
    if [ ! -f "$compose_path" ]; then
        echo "docker-compose.yml is missing; cannot read the Anvil account #0 key comment." >&2
        return 1
    fi
    local key
    key="$(grep -oE 'private key[[:space:]]+0x[0-9a-fA-F]{64}' "$compose_path" | head -n1 | grep -oE '0x[0-9a-fA-F]{64}')"
    if [ -z "$key" ]; then
        echo "Could not find the Anvil account #0 private key comment in docker-compose.yml." >&2
        return 1
    fi
    printf '%s' "$key"
}

# port_open <port> — 0 if something is listening on 127.0.0.1:<port>.
port_open() {
    local port="$1"
    if command -v ss >/dev/null 2>&1; then
        # Capture ss's output fully before grepping it: piping straight into `grep -q`
        # lets grep close the pipe on first match and SIGPIPEs ss, which (with
        # pipefail) would make the pipeline's exit status wrong even on a match.
        local ss_out
        ss_out="$(ss -ltn 2>/dev/null || true)"
        grep -qE "[:.]${port}\$" <<<"$ss_out"
        return $?
    fi
    if command -v lsof >/dev/null 2>&1; then
        lsof -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1
        return $?
    fi
    # Neither ss nor lsof available: fall back to a TCP connect probe via bash's /dev/tcp.
    (exec 3<>"/dev/tcp/127.0.0.1/${port}") >/dev/null 2>&1
    local rc=$?
    exec 3>&- 2>/dev/null || true
    return $rc
}

# anvil_has_usdc_code <artifact-path> — 0 if the chain reports non-empty code at the
# MockUSDC address recorded in the deploy artifact (contracts/deployments/31337.json).
# Mirrors Test-UsdcCodePresent in dev-up.ps1. Parses JSON with node (no jq dependency).
anvil_has_usdc_code() {
    local artifact_path="$1"
    if [ ! -f "$artifact_path" ]; then
        return 1
    fi
    local addr
    addr="$(node -e '
        const fs = require("fs");
        try {
            const data = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
            const a = data && data.contracts && data.contracts.USDC && data.contracts.USDC.address;
            if (a) process.stdout.write(a);
        } catch (e) {
            // no-op: empty stdout means "not found"
        }
    ' "$artifact_path" 2>/dev/null || true)"
    if [ -z "$addr" ]; then
        return 1
    fi
    local payload
    payload="$(node -e '
        process.stdout.write(JSON.stringify({jsonrpc:"2.0",method:"eth_getCode",params:[process.argv[1],"latest"],id:1}));
    ' "$addr")"
    local resp
    resp="$(curl -s -X POST -H 'Content-Type: application/json' \
        --data "$payload" http://127.0.0.1:8545 2>/dev/null || true)"
    if [ -z "$resp" ]; then
        return 1
    fi
    local code
    code="$(node -e '
        try {
            const data = JSON.parse(process.argv[1]);
            if (data && typeof data.result === "string") process.stdout.write(data.result);
        } catch (e) {
            // no-op
        }
    ' "$resp" 2>/dev/null || true)"
    [ -n "$code" ] && [ "$code" != "0x" ] && [ "${#code}" -gt 2 ]
}
