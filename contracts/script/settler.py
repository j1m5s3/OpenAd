"""Which address `CampaignVault.set_settler` gets (docs/PROTOCOL.md section 10).

The settler process signs `settle_batch` with a hot key (`OPENAD_SETTLER_KEY`,
docs/deploy-gcp.md section 5). Off Anvil and pyevm that key must belong to a dedicated,
gas-only EOA, never an owner-side key: the deployer owns every protocol contract until
ownership moves (to a Safe on Base), so a leaked settler key would otherwise be a leaked owner
key (`set_settler`, `set_treasury`, `set_fee_bps`, `AdSlot.set_market`;
docs/threat-model.md T20).

Pure: no boa and no network. `deploy.py` and `set_settler.py` both call `resolve_settler`.
"""

from __future__ import annotations

import re
from collections.abc import Mapping

from eth_utils import is_checksum_address, to_checksum_address

SETTLER_ADDRESS_ENV = "OPENAD_SETTLER_ADDRESS"
SETTLER_RUNBOOK = "docs/deploy-sepolia.md"
# Networks where the settler may default to (or equal) the deployer: the in-process EVM and
# the local Anvil chain (31337), whose account #0 is a public Foundry key anyway.
LOCAL_NETWORKS = frozenset({"pyevm", "anvil"})

# 0x and 40 hex digits, any case (the EIP-55 check is separate).
HEX_ADDRESS = re.compile(r"0x[0-9a-fA-F]{40}")
_ZERO_ADDRESS = "0x" + "00" * 20


class SettlerAddressError(ValueError):
    """`OPENAD_SETTLER_ADDRESS` is missing or unusable on this network."""


def resolve_settler(
    network_name: str,
    deployer: str,
    configured: str | None,
    *,
    forbidden: Mapping[str, str] | None = None,
) -> str:
    """Return the settler address for a deploy (or a rotation) on `network_name`.

    `deployer` is the EOA that deployed the protocol contracts (and owned them first).
    `forbidden` maps a role to another owner-side address the settler may not be either, e.g.
    `{"the CampaignVault owner": vault.owner()}` for a rotation after ownership moved to a
    Safe. `configured` is the raw `OPENAD_SETTLER_ADDRESS` value; unset, empty and blank all
    mean "not configured".

    * pyevm and anvil: `configured`, or else `deployer` (local dev and the compose stack keep
      Anvil #0).
    * Any other network: `configured` is required. It must be a 20-byte hex address, not the
      zero address, and neither `deployer` nor a `forbidden` address (compared
      case-insensitively).

    A configured address must be well formed everywhere, and mixed-case input must carry a
    valid EIP-55 checksum. The result is checksummed. Raises `SettlerAddressError`, naming
    `OPENAD_SETTLER_ADDRESS` and the runbook.
    """
    value = (configured or "").strip()
    if not value:
        if network_name in LOCAL_NETWORKS:
            return deployer
        raise SettlerAddressError(
            f"{SETTLER_ADDRESS_ENV} is required on network {network_name!r}: set it to the "
            f"address of a dedicated, gas-only settler EOA, never the deployer or an owner "
            f"(see {SETTLER_RUNBOOK})"
        )
    if not HEX_ADDRESS.fullmatch(value):
        raise SettlerAddressError(
            f"{SETTLER_ADDRESS_ENV}={value!r} is not a 20-byte hex address "
            f"(0x followed by 40 hex digits; see {SETTLER_RUNBOOK})"
        )
    digits = value[2:]
    mixed_case = digits != digits.lower() and digits != digits.upper()
    if mixed_case and not is_checksum_address(value):
        raise SettlerAddressError(
            f"{SETTLER_ADDRESS_ENV}={value!r} fails its EIP-55 checksum; copy the address "
            f"again (see {SETTLER_RUNBOOK})"
        )
    if value.lower() == _ZERO_ADDRESS:
        raise SettlerAddressError(
            f"{SETTLER_ADDRESS_ENV} is the zero address; set it to a dedicated, gas-only "
            f"settler EOA (see {SETTLER_RUNBOOK})"
        )
    if network_name not in LOCAL_NETWORKS:
        refused = {"the deployer": deployer, **(forbidden or {})}
        for role, address in refused.items():
            if value.lower() == address.lower():
                raise SettlerAddressError(
                    f"{SETTLER_ADDRESS_ENV} is {address}, {role}, on network "
                    f"{network_name!r}. An owner-side key must never sit in the settler "
                    f"process: use a dedicated, gas-only settler EOA (see {SETTLER_RUNBOOK})"
                )
    return str(to_checksum_address(value))
