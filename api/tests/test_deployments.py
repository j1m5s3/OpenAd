from __future__ import annotations

import json
from pathlib import Path

import pytest

from openad.chain.deployments import DeploymentsError, load_deployment, parse_deployment

RAW = {
    "artifactVersion": 1,
    "chainId": 31337,
    "network": "anvil",
    "deployedAt": "2026-09-08T00:00:00Z",
    "deployer": "0x" + "ab" * 20,
    "contracts": {
        "USDC": {"address": "0x" + "01" * 20, "startBlock": 0, "abi": []},
        "AdSlot": {"address": "0x" + "02" * 20, "startBlock": 12, "abi": [{"type": "fallback"}]},
    },
}


def test_parse_and_protocol_contracts() -> None:
    dep = parse_deployment(RAW, expected_chain_id=31337)
    assert dep.network == "anvil"
    assert dep.require("AdSlot").start_block == 12
    assert [c.name for c in dep.protocol_contracts] == ["AdSlot"]  # USDC is not indexed
    with pytest.raises(DeploymentsError):
        dep.require("Marketplace")


def test_rejects_wrong_chain_and_version() -> None:
    with pytest.raises(DeploymentsError):
        parse_deployment(RAW, expected_chain_id=8453)
    with pytest.raises(DeploymentsError):
        parse_deployment({**RAW, "artifactVersion": 2})


def test_load_from_directory(tmp_path: Path) -> None:
    (tmp_path / "31337.json").write_text(json.dumps(RAW), encoding="utf-8")
    assert load_deployment(tmp_path, 31337).chain_id == 31337
    with pytest.raises(DeploymentsError, match="no deployments artifact"):
        load_deployment(tmp_path, 84532)
