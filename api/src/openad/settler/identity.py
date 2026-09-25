"""Startup identity check for the settler key (ARCHITECTURE §3.9; threat model T20).

The settler key must belong to a dedicated, gas-only EOA whose only power is
``CampaignVault.settle_batch``. If it is the vault's owner, whoever takes the container's key
also gets ``set_settler``, ``set_treasury`` and ``set_fee_bps``, and, because the deployer owns
every protocol contract, ``AdSlot.set_market`` (a lease rewrite). If it is the deployer, it
owns the contracts that still have their deploy-time owner even after the vault's ownership
moved (to a Safe on Base). So off the local Anvil chain (31337) the process refuses to start
with the owner's or the deployer's key; on 31337, where the deploy makes Anvil #0 the deployer,
the owner, the settler and the treasury, it only warns.

``check_identity`` is pure. ``read_vault_roles`` reads the chain id and the vault's roles over
RPC, and ``read_artifact_deployer`` reads the deployer that ``<chainId>.json`` records; an
error in either is fatal to the caller, and Cloud Run restarts the container.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from web3 import AsyncWeb3

from openad.chain.deployments import Deployment, DeploymentsError

LOCAL_CHAIN_ID = 31337

KEY_IS_OWNER = "settler.key_is_owner"
KEY_IS_DEPLOYER = "settler.key_is_deployer"
NOT_CURRENT_SETTLER = "settler.not_current_settler"
KEY_IS_TREASURY = "settler.key_is_treasury"
CHAIN_MISMATCH = "settler.chain_mismatch"

_HEX_ADDRESS = re.compile(r"0x[0-9a-fA-F]{40}")


@dataclass(frozen=True)
class Finding:
    """One finding; ``event`` is the structlog event it is logged under."""

    event: str
    detail: str


@dataclass(frozen=True)
class IdentityFindings:
    fatal: tuple[Finding, ...] = ()
    warnings: tuple[Finding, ...] = ()


@dataclass(frozen=True)
class VaultRoles:
    """What the RPC reports: its chain id and ``CampaignVault``'s role holders."""

    chain_id: int
    owner: str
    settler: str
    treasury: str


def _same(a: str, b: str) -> bool:
    return a.lower() == b.lower()


def check_identity(
    address: str, owner: str, settler: str, treasury: str, chain_id: int, *, deployer: str
) -> IdentityFindings:
    """Classify the settler key's ``address`` against the vault's roles on ``chain_id``, and
    against the ``deployer`` that the deployments artifact records.

    * ``address`` is ``owner()``: fatal off chain 31337 (``settler.key_is_owner``), a warning
      on it.
    * ``address`` is the deployer: fatal off chain 31337 (``settler.key_is_deployer``), a
      warning on it. That catches the deployer's key after the vault's ownership has moved.
    * ``address`` is not ``settler()``: a warning (``settler.not_current_settler``). That is a
      rotation in progress: batches revert with "not settler", and the runner leaves those
      clicks unsettled and retries them.
    * ``address`` is ``treasury()``: a warning (``settler.key_is_treasury``), because protocol
      fees would then sit on a hot key.

    On chain 31337 every finding is a warning. Addresses compare case-insensitively.
    """
    fatal: list[Finding] = []
    warnings: list[Finding] = []
    refused = warnings if chain_id == LOCAL_CHAIN_ID else fatal
    if _same(address, owner):
        refused.append(
            Finding(
                KEY_IS_OWNER,
                "the settler key owns CampaignVault (and, via the deploy, every protocol "
                "contract); use a dedicated, gas-only settler EOA (docs/deploy-sepolia.md)",
            )
        )
    if _same(address, deployer):
        refused.append(
            Finding(
                KEY_IS_DEPLOYER,
                "the settler key is the deployer that the deployments artifact records, an "
                "owner-side key; use a dedicated, gas-only settler EOA (docs/deploy-sepolia.md)",
            )
        )
    if not _same(address, settler):
        warnings.append(
            Finding(
                NOT_CURRENT_SETTLER,
                "the key is not CampaignVault.settler(), so its batches revert with "
                "'not settler' and stay unsettled until set_settler points at it (a rotation "
                "in progress?)",
            )
        )
    if _same(address, treasury):
        warnings.append(
            Finding(
                KEY_IS_TREASURY,
                "the key is CampaignVault.treasury(), so protocol fees sit on a hot key",
            )
        )
    return IdentityFindings(fatal=tuple(fatal), warnings=tuple(warnings))


def startup_findings(
    address: str, roles: VaultRoles, configured_chain_id: int, *, deployer: str
) -> IdentityFindings:
    """``check_identity`` on the chain the RPC actually serves, plus a chain-id cross-check.

    A key is judged against the chain it would sign on, so ``OPENAD_CHAIN_ID=31337`` pointed at
    a real network can't turn the owner refusal into a warning: a mismatch is fatal
    (``settler.chain_mismatch``). The runner signs with ``OPENAD_CHAIN_ID``, so its
    transactions would fail on that RPC anyway.
    """
    found = check_identity(
        address, roles.owner, roles.settler, roles.treasury, roles.chain_id, deployer=deployer
    )
    if roles.chain_id == configured_chain_id:
        return found
    mismatch = Finding(
        CHAIN_MISMATCH,
        f"OPENAD_CHAIN_ID is {configured_chain_id}, but the RPC serves chain {roles.chain_id}",
    )
    return IdentityFindings(fatal=(mismatch, *found.fatal), warnings=found.warnings)


def read_artifact_deployer(directory: Path, chain_id: int) -> str:
    """The ``deployer`` that ``<chainId>.json`` records (ARCHITECTURE §4.1).

    ``openad.chain.deployments`` doesn't keep that field, so it is read here. A missing or
    malformed value raises ``DeploymentsError``: the check fails closed.
    """
    path = directory / f"{chain_id}.json"
    raw = json.loads(path.read_text(encoding="utf-8"))
    deployer = raw.get("deployer") if isinstance(raw, dict) else None
    if not isinstance(deployer, str) or not _HEX_ADDRESS.fullmatch(deployer):
        raise DeploymentsError(f"{path} records no valid deployer address: {deployer!r}")
    return deployer


async def read_vault_roles(w3: AsyncWeb3[Any], deployment: Deployment) -> VaultRoles:
    """Read the RPC's chain id and ``CampaignVault``'s ``owner()``, ``settler()`` and
    ``treasury()``. Raises on any RPC or ABI error; the caller treats that as fatal."""
    info = deployment.require("CampaignVault")
    vault = w3.eth.contract(address=AsyncWeb3.to_checksum_address(info.address), abi=info.abi)
    chain_id = int(await w3.eth.chain_id)
    owner = await vault.functions.owner().call()
    settler = await vault.functions.settler().call()
    treasury = await vault.functions.treasury().call()
    return VaultRoles(
        chain_id=chain_id, owner=str(owner), settler=str(settler), treasury=str(treasury)
    )
