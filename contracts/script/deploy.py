"""Deploy the OpenAd protocol and write the deployments artifact.

Usage
    uv run mox run deploy                      # pyevm (in-process), used by tests
    uv run mox run deploy --network anvil      # local Anvil (docker compose up -d anvil)
    uv run mox run deploy --network base-sepolia

Order and parameters are normative in docs/PROTOCOL.md section 10:
    CreativeRegistry -> AdSlot -> Marketplace(USDC, AdSlot, CreativeRegistry)
    -> AdSlot.set_market -> Marketplace.set_treasury / set_fee_bps -> CreativeRegistry.set_moderator

Status: MockUSDC deploys today. The three protocol contracts are ROADMAP tasks 1.1-1.3; wiring
them here is task 1.4 (fill in `deploy_protocol`).
"""

from __future__ import annotations

import json
import urllib.request
from typing import Any

import boa
from moccasin.boa_tools import VyperContract
from moccasin.config import get_active_network

from script.artifacts import ContractRecord, build_artifact, write_artifact
from src.mocks import MockUSDC

# PROTOCOL.md section 10 defaults for local/staging. Production values are set by the platform.
DEFAULT_FEE_BPS = 250
AD_SLOT_NAME = "OpenAd Slot"
AD_SLOT_SYMBOL = "OASLT"
LOCAL_BASE_URI = "http://localhost:8000/v1/slots/"

# Anvil funds account #0; on pyevm/anvil we mint mock USDC to these test personas.
LOCAL_MINT_USDC = 1_000_000 * 10**6  # 1,000,000 USDC


def _current_block_number(network: Any) -> int:
    """Best-effort block number for `startBlock`. pyevm has no meaningful history -> 0."""
    if network.name == "pyevm":
        return 0
    try:
        payload = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "eth_blockNumber", "params": []})
        req = urllib.request.Request(
            network.url, data=payload.encode(), headers={"content-type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=10) as resp:  # noqa: S310 - configured RPC url
            return int(json.loads(resp.read())["result"], 16)
    except Exception:  # noqa: BLE001 - artifact must still be written
        return 0


def deploy_usdc() -> VyperContract:
    """Bind the network's named `usdc` contract, or deploy MockUSDC on local networks."""
    network = get_active_network()
    named = network.get_named_contract("usdc")
    if named is not None and named.address:
        return MockUSDC.at(named.address)  # real USDC shares the IERC20 + permit ABI surface we use
    usdc = MockUSDC.deploy()
    usdc.mint(boa.env.eoa, LOCAL_MINT_USDC)
    return usdc


def deploy_protocol(usdc: VyperContract) -> dict[str, VyperContract]:
    """Deploy and wire CreativeRegistry, AdSlot, Marketplace (ROADMAP 1.4).

    Expected body once the contracts exist (keep this order):

        from src import AdSlot, CreativeRegistry, Marketplace
        registry = CreativeRegistry.deploy()
        ad_slot = AdSlot.deploy(AD_SLOT_NAME, AD_SLOT_SYMBOL, base_uri)
        market = Marketplace.deploy(usdc.address, ad_slot.address, registry.address)
        ad_slot.set_market(market.address)
        market.set_treasury(treasury)
        market.set_fee_bps(DEFAULT_FEE_BPS)
        registry.set_moderator(moderator)
        return {"CreativeRegistry": registry, "AdSlot": ad_slot, "Marketplace": market}
    """
    raise NotImplementedError("Protocol contracts are not implemented yet (ROADMAP 1.1-1.4).")


def deploy() -> dict[str, VyperContract]:
    network = get_active_network()
    deployed: dict[str, VyperContract] = {"USDC": deploy_usdc()}
    try:
        deployed.update(deploy_protocol(deployed["USDC"]))
    except NotImplementedError as exc:
        print(f"[deploy] {exc}")

    start_block = _current_block_number(network)
    artifact = build_artifact(
        chain_id=network.chain_id,
        network=network.name,
        deployer=str(boa.env.eoa),
        contracts={
            name: ContractRecord(address=str(c.address), start_block=start_block, abi=c.abi)
            for name, c in deployed.items()
        },
    )
    if network.name != "pyevm":
        path = write_artifact(artifact)
        print(f"[deploy] wrote {path}")
    for name, contract in deployed.items():
        print(f"[deploy] {name:17s} {contract.address}")
    return deployed


def moccasin_main() -> dict[str, VyperContract]:
    return deploy()
