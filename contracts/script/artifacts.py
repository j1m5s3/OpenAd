"""Deployments artifact writer.

Produces `contracts/deployments/<chainId>.json`, the ONLY hand-off from contracts to the
off-chain packages. Schema: docs/ARCHITECTURE.md section 4.1.

Consumers: api (OPENAD_DEPLOYMENTS_DIR), web (scripts/sync-deployments.mjs). The embed never
reads it.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

DEPLOYMENTS_DIR = Path(__file__).resolve().parent.parent / "deployments"

ARTIFACT_VERSION = 1


@dataclass(frozen=True)
class ContractRecord:
    address: str
    start_block: int
    abi: list[dict[str, Any]]


def build_artifact(
    *,
    chain_id: int,
    network: str,
    deployer: str,
    contracts: dict[str, ContractRecord],
) -> dict[str, Any]:
    return {
        "artifactVersion": ARTIFACT_VERSION,
        "chainId": chain_id,
        "network": network,
        "deployedAt": datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "deployer": deployer,
        "contracts": {
            name: {"address": rec.address, "startBlock": rec.start_block, "abi": rec.abi}
            for name, rec in sorted(contracts.items())
        },
    }


def write_artifact(artifact: dict[str, Any], directory: Path = DEPLOYMENTS_DIR) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{artifact['chainId']}.json"
    # UTF-8 + LF regardless of platform; the file is consumed by Node and Python.
    path.write_text(json.dumps(artifact, indent=2) + "\n", encoding="utf-8", newline="\n")
    return path


def read_artifact(chain_id: int, directory: Path = DEPLOYMENTS_DIR) -> dict[str, Any]:
    path = directory / f"{chain_id}.json"
    return json.loads(path.read_text(encoding="utf-8"))
