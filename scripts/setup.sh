#!/usr/bin/env bash
# Idempotent first-time setup (bash twin of scripts/setup.ps1). See docs/adr/0007.
#
# Usage: scripts/setup.sh [--skip-docker] [--dry-run] [-h|--help]

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "${SCRIPT_DIR}/lib.sh"

SKIP_DOCKER=0

usage() {
    cat <<'EOF'
Usage: scripts/setup.sh [--skip-docker] [--dry-run] [-h|--help]

Idempotent first-time setup: .env, docker (anvil+postgres), uv sync (contracts, api),
mox compile, mox run deploy --network anvil, alembic upgrade head, npm install, and
web deployment sync. Never runs `mox install`.

  --skip-docker  Skip starting docker compose and the healthcheck wait.
  --dry-run      Print the commands each step would run instead of running them.
  -h, --help     Show this help and exit.
EOF
}

for arg in "$@"; do
    case "$arg" in
        --skip-docker) SKIP_DOCKER=1 ;;
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

if [ "$DRY_RUN" != "1" ]; then
    require_cmd uv node npm
    if [ "$SKIP_DOCKER" != "1" ]; then
        require_cmd docker
    fi

    node_major="$(node -v | tr -d 'v' | cut -d. -f1)"
    if [ "$node_major" -lt 20 ]; then
        echo "Node.js >= 20 is required (found $(node -v))." >&2
        exit 1
    fi

    if [ "$SKIP_DOCKER" != "1" ]; then
        if ! docker info >/dev/null 2>&1; then
            echo "Docker does not appear to be running. Start it and retry." >&2
            exit 1
        fi
    fi
fi

copy_env() {
    if [ ! -f "${REPO_ROOT}/.env" ]; then
        if [ ! -f "${REPO_ROOT}/.env.example" ]; then
            echo ".env.example is missing; cannot create .env." >&2
            return 1
        fi
        run cp "${REPO_ROOT}/.env.example" "${REPO_ROOT}/.env"
        echo "Created .env (values not printed)."
    else
        echo ".env already exists; leaving it unchanged."
    fi
}
step "copy .env from .env.example if missing" copy_env

wait_infra() {
    if [ "$DRY_RUN" = "1" ]; then
        echo "+ wait_compose_healthy anvil postgres"
        echo "+ wait_anvil_rpc"
    else
        wait_compose_healthy anvil postgres
        wait_anvil_rpc
    fi
}

if [ "$SKIP_DOCKER" != "1" ]; then
    step "docker compose up -d" run docker compose up -d
    step "wait for anvil and postgres healthchecks" wait_infra
else
    echo ""
    echo "==> skipping docker ( --skip-docker )"
fi

sync_contracts() { (cd "${REPO_ROOT}/contracts" && run uv sync); }
step "uv sync (contracts)" sync_contracts

sync_api() { (cd "${REPO_ROOT}/api" && run uv sync); }
step "uv sync (api)" sync_api

mox_compile() { (cd "${REPO_ROOT}/contracts" && run uv run mox compile); }
step "mox compile" mox_compile

mox_deploy() {
    local key
    if [ "$DRY_RUN" = "1" ]; then
        key="<redacted>"
    else
        key="$(anvil_key)"
    fi
    # Foundry Anvil account #0 (public, local-only). Read from docker-compose.yml
    # comments so setup never prompts.
    (cd "${REPO_ROOT}/contracts" && run uv run mox run deploy --network anvil --private-key "$key")
}
step "mox run deploy --network anvil" mox_deploy

alembic_upgrade() { (cd "${REPO_ROOT}/api" && run uv run alembic upgrade head); }
step "alembic upgrade head" alembic_upgrade

step "npm install (repo root)" run npm install

step "sync web deployments" run npm run sync:deployments -w web

echo ""
echo "Setup complete."
echo ""
echo "Protocol contracts are deployed on Anvil (CreativeRegistry, AdSlot, Marketplace, CampaignVault, MockUSDC)."
echo "  - Artifact: contracts/deployments/31337.json (git-ignored)."
echo "  - Demo: two slots, terms, one approved creative, one purchased period."
echo ""
echo "Next: ./scripts/dev-up.sh"
