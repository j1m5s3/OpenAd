"""Deploy the OpenAd protocol and write the deployments artifact.

Usage
    uv run mox run deploy                      # pyevm (in-process), used by tests
    uv run mox run deploy --network anvil      # local Anvil (docker compose up -d anvil)
    OPENAD_SETTLER_ADDRESS=0x... uv run mox run deploy --network base-sepolia

Order and parameters are normative in docs/PROTOCOL.md section 10:
    CreativeRegistry -> AdSlot -> Marketplace(USDC, AdSlot, CreativeRegistry)
    -> CampaignVault(USDC, AdSlot, CreativeRegistry, Marketplace)
    -> AdSlot.set_market -> Marketplace.set_campaign_vault
    -> Marketplace.set_treasury / set_fee_bps
    -> CampaignVault.set_treasury / set_fee_bps / set_settler(<dedicated settler EOA>)
    -> CreativeRegistry.set_moderator

The settler is OPENAD_SETTLER_ADDRESS (script/settler.py): a dedicated, gas-only EOA, required
off Anvil and pyevm and never the deployer there; only Anvil and pyevm default it to the
deployer. It is resolved before the first transaction, so a bad value spends no gas. Rotate
it later with script/set_settler.py.
"""

from __future__ import annotations

import json
import os
import urllib.request
import warnings
from pathlib import Path
from typing import Any

import boa
from moccasin.boa_tools import VyperContract
from moccasin.config import get_active_network

from script.artifacts import ContractRecord, build_artifact, write_artifact
from script.settler import SETTLER_ADDRESS_ENV, resolve_settler
from src import AdSlot, CreativeRegistry, Marketplace, CampaignVault
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


def _purge_anvil_fork_cache() -> None:
    """Drop titanoboa's on-disk fork cache for chain 31337.

    CachingRPC keys Anvil as chainid_0x7a69 and treats the block tag ``latest`` as a
    stable key. A previous session's Marketplace bytecode (before ``set_campaign_vault``)
    then poisons ``eth_getCode`` and boa simulates ``Unknown contract …0xf5d4d4fa``.
    """
    cache_dir = Path.home() / ".cache" / "titanoboa" / "fork"
    if not cache_dir.is_dir():
        return
    for path in cache_dir.glob("chainid_0x7a69*"):
        try:
            path.unlink()
            print(f"[deploy] removed stale boa fork cache {path}")
        except OSError as exc:
            warnings.warn(f"could not remove {path}: {exc}", stacklevel=2)


def _eth_get_code(address: str, rpc_url: str = "http://127.0.0.1:8545") -> bytes:
    payload = json.dumps(
        {"jsonrpc": "2.0", "id": 1, "method": "eth_getCode", "params": [address, "latest"]}
    )
    req = urllib.request.Request(
        rpc_url, data=payload.encode(), headers={"content-type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=10) as resp:  # noqa: S310 - configured RPC url
        result = json.loads(resp.read())["result"]
    hex_body = result[2:] if isinstance(result, str) and result.startswith("0x") else str(result)
    return bytes.fromhex(hex_body)


def _patch_anvil_boa() -> None:
    """Make titanoboa usable against a fresh Anvil without a local keystore.

    * Unlocked ``eth_accounts`` (Foundry #0) sign via ``eth_sendTransaction``.
    * CREATE address can diverge from the local fork; rebind to the node address.
    * ``eth_getCode`` is read uncached so a stale ``latest`` fork DB cannot hide
      newly deployed methods such as ``set_campaign_vault``.
    """
    from boa.network import NetworkEnv, _EstimateGasFailed
    from boa.util.abi import Address

    env = boa.env
    rpc = getattr(env, "_rpc", None)
    if rpc is not None and hasattr(env, "add_accounts_from_rpc"):
        env.add_accounts_from_rpc(rpc)
        anvil0 = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
        accounts = getattr(env, "_accounts", {})
        if anvil0 in accounts:
            env.eoa = anvil0
            print(f"[deploy] using Anvil unlocked account {anvil0}")

    orig_get_code = env.evm.get_code

    def get_code_uncached(address):  # type: ignore[no-untyped-def]
        checksum = str(Address(address))
        if rpc is not None:
            raw = rpc.fetch_uncached("eth_getCode", [checksum, "latest"])
            if isinstance(raw, str) and raw not in {"", "0x", "0X"}:
                hex_body = raw[2:] if raw.startswith(("0x", "0X")) else raw
                return bytes.fromhex(hex_body)
        return orig_get_code(address)

    env.evm.get_code = get_code_uncached  # type: ignore[method-assign]

    orig_deploy = NetworkEnv.deploy

    def deploy(  # type: ignore[no-untyped-def]
        self, sender=None, gas=None, value=0, bytecode=b"", contract=None, **kwargs
    ):
        try:
            return orig_deploy(
                self,
                sender=sender,
                gas=gas,
                value=value,
                bytecode=bytecode,
                contract=contract,
                **kwargs,
            )
        except RuntimeError as exc:
            text = str(exc)
            if "uh oh!" not in text or " != " not in text:
                raise
            create = text.split(" != ", 1)[1].strip()
            warnings.warn(f"titanoboa CREATE skew; using node address {create}", stacklevel=2)
            print(f"[deploy] boa CREATE skew; using node address {create}")

            class _Computation:
                is_error = False
                output = _eth_get_code(create)

            return Address(create), _Computation()

    NetworkEnv.deploy = deploy  # type: ignore[method-assign]

    orig_execute = NetworkEnv.execute_code

    def execute_code(  # type: ignore[no-untyped-def]
        self,
        to_address,
        sender=None,
        gas=None,
        value=0,
        data=b"",
        simulate=False,
        **kwargs,
    ):
        try:
            return orig_execute(
                self,
                to_address,
                sender=sender,
                gas=gas,
                value=value,
                data=data,
                simulate=simulate,
                **kwargs,
            )
        except Exception as exc:
            if simulate:
                raise
            text = str(exc)
            is_gas = isinstance(exc, _EstimateGasFailed)
            if not is_gas and "Unknown contract" not in text and type(exc) is not AssertionError:
                raise
            print(f"[deploy] local sim failed ({text}); sending via Anvil RPC")
            sender = self._get_sender(sender)
            self._send_txn(
                from_=sender,
                to=to_address,
                gas=gas,
                value=value,
                data=data,
            )

            class _Computation:
                is_error = False
                output = b""

            return _Computation()

    NetworkEnv.execute_code = execute_code  # type: ignore[method-assign]


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
    """Mint two LEASE demo slots plus one CPC slot; buy one LEASE period (local only)."""
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
    market.set_terms(slot_a, start_price, floor_price, lead, 0, 0, 0, 0)
    market.set_terms(slot_b, start_price, floor_price, lead, 0, 0, 0, 0)
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
    spec_c = (300, 250, 0, "demo-cpc.example")
    slot_c = ad_slot.mint_slot(spec_c)
    market.set_terms(slot_c, 0, 0, 0, 0, 0, 1, 100_000)
    print(
        f"[deploy] seeded slots {slot_a},{slot_b},{slot_c} creative {cid} "
        f"purchased period 0 of slot {slot_a}; slot {slot_c} CPC"
    )


def deploy_protocol(usdc: VyperContract, settler: str) -> dict[str, VyperContract]:
    """Deploy and wire CreativeRegistry, AdSlot, Marketplace, CampaignVault (ROADMAP 1.4).

    `settler` is the address `resolve_settler` (script/settler.py) returned. The treasury and
    the moderator stay the deployer: they are owner-side roles (PROTOCOL section 10), not hot
    keys.
    """
    try:
        network_name = get_active_network().name
    except ValueError:
        network_name = "pyevm"
    # Re-applied here, before the first deploy, so no caller can make the deployer the settler
    # off Anvil and pyevm.
    settler = resolve_settler(network_name, str(boa.env.eoa), settler)
    base_uri = LOCAL_BASE_URI
    if network_name == "base-sepolia":
        base_uri = SEPOLIA_BASE_URI
    elif network_name == "base":
        base_uri = "https://api.openad.xyz/v1/slots/"

    registry = CreativeRegistry.deploy()
    ad_slot = AdSlot.deploy(AD_SLOT_NAME, AD_SLOT_SYMBOL, base_uri)
    market = Marketplace.deploy(usdc.address, ad_slot.address, registry.address)
    vault = CampaignVault.deploy(usdc.address, ad_slot.address, registry.address, market.address)
    ad_slot.set_market(market.address)
    market.set_campaign_vault(vault.address)
    market.set_treasury(boa.env.eoa)
    market.set_fee_bps(DEFAULT_FEE_BPS)
    vault.set_treasury(boa.env.eoa)
    vault.set_fee_bps(DEFAULT_FEE_BPS)
    vault.set_settler(settler)
    registry.set_moderator(boa.env.eoa)
    if network_name in {"anvil", "pyevm"}:
        _seed_demo(usdc, registry, ad_slot, market)
    return {
        "CreativeRegistry": registry,
        "AdSlot": ad_slot,
        "Marketplace": market,
        "CampaignVault": vault,
    }


def deploy() -> dict[str, VyperContract]:
    try:
        network = get_active_network()
        network_name = network.name
        chain_id = network.chain_id
    except ValueError:
        network = None
        network_name = "pyevm"
        chain_id = 31337

    # Capture before deploys: after seed the head is the buy tx, and the indexer
    # would skip SlotMinted / CalendarSet / TermsSet (those land a few blocks earlier).
    if network_name == "anvil":
        _purge_anvil_fork_cache()
        _patch_anvil_boa()
    # After the Anvil patch binds the deployer, before the first transaction: a missing or
    # bad OPENAD_SETTLER_ADDRESS fails here, before any gas is spent.
    configured = os.environ.get(SETTLER_ADDRESS_ENV)
    settler = resolve_settler(network_name, str(boa.env.eoa), configured)
    source = SETTLER_ADDRESS_ENV if (configured or "").strip() else "the deployer, local only"
    print(f"[deploy] settler {settler} ({source})")
    start_block = _current_block_number(network) if network is not None else 0
    deployed: dict[str, VyperContract] = {"USDC": deploy_usdc()}
    deployed.update(deploy_protocol(deployed["USDC"], settler))
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
