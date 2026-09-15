"""Entry point: ``uv run python -m openad.settler``."""

from __future__ import annotations

import asyncio
import sys

from eth_account import Account

from openad.chain.client import make_web3
from openad.chain.deployments import load_deployment
from openad.db.session import Database
from openad.logging import configure_logging, get_logger
from openad.settler.runner import SettlerRunner
from openad.settler.settings import SettlerSettings


async def main() -> None:
    settings = SettlerSettings()
    configure_logging(settings.log_level, json_output=settings.env not in {"dev", "test"})
    log = get_logger(__name__)
    if not settings.settler_key:
        log.error("settler.missing_key")
        sys.exit(1)
    account = Account.from_key(settings.settler_key)
    deployment = load_deployment(settings.deployments_path, settings.chain_id)
    db = Database(settings.database_url)
    try:
        runner = SettlerRunner(
            settings, db.sessions, deployment, make_web3(settings.rpc_url), account
        )
        await runner.run_forever()
    finally:
        await db.dispose()


if __name__ == "__main__":
    asyncio.run(main())
