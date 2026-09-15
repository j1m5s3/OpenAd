"""Load and validate ``contracts/deployments/<chainId>.json`` (docs/ARCHITECTURE.md 4.1)."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

SUPPORTED_ARTIFACT_VERSION = 1
PROTOCOL_CONTRACTS = ("AdSlot", "Marketplace", "CreativeRegistry", "CampaignVault")


class DeploymentsError(RuntimeError):
    pass


@dataclass(frozen=True)
class ContractInfo:
    name: str
    address: str
    start_block: int
    abi: list[dict[str, Any]]


@dataclass(frozen=True)
class Deployment:
    chain_id: int
    network: str
    contracts: dict[str, ContractInfo]

    def require(self, name: str) -> ContractInfo:
        try:
            return self.contracts[name]
        except KeyError as exc:
            raise DeploymentsError(f"contract {name!r} missing from deployments artifact") from exc

    @property
    def protocol_contracts(self) -> list[ContractInfo]:
        """The indexable protocol contracts present in the artifact."""
        return [self.contracts[n] for n in PROTOCOL_CONTRACTS if n in self.contracts]


def load_deployment(directory: Path, chain_id: int) -> Deployment:
    path = directory / f"{chain_id}.json"
    if not path.exists():
        raise DeploymentsError(
            f"no deployments artifact at {path}; run `uv run mox run deploy --network …`"
        )
    raw = json.loads(path.read_text(encoding="utf-8"))
    return parse_deployment(raw, expected_chain_id=chain_id)


def parse_deployment(raw: dict[str, Any], *, expected_chain_id: int | None = None) -> Deployment:
    version = raw.get("artifactVersion")
    if version != SUPPORTED_ARTIFACT_VERSION:
        raise DeploymentsError(f"unsupported artifactVersion {version!r}")
    chain_id = int(raw["chainId"])
    if expected_chain_id is not None and chain_id != expected_chain_id:
        raise DeploymentsError(f"artifact is for chain {chain_id}, expected {expected_chain_id}")

    contracts: dict[str, ContractInfo] = {}
    for name, entry in raw.get("contracts", {}).items():
        try:
            contracts[name] = ContractInfo(
                name=name,
                address=str(entry["address"]),
                start_block=int(entry["startBlock"]),
                abi=list(entry["abi"]),
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise DeploymentsError(f"malformed entry for contract {name!r}: {exc}") from exc
    return Deployment(chain_id=chain_id, network=str(raw.get("network", "")), contracts=contracts)
