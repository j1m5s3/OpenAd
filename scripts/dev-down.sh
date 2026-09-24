#!/usr/bin/env bash
# Stop local docker infra (bash twin of scripts/dev-down.ps1). See docs/adr/0007.
# Never kills app processes (those stop via Ctrl+C in scripts/dev-up.sh).
#
# Usage: scripts/dev-down.sh [--reset [--yes]] [--dry-run] [-h|--help]

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "${SCRIPT_DIR}/lib.sh"

RESET=0
ASSUME_YES=0

usage() {
    cat <<'EOF'
Usage: scripts/dev-down.sh [--reset [--yes]] [--dry-run] [-h|--help]

Stops docker compose (anvil + postgres). Never kills app processes.

  --reset      Also `docker compose down -v` and remove
               contracts/deployments/31337.json and api/.cache/. Prompts for
               confirmation unless --yes is also given.
  --yes        Skip the --reset confirmation prompt.
  --dry-run    Print what would run instead of running it.
  -h, --help   Show this help and exit.
EOF
}

for arg in "$@"; do
    case "$arg" in
        --reset) RESET=1 ;;
        --yes) ASSUME_YES=1 ;;
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

if [ "$RESET" = "1" ]; then
    if [ "$ASSUME_YES" != "1" ] && [ "$DRY_RUN" != "1" ]; then
        read -r -p "This removes the pgdata volume, contracts/deployments/31337.json, and api/.cache/. Continue? [y/N] " reply
        case "$reply" in
            y | Y | yes | YES) ;;
            *)
                echo "Aborted."
                exit 1
                ;;
        esac
    fi

    step "docker compose down -v" run docker compose down -v

    remove_artifact() {
        local artifact_path="${REPO_ROOT}/contracts/deployments/31337.json"
        if [ -f "$artifact_path" ]; then
            run rm -f "$artifact_path"
            echo "Removed contracts/deployments/31337.json"
        else
            echo "contracts/deployments/31337.json already absent."
        fi
    }
    step "remove 31337.json" remove_artifact

    remove_cache() {
        local cache_path="${REPO_ROOT}/api/.cache"
        if [ -d "$cache_path" ]; then
            run rm -rf "$cache_path"
            echo "Removed api/.cache/"
        else
            echo "api/.cache/ already absent."
        fi
    }
    step "remove api/.cache" remove_cache
else
    step "docker compose down" run docker compose down
    echo "pgdata volume kept. Use --reset to drop it and local deploy artifacts."
fi

echo ""
echo "Docker services stopped. This script does not kill app processes."
echo "Stop api/indexer/web/embed/sim with Ctrl+C in the terminal running scripts/dev-up.sh."
