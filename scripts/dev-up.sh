#!/usr/bin/env bash
# Start the local dev loop (bash twin of scripts/dev-up.ps1). See docs/adr/0007.
#
# Usage: scripts/dev-up.sh [--embed] [--dry-run] [-h|--help]
#
# Deviation from the .ps1: Bash has no titled windows. Each process runs as a background
# child of this script with line-prefixed output (e.g. "[api] ..."), and a trap on
# INT/TERM/EXIT signals the whole process group (this script plus every child AND
# grandchild it spawned, e.g. a child's own subprocesses) on Ctrl+C. Pre-existing port
# holders are reported, never killed, same as the .ps1.

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib.sh
source "${SCRIPT_DIR}/lib.sh"

EMBED=0

usage() {
    cat <<'EOF'
Usage: scripts/dev-up.sh [--embed] [--dry-run] [-h|--help]

Preflight (.env, contracts/deployments/31337.json, docker health, redeploy if Anvil has no
MockUSDC code at the artifact address, port report for 8000/5173/8545/15432), then starts
api, indexer, settler, and web as background children with line-prefixed output ([api],
[indexer], [settler], [web]). Ctrl+C (or script exit) stops them all, including their own
subprocesses. Does not kill pre-existing port holders (reports only).

  --embed     Also start the embed dev server ([embed], port 5174).
  --dry-run   Print what would run instead of starting processes.
  -h, --help  Show this help and exit.
EOF
}

for arg in "$@"; do
    case "$arg" in
        --embed) EMBED=1 ;;
        --dry-run) DRY_RUN=1 ;;
        -h | --help)
            usage
            exit 0
            ;;
        *)
            echo "Unknown argument: $arg" >&2
            usage >&2
            exit 1
            ;;
    esac
done

cd "$REPO_ROOT"

if [ ! -f "${REPO_ROOT}/.env" ]; then
    echo ".env is missing. Run ./scripts/setup.sh first." >&2
    exit 1
fi

if [ ! -f "${REPO_ROOT}/contracts/deployments/31337.json" ]; then
    echo "contracts/deployments/31337.json is missing. The indexer hard-fails without it. Run ./scripts/setup.sh first." >&2
    exit 1
fi

if [ "$DRY_RUN" != "1" ]; then
    require_cmd docker
    if ! docker info >/dev/null 2>&1; then
        echo "Docker does not appear to be running. Start it and retry." >&2
        exit 1
    fi

    if ! compose_service_healthy anvil || ! compose_service_healthy postgres; then
        wait_infra() { wait_compose_healthy anvil postgres && wait_anvil_rpc; }
        step "docker compose up -d" run docker compose up -d
        step "wait for anvil and postgres healthchecks" wait_infra
    fi

    ARTIFACT_PATH="${REPO_ROOT}/contracts/deployments/31337.json"
    if ! anvil_has_usdc_code "$ARTIFACT_PATH"; then
        echo ""
        echo "Anvil has no MockUSDC at the last artifact address (chain is empty after compose down)."
        redeploy() {
            local key
            key="$(anvil_key)"
            (cd "${REPO_ROOT}/contracts" && run uv run mox run deploy --network anvil --private-key "$key")
        }
        step "mox run deploy --network anvil" redeploy
    fi
else
    echo ""
    echo "+ (preflight) docker compose up -d if anvil/postgres are not already healthy"
    echo "+ (preflight) mox run deploy --network anvil --private-key <redacted>  # if Anvil has no MockUSDC code"
fi

port_status() {
    local port="$1" role="$2" expect_open="${3:-0}"
    if [ "$DRY_RUN" = "1" ]; then
        echo "  port ${port}: (dry-run; not probed) ${role}"
        return 0
    fi
    if port_open "$port"; then
        if [ "$expect_open" = "1" ]; then
            echo "  port ${port}: in use (${role}; expected)"
        else
            echo "  port ${port}: in use (${role}; not killed; the new process may fail to bind)"
        fi
    else
        if [ "$expect_open" = "1" ]; then
            echo "  port ${port}: free (${role}; expected anvil/postgres to be listening)"
        else
            echo "  port ${port}: free (${role})"
        fi
    fi
}

echo ""
echo "==> port check (nothing is killed)"
port_status 8000 api
port_status 5173 web
port_status 8545 anvil 1
port_status 15432 postgres 1
if [ "$EMBED" = "1" ]; then
    port_status 5174 embed
fi

API_DIR="${REPO_ROOT}/api"
PIDS=()

start_child() {
    local prefix="$1" dir="$2"
    shift 2
    if [ "$DRY_RUN" = "1" ]; then
        echo "+ (cd ${dir} && $*)  # background, prefixed [${prefix}]"
        return 0
    fi
    # A subshell that execs the real command keeps the same PID (no extra pipeline
    # wrapper), so `kill "$pid"` below signals the actual process directly. Output is
    # line-prefixed via process substitution (awk, not a trailing sed pipe) so the
    # writer side above never forks an extra pipeline stage.
    (cd "$dir" && exec "$@") > >(awk -v p="[${prefix}] " '{ print p $0; fflush() }') 2>&1 &
    PIDS+=("$!")
}

cleanup() {
    # Disarm first so the kill below can't re-enter this trap.
    trap - INT TERM EXIT
    if [ "${#PIDS[@]}" -eq 0 ]; then
        return 0
    fi
    echo ""
    echo "Stopping child processes and their subprocesses..."
    # Background jobs in a non-interactive bash script (job control / set -m off) share
    # this script's own process group, so signalling the whole group (this script
    # included) reaches every child AND grandchild in one shot — e.g. `npm run dev:web`
    # itself forking vite. `kill -- -$$` targets that group by its negative PGID; `kill 0`
    # is the portable fallback some shells/kill implementations prefer.
    kill -- -$$ 2>/dev/null || kill 0 2>/dev/null || true
    wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

step "start api" start_child api "$API_DIR" uv run uvicorn openad.main:app --reload
step "start indexer" start_child indexer "$API_DIR" uv run python -m openad.indexer
step "start settler" start_child settler "$API_DIR" uv run python -m openad.settler
step "start web" start_child web "$REPO_ROOT" npm run dev:web

if [ "$EMBED" = "1" ]; then
    step "start embed" start_child embed "$REPO_ROOT" npm run dev:embed
fi

STARTED="api, indexer, settler, web"
if [ "$EMBED" = "1" ]; then
    STARTED="api, indexer, settler, web, embed"
fi

echo ""
echo "Started background processes: ${STARTED}."
echo "  API health:  http://localhost:8000/v1/health"
echo "  Web:         http://localhost:5173"
if [ "$EMBED" = "1" ]; then
    echo "  Embed demo:  http://localhost:5174/demo/"
else
    echo "  Embed demo:  ./scripts/dev-up.sh --embed  (http://localhost:5174/demo/)"
fi
echo ""
echo "Stop: press Ctrl+C in this terminal (kills the whole process group)."
echo "      ./scripts/dev-down.sh stops docker. The next ./scripts/dev-up.sh starts it again."
echo ""
echo "Optional live marketplace activity: npm run dev -w sim (bash equivalent of scripts/sim-up.ps1)"

if [ "$DRY_RUN" = "1" ]; then
    exit 0
fi

wait
