"""Point AdSlot's token metadata at the API (docs/deploy-sepolia.md, "Metadata base URI").

Usage
    OPENAD_BASE_URI=<uri> uv run mox run set_base_uri --network base-sepolia --account <wallet>
    OPENAD_BASE_URI=<uri> uv run mox run set_base_uri --network anvil
    OPENAD_BASE_URI=<uri> uv run mox run set_base_uri --network base  # prints a Safe tx

where `<uri>` is the API's public URL plus `/v1/slots/`, e.g. `https://api.<domain>/v1/slots/`
(`http://localhost:8000/v1/slots/` on Anvil).

`AdSlot.tokenURI(id)` is `base_uri` followed by the decimal id, and the API answers
`GET /v1/slots/{id}` with the slot's metadata (docs/ARCHITECTURE.md §3.3), so the URI is the
API's public URL plus `/v1/slots/`. `resolve_base_uri` checks that shape before anything is
loaded or sent: it ends in `/v1/slots/`, has no query, fragment or credentials, fits
`AdSlot`'s `String[80]`, and off Anvil and pyevm uses https and a public host. The deploy
leaves Base Sepolia on a placeholder (`https://api.openad.example/v1/slots/`) until the staging
API has its lasting URL.

Loads `AdSlot` (address and ABI) from `deployments/<chainId>.json`, sends `set_base_uri` from
the owner, and prints `base_uri()` once the transaction lands. On `base` the owner is a Safe
(docs/deploy-mainnet.md), so nothing is sent there: the script prints the transaction (`to`,
`value`, `data`) to propose from the Safe.
"""

from __future__ import annotations

import ipaddress
import json
import os
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

import boa
from moccasin.config import get_active_network

from script.artifacts import DEPLOYMENTS_DIR, read_artifact
from script.deploy import _patch_anvil_boa, _purge_anvil_fork_cache
from script.receipts import require_canonical_receipts
from script.set_settler import SAFE_OWNED_NETWORKS
from script.settler import LOCAL_NETWORKS

BASE_URI_ENV = "OPENAD_BASE_URI"
# `AdSlot.base_uri` is a `String[80]` (contracts/src/AdSlot.vy): 80 bytes, not characters.
MAX_BASE_URI_BYTES = 80
SLOTS_PATH = "/v1/slots/"
# Names that never resolve on the public internet (RFC 2606, RFC 6761, mDNS). The deploy's
# placeholder host, `api.openad.example`, is one of them.
_RESERVED_SUFFIXES = (".example", ".invalid", ".test", ".localhost", ".local")


class BaseURIError(ValueError):
    """`OPENAD_BASE_URI` is missing or unusable, or the update can't be sent as configured."""


def _is_public_host(host: str) -> bool:
    try:
        return ipaddress.ip_address(host).is_global
    except ValueError:  # a DNS name, maybe fully qualified with a trailing dot
        name = host.rstrip(".")
        return "." in name and name != "localhost" and not name.endswith(_RESERVED_SUFFIXES)


def resolve_base_uri(network_name: str, configured: str | None) -> str:
    """The base URI to set on `network_name`, or `BaseURIError` saying what's wrong with it.

    Pure: no boa and no network, so `moccasin_main` can refuse a bad value before it loads the
    deployment or builds a transaction.
    """
    uri = (configured or "").strip()
    example = f"https://api.<domain>{SLOTS_PATH}"
    if not uri:
        raise BaseURIError(
            f"set {BASE_URI_ENV} to the API's public URL plus {SLOTS_PATH} ({example})"
        )
    if any(ch.isspace() for ch in uri):
        raise BaseURIError(f"{BASE_URI_ENV} {uri!r} contains whitespace")
    size = len(uri.encode("utf-8"))
    if size > MAX_BASE_URI_BYTES:
        raise BaseURIError(
            f"{BASE_URI_ENV} {uri!r} is {size} bytes; AdSlot.base_uri holds at most "
            f"{MAX_BASE_URI_BYTES}"
        )
    parts = urlsplit(uri)
    local = network_name in LOCAL_NETWORKS
    schemes = ("http", "https") if local else ("https",)
    if parts.scheme not in schemes:
        raise BaseURIError(
            f"{BASE_URI_ENV} {uri!r} must use {' or '.join(schemes)} on {network_name}"
        )
    host = (parts.hostname or "").lower()
    if not host:
        raise BaseURIError(f"{BASE_URI_ENV} {uri!r} has no host")
    if parts.username is not None or parts.password is not None:
        raise BaseURIError(f"{BASE_URI_ENV} must not carry credentials; it is public on chain")
    if "?" in uri or "#" in uri:
        raise BaseURIError(
            f"{BASE_URI_ENV} {uri!r} must not have a query or fragment: tokenURI appends the id"
        )
    if not parts.path.endswith(SLOTS_PATH):
        raise BaseURIError(
            f"{BASE_URI_ENV} {uri!r} must end in {SLOTS_PATH} (with the slash): tokenURI appends "
            f"the id, and the API serves slot metadata at {SLOTS_PATH}<id> ({example})"
        )
    if not local and not _is_public_host(host):
        raise BaseURIError(
            f"{BASE_URI_ENV} {uri!r} names {host}, which isn't a public host; use the API's "
            f"public URL on {network_name}"
        )
    return uri


def load_ad_slot(chain_id: int, directory: Path = DEPLOYMENTS_DIR) -> Any:
    """`AdSlot` (address and ABI) as `<chainId>.json` records it."""
    path = directory / f"{chain_id}.json"
    if not path.exists():
        raise BaseURIError(f"no deployments artifact at {path}; run the deploy script first")
    record = read_artifact(chain_id, directory).get("contracts", {}).get("AdSlot")
    if not isinstance(record, dict) or "address" not in record or "abi" not in record:
        raise BaseURIError(f"{path} records no AdSlot")
    factory = boa.loads_abi(json.dumps(record["abi"]), name="AdSlot")
    return factory.at(record["address"])


def set_base_uri_calldata(ad_slot: Any, uri: str) -> str:
    """Hex calldata of `ad_slot.set_base_uri(uri)`, for a Safe transaction."""
    return "0x" + bytes(ad_slot.set_base_uri.prepare_calldata(uri)).hex()


def point_base_uri(
    ad_slot: Any, *, network_name: str, sender: str | None, configured: str | None
) -> str:
    """Set `ad_slot`'s base URI to the resolved one and return `base_uri()` afterwards.

    On a Safe-owned network nothing is sent: the Safe transaction is printed, and the current
    base URI is returned unchanged.
    """
    new = resolve_base_uri(network_name, configured)
    owner = str(ad_slot.owner())
    current = str(ad_slot.base_uri())
    print(f"[set_base_uri] network {network_name}, AdSlot {ad_slot.address}, owner {owner}")
    print(f"[set_base_uri] base_uri {current} -> {new}")
    if new == current:
        print("[set_base_uri] already the base URI; nothing to send")
        return current
    if network_name in SAFE_OWNED_NETWORKS:
        print(
            "[set_base_uri] the owner is a Safe on this network, so nothing is sent. Propose "
            "this transaction from the Safe (docs/deploy-mainnet.md):"
        )
        print(f"  to     {ad_slot.address}")
        print("  value  0")
        print(f"  data   {set_base_uri_calldata(ad_slot, new)}")
        return current
    if sender is None or str(sender).lower() != owner.lower():
        raise BaseURIError(
            f"the sender {sender} is not the AdSlot owner {owner}. Run with the owner's account; "
            f"if the owner is a Safe, propose {set_base_uri_calldata(ad_slot, new)} to "
            f"{ad_slot.address} from it"
        )
    ad_slot.set_base_uri(new, sender=sender)
    after = str(ad_slot.base_uri())
    print(f"[set_base_uri] base_uri() is now {after}; tokenURI(id) reads {after}<id>")
    if after != new:
        raise BaseURIError(f"set_base_uri was sent, but base_uri() reads {after}, not {new}")
    return after


def moccasin_main() -> str:
    try:
        network = get_active_network()
    except ValueError:  # no moccasin config: plain python or pytest, i.e. pyevm
        network = None
    if network is None or network.name == "pyevm":
        raise BaseURIError(
            "pyevm keeps no deployment to update; run with --network anvil, base-sepolia or base"
        )
    configured = os.environ.get(BASE_URI_ENV)
    resolve_base_uri(network.name, configured)  # refuse a bad value before any RPC
    if network.name == "anvil":
        _purge_anvil_fork_cache()
        _patch_anvil_boa()
    # `point_base_uri` reads base_uri() right after sending; a pre-confirmation receipt would
    # leave that read on the previous sealed block (script/receipts.py).
    require_canonical_receipts(boa.env)
    ad_slot = load_ad_slot(network.chain_id)
    return point_base_uri(
        ad_slot, network_name=network.name, sender=boa.env.eoa, configured=configured
    )
