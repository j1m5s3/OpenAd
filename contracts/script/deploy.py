"""Deploy the OpenAd protocol and write the deployments artifact.

Usage
    uv run mox run deploy                      # pyevm (in-process), used by tests
    uv run mox run deploy --network anvil      # local Anvil (docker compose up -d anvil)
    uv run mox run deploy --network base-sepolia

Order and parameters are normative in docs/PROTOCOL.md section 10:
    CreativeRegistry -> AdSlot -> Marketplace(USDC, AdSlot, CreativeRegistry)
    -> AdSlot.set_market -> Marketplace.set_treasury / set_fee_bps -> CreativeRegistry.set_moderator
"""

from __future__ import annotations

import json
import urllib.request
from typing import Any

import boa
from moccasin.boa_tools import VyperContract
from moccasin.config import get_active_network

from script.artifacts import ContractRecord, build_artifact, write_artifact
from src import AdSlot, CreativeRegistry, Marketplace
from src.mocks import MockUSDC

DEFAULT_FEE_BPS = 250
AD_SLOT_NAME = "OpenAd Slot"
AD_SLOT_SYMBOL = "OASLT"
LOCAL_BASE_URI = "http://localhost:8000/v1/slots/"
SEPOLIA_BASE_URI = "https://api.openad.example/v1/slots/"

LOCAL_MINT_USDC = 1_000_000 * 10**6
DEMO_HASH = bytes.fromhex("11" * 32)


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
    try:
        network = get_active_network()
    except ValueError:
        usdc = MockUSDC.deploy()
        usdc.mint(boa.env.eoa, LOCAL_MINT_USDC)
        return usdc
    named = network.get_named_contract("usdc")
    if named is not None and named.address:
        return MockUSDC.at(named.address)
    usdc = MockUSDC.deploy()
    usdc.mint(boa.env.eoa, LOCAL_MINT_USDC)
    return usdc


def _seed_demo(usdc: VyperContract, registry: VyperContract, ad_slot: VyperContract, market: VyperContract) -> None:
    """Mint two demo slots, terms, one approved creative, and buy one period (local only)."""
    now = int(boa.env.evm.patch.timestamp)
    period = 86_400
    lead = 14 * 86_400
    first = now + 7 * 86_400
    start_price = 100 * 10**6
    floor_price = 10 * 10**6
    spec_a = (300, 250, 0, "demo-a.example")
    spec_b = (728, 90, 0, "demo-b.example")
    slot_a = ad_slot.mint_slot(spec_a)
    slot_b = ad_slot.mint_slot(spec_b)
    ad_slot.set_calendar(slot_a, period, first)
    ad_slot.set_calendar(slot_b, period, first)
    market.set_terms(slot_a, start_price, floor_price, lead, 0, 0)
    market.set_terms(slot_b, start_price, floor_price, lead, 0, 0)
    cid = registry.register_media(
        "https://placehold.co/300x250.png",
        DEMO_HASH,
        "image/png",
        300,
        250,
        "https://openad.example",
    )
    registry.request_approval(boa.env.eoa, cid)
    registry.set_approval(cid, True)
    usdc.approve(market.address, start_price)
    market.buy(slot_a, 0, cid, start_price)
    print(f"[deploy] seeded slots {slot_a},{slot_b} creative {cid} purchased period 0 of slot {slot_a}")


def deploy_protocol(usdc: VyperContract) -> dict[str, VyperContract]:
    """Deploy and wire CreativeRegistry, AdSlot, Marketplace (ROADMAP 1.4)."""
    try:
        network_name = get_active_network().name
    except ValueError:
        network_name = "pyevm"
    base_uri = LOCAL_BASE_URI
    if network_name == "base-sepolia":
        base_uri = SEPOLIA_BASE_URI
    elif network_name == "base":
        base_uri = "https://api.openad.xyz/v1/slots/"

    registry = CreativeRegistry.deploy()
    ad_slot = AdSlot.deploy(AD_SLOT_NAME, AD_SLOT_SYMBOL, base_uri)
    market = Marketplace.deploy(usdc.address, ad_slot.address, registry.address)
    ad_slot.set_market(market.address)
    market.set_treasury(boa.env.eoa)
    market.set_fee_bps(DEFAULT_FEE_BPS)
    registry.set_moderator(boa.env.eoa)
    if network_name in {"anvil", "pyevm"}:
        _seed_demo(usdc, registry, ad_slot, market)
    return {"CreativeRegistry": registry, "AdSlot": ad_slot, "Marketplace": market}


def deploy() -> dict[str, VyperContract]:
    try:
        network = get_active_network()
        network_name = network.name
        chain_id = network.chain_id
    except ValueError:
        network = None
        network_name = "pyevm"
        chain_id = 31337

    deployed: dict[str, VyperContract] = {"USDC": deploy_usdc()}
    deployed.update(deploy_protocol(deployed["USDC"]))

    start_block = _current_block_number(network) if network is not None else 0
    artifact = build_artifact(
        chain_id=chain_id,
        network=network_name,
        deployer=str(boa.env.eoa),
        contracts={
            name: ContractRecord(address=str(c.address), start_block=start_block, abi=c.abi)
            for name, c in deployed.items()
        },
    )
    if network_name != "pyevm":
        path = write_artifact(artifact)
        print(f"[deploy] wrote {path}")
    for name, contract in deployed.items():
        print(f"[deploy] {name:17s} {contract.address}")
    return deployed


def moccasin_main() -> dict[str, VyperContract]:
    return deploy()
