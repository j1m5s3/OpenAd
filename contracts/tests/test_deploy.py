"""Deploy script and deployments-artifact writer (docs/ARCHITECTURE.md section 4.1)."""

from __future__ import annotations

import json

from script import deploy as deploy_script
from script.artifacts import ContractRecord, build_artifact, read_artifact, write_artifact


def test_deploy_on_pyevm_deploys_usdc_and_skips_protocol_until_implemented(capsys):
    deployed = deploy_script.deploy()
    assert set(deployed) == {"USDC"}  # protocol contracts pending: ROADMAP 1.1-1.4
    assert deployed["USDC"].decimals() == 6
    out = capsys.readouterr().out
    assert "not implemented yet" in out
    assert "wrote" not in out  # pyevm never writes an artifact file


def test_artifact_roundtrip(tmp_path):
    artifact = build_artifact(
        chain_id=31337,
        network="anvil",
        deployer="0x" + "ab" * 20,
        contracts={
            "USDC": ContractRecord(address="0x" + "01" * 20, start_block=7, abi=[]),
            "AdSlot": ContractRecord(address="0x" + "02" * 20, start_block=8, abi=[{"type": "fallback"}]),
        },
    )
    path = write_artifact(artifact, directory=tmp_path)

    assert path == tmp_path / "31337.json"
    raw = path.read_bytes()
    assert b"\r\n" not in raw and raw.endswith(b"\n")  # LF + trailing newline for Node/Python
    loaded = read_artifact(31337, directory=tmp_path)
    assert loaded == json.loads(raw)
    assert list(loaded["contracts"]) == ["AdSlot", "USDC"]  # sorted, deterministic diffs
    assert loaded["contracts"]["AdSlot"] == {
        "address": "0x" + "02" * 20,
        "startBlock": 8,
        "abi": [{"type": "fallback"}],
    }
    assert loaded["deployedAt"].endswith("Z")
    assert loaded["artifactVersion"] == 1
