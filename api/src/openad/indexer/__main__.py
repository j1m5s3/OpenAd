"""Entry point: ``uv run python -m openad.indexer``."""

from __future__ import annotations

import asyncio

from openad.chain.client import make_web3
from openad.chain.deployments import load_deployment
from openad.config import get_settings
from openad.db.session import Database
from openad.health import Liveness, stale_after_seconds, start_liveness_server_from_env
from openad.indexer.runner import IndexerRunner
from openad.logging import configure_logging, get_logger


async def main() -> None:
    settings = get_settings()
    configure_logging(settings.log_level, json_output=not settings.is_dev)
    log = get_logger(__name__)

    deployment = load_deployment(settings.deployments_path, settings.chain_id)
    if not deployment.protocol_contracts:
        log.warning(
            "indexer.nothing_to_index",
            hint="deployments artifact has no protocol contracts yet (ROADMAP 1.4)",
        )
    liveness = Liveness(stale_after_seconds(settings.indexer_poll_seconds))
    start_liveness_server_from_env(liveness)  # no-op unless Cloud Run's $PORT is set
    db = Database(settings.database_url, settings)
    try:
        runner = IndexerRunner(
            settings, db.sessions, deployment, make_web3(settings.rpc_url), liveness=liveness
        )
        await runner.run_forever()
    finally:
        await db.dispose()


if __name__ == "__main__":
    asyncio.run(main())
