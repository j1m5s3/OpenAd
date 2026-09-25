"""Rotate the CampaignVault settler (docs/deploy-sepolia.md, "Settler EOA").

Usage
    OPENAD_SETTLER_ADDRESS=0x... uv run mox run set_settler --network base-sepolia
    OPENAD_SETTLER_ADDRESS=0x... uv run mox run set_settler --network anvil
    OPENAD_SETTLER_ADDRESS=0x... uv run mox run set_settler --network base  # prints a Safe tx

Loads `CampaignVault` (address and ABI) and the recorded `deployer` from
`deployments/<chainId>.json`, and resolves the new settler with
`script.settler.resolve_settler`, the rule `deploy.py` uses: off Anvil and pyevm,
`OPENAD_SETTLER_ADDRESS` is required and may be neither the deployer nor the vault's current
`owner()`. Both are checked because ownership can move (to a Safe on Base) while the deployer
EOA still exists. Then it sends `set_settler` from the owner and prints the new `settler()`.

On `base` the owner is a Safe (docs/deploy-mainnet.md), so nothing is sent there: the script
prints the transaction (`to`, `value`, `data`) to propose from the Safe.

Until `openad-settler` runs with the new key, its batches revert with "not settler"; the
settler process leaves those clicks unsettled and retries them.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, NamedTuple

import boa
from moccasin.config import get_active_network

from script.artifacts import DEPLOYMENTS_DIR, read_artifact
from script.deploy import _patch_anvil_boa, _purge_anvil_fork_cache
from script.settler import HEX_ADDRESS, SETTLER_ADDRESS_ENV, resolve_settler

# Networks where the CampaignVault owner is a Safe: print the Safe transaction, never send.
SAFE_OWNED_NETWORKS = frozenset({"base"})


class RotationError(RuntimeError):
    """The rotation can't be sent as configured (for example, the sender isn't the owner)."""


class LoadedVault(NamedTuple):
    """`CampaignVault` as `<chainId>.json` records it, with the artifact's `deployer`."""

    vault: Any
    deployer: str


def load_vault(chain_id: int, directory: Path = DEPLOYMENTS_DIR) -> LoadedVault:
    """`CampaignVault` (address and ABI) and the `deployer` recorded in `<chainId>.json`."""
    path = directory / f"{chain_id}.json"
    if not path.exists():
        raise RotationError(f"no deployments artifact at {path}; run the deploy script first")
    artifact = read_artifact(chain_id, directory)
    deployer = artifact.get("deployer")
    if not isinstance(deployer, str) or not HEX_ADDRESS.fullmatch(deployer):
        # Fail closed: without it the rotation can't refuse the deployer as the new settler.
        raise RotationError(f"{path} records no valid deployer address ({deployer!r})")
    record = artifact["contracts"]["CampaignVault"]
    factory = boa.loads_abi(json.dumps(record["abi"]), name="CampaignVault")
    return LoadedVault(factory.at(record["address"]), deployer)


def set_settler_calldata(vault: Any, settler: str) -> str:
    """Hex calldata of `vault.set_settler(settler)`, for a Safe transaction."""
    return "0x" + bytes(vault.set_settler.prepare_calldata(settler)).hex()


def rotate_settler(
    vault: Any,
    *,
    network_name: str,
    deployer: str,
    sender: str | None,
    configured: str | None,
) -> str:
    """Point `vault` at the resolved settler and return `settler()` afterwards.

    `deployer` is the artifact's. On a Safe-owned network nothing is sent: the Safe
    transaction is printed, and the current settler is returned unchanged.
    """
    owner = str(vault.owner())
    current = str(vault.settler())
    # The deploy's rule, and the vault's current owner too: once ownership has moved to a
    # Safe, the new settler may be neither the Safe nor the EOA that deployed the contracts.
    new = resolve_settler(
        network_name, deployer, configured, forbidden={"the CampaignVault owner": owner}
    )
    print(
        f"[set_settler] network {network_name}, vault {vault.address}, owner {owner}, "
        f"deployer {deployer}"
    )
    print(f"[set_settler] settler {current} -> {new}")
    if new.lower() == current.lower():
        print("[set_settler] already the settler; nothing to send")
        return current
    if network_name in SAFE_OWNED_NETWORKS:
        print(
            "[set_settler] the owner is a Safe on this network, so nothing is sent. Propose "
            "this transaction from the Safe (docs/deploy-mainnet.md):"
        )
        print(f"  to     {vault.address}")
        print("  value  0")
        print(f"  data   {set_settler_calldata(vault, new)}")
        return current
    if sender is None or str(sender).lower() != owner.lower():
        raise RotationError(
            f"the sender {sender} is not the vault owner {owner}. Run with the owner's account; "
            f"if the owner is a Safe, propose {set_settler_calldata(vault, new)} to "
            f"{vault.address} from it"
        )
    vault.set_settler(new, sender=sender)
    after = str(vault.settler())
    print(f"[set_settler] settler() is now {after}")
    if after.lower() != new.lower():
        raise RotationError(f"set_settler was sent, but settler() reads {after}, not {new}")
    return after


def moccasin_main() -> str:
    try:
        network = get_active_network()
    except ValueError:  # no moccasin config: plain python or pytest, i.e. pyevm
        network = None
    if network is None or network.name == "pyevm":
        raise RotationError(
            "pyevm keeps no deployment to rotate; run with --network anvil, base-sepolia or base"
        )
    if network.name == "anvil":
        _purge_anvil_fork_cache()
        _patch_anvil_boa()
    loaded = load_vault(network.chain_id)
    return rotate_settler(
        loaded.vault,
        network_name=network.name,
        deployer=loaded.deployer,
        sender=boa.env.eoa,
        configured=os.environ.get(SETTLER_ADDRESS_ENV),
    )
