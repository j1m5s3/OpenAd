"""Entry point: ``uv run python -m openad.settler``.

Startup order (ARCHITECTURE §3.9): the key, the deployments artifact, the identity check
(``openad.settler.identity``), and only then the liveness listener, so a revision that was
given the vault owner's or the deployer's key exits (off chain 31337) before it can ever look
healthy.
"""

from __future__ import annotations

import asyncio
import sys

from eth_account import Account

from openad.chain.client import make_web3
from openad.chain.deployments import load_deployment
from openad.db.session import Database
from openad.health import Liveness, stale_after_seconds, start_liveness_server_from_env
from openad.logging import configure_logging, get_logger
from openad.settler.identity import read_artifact_deployer, read_vault_roles, startup_findings
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
    w3 = make_web3(settings.rpc_url)
    try:
        deployer = read_artifact_deployer(settings.deployments_path, settings.chain_id)
        roles = await read_vault_roles(w3, deployment)
    except Exception:
        # Fatal: never settle with an unchecked key. Cloud Run restarts the container.
        log.exception("settler.identity_check_failed", address=account.address)
        sys.exit(1)
    findings = startup_findings(account.address, roles, settings.chain_id, deployer=deployer)
    context = {
        "address": account.address,
        "owner": roles.owner,
        "deployer": deployer,
        "settler": roles.settler,
        "treasury": roles.treasury,
        "chain_id": roles.chain_id,
    }
    for finding in findings.warnings:
        log.warning(finding.event, detail=finding.detail, **context)
    for finding in findings.fatal:
        log.error(finding.event, detail=finding.detail, **context)
    if findings.fatal:
        sys.exit(1)
    log.info("settler.identity_checked", **context)
    # Only now: a key the check refused never gets a listener, so it never looks healthy.
    liveness = Liveness(stale_after_seconds(settings.settler_poll_seconds))
    start_liveness_server_from_env(liveness)  # no-op unless Cloud Run's $PORT is set
    db = Database(settings.database_url, settings)
    try:
        runner = SettlerRunner(settings, db.sessions, deployment, w3, account, liveness=liveness)
        await runner.run_forever()
    finally:
        await db.dispose()


if __name__ == "__main__":
    asyncio.run(main())
