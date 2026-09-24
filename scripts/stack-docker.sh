#!/usr/bin/env bash
# One-command full stack: api + indexer + settler as containers against compose
# anvil/postgres. See docker-compose.stack.yml and docs/adr/0007.
#
# Usage: scripts/stack-docker.sh [--dry-run] [-h|--help] [-- <extra docker compose args>]

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib.sh
source "${SCRIPT_DIR}/lib.sh"

usage() {
    cat <<'EOF'
Usage: scripts/stack-docker.sh [--dry-run] [-h|--help] [-- <extra docker compose args>]

Runs the full stack in containers: docker compose -f docker-compose.yml
-f docker-compose.stack.yml up --build (api, indexer; settler joins only when
OPENAD_SETTLER_KEY is set, per docker-compose.stack.yml). Requires
contracts/deployments/31337.json (run scripts/setup.sh first).

  --dry-run   Print the docker compose command instead of running it.
  -h, --help  Show this help and exit.

Any arguments after `--` are passed through to `docker compose up`.
EOF
}

EXTRA_ARGS=()
while [ "$#" -gt 0 ]; do
    case "$1" in
        --dry-run)
            DRY_RUN=1
            shift
            ;;
        -h | --help)
            usage
            exit 0
            ;;
        --)
            shift
            EXTRA_ARGS=("$@")
            break
            ;;
        *)
            echo "Unknown argument: $1" >&2
            usage >&2
            exit 1
            ;;
    esac
done

cd "$REPO_ROOT"

if [ ! -f "${REPO_ROOT}/contracts/deployments/31337.json" ]; then
    echo "contracts/deployments/31337.json is missing. Run ./scripts/setup.sh first." >&2
    exit 1
fi

if [ "$DRY_RUN" != "1" ]; then
    require_cmd docker
fi

echo ""
echo "==> docker compose -f docker-compose.yml -f docker-compose.stack.yml up --build"
# ${arr[@]+"${arr[@]}"} expands to nothing (not an unbound-variable error) when arr is
# empty, unlike a bare "${arr[@]}" under `set -u` on bash 3.2 (macOS's default bash).
run docker compose -f docker-compose.yml -f docker-compose.stack.yml up --build ${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"}

echo ""
echo "Stack containers starting: anvil, postgres, api, indexer (settler joins if"
echo "OPENAD_SETTLER_KEY is set)."
echo "Web still runs on the host: npm run dev:web  (http://localhost:5173)"
