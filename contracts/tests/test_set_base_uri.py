"""`script/set_base_uri.py`: pointing AdSlot's token metadata at the API (PROTOCOL.md section 10).

`tokenURI(id)` is `base_uri` plus the id, so the URI must be the API's public URL plus
`/v1/slots/`, fit `String[80]`, and off Anvil and pyevm use https and a public host. Anything
else is refused before the deployment is loaded or a transaction is built.
"""

from __future__ import annotations

import json
import re
from types import SimpleNamespace

import boa
import pytest
from eth_account import Account
from eth_utils import function_signature_to_4byte_selector

from script import set_base_uri as set_base_uri_script
from script.artifacts import ContractRecord, build_artifact, write_artifact
from script.set_base_uri import (
    BASE_URI_ENV,
    MAX_BASE_URI_BYTES,
    BaseURIError,
    load_ad_slot,
    point_base_uri,
    resolve_base_uri,
)

STAGING = "https://openad-api-255087625770.us-central1.run.app/v1/slots/"
LOCAL = "http://localhost:8000/v1/slots/"  # the conftest AdSlot's initial base URI
OTHER = Account.from_key("0x" + "55" * 32).address
SAFE = Account.from_key("0x" + "66" * 32).address  # a stand-in for the Base Safe


def _uri_of_size(size: int) -> str:
    """An https base URI of exactly `size` bytes, on a public-looking host."""
    fixed = len("https://") + len(".io/v1/slots/")
    return "https://" + "a" * (size - fixed) + ".io/v1/slots/"


@pytest.mark.parametrize(
    ("network", "configured", "expected"),
    [
        ("base-sepolia", STAGING, STAGING),
        ("base", "https://api.openad.xyz/v1/slots/", "https://api.openad.xyz/v1/slots/"),
        ("base-sepolia", f"  {STAGING}\n", STAGING),  # surrounding whitespace is dropped
        ("base-sepolia", "https://openad.xyz/api/v1/slots/", "https://openad.xyz/api/v1/slots/"),
        ("base-sepolia", "https://8.8.8.8/v1/slots/", "https://8.8.8.8/v1/slots/"),
        ("anvil", LOCAL, LOCAL),
        ("pyevm", "http://127.0.0.1:8000/v1/slots/", "http://127.0.0.1:8000/v1/slots/"),
        ("anvil", "https://api.openad.example/v1/slots/", "https://api.openad.example/v1/slots/"),
    ],
)
def test_resolve_base_uri_accepts(network: str, configured: str, expected: str) -> None:
    assert resolve_base_uri(network, configured) == expected


def test_resolve_base_uri_takes_exactly_the_contract_limit() -> None:
    at_limit = _uri_of_size(MAX_BASE_URI_BYTES)
    assert len(at_limit.encode()) == 80
    assert resolve_base_uri("base-sepolia", at_limit) == at_limit
    with pytest.raises(BaseURIError, match=re.escape("81 bytes; AdSlot.base_uri holds at most 80")):
        resolve_base_uri("base-sepolia", _uri_of_size(MAX_BASE_URI_BYTES + 1))


def test_resolve_base_uri_counts_bytes_not_characters() -> None:
    # 70 characters, but "é" is two bytes in UTF-8: 11 of them push it past 80 bytes.
    uri = "https://" + "é" * 11 + "a" * 38 + ".io/v1/slots/"
    assert len(uri) == 70
    with pytest.raises(BaseURIError, match="81 bytes"):
        resolve_base_uri("base-sepolia", uri)


@pytest.mark.parametrize(
    ("network", "configured", "reason"),
    [
        ("base-sepolia", None, "set OPENAD_BASE_URI"),
        ("base-sepolia", "", "set OPENAD_BASE_URI"),
        ("anvil", "   ", "set OPENAD_BASE_URI"),
        ("base-sepolia", "https://api.openad.xyz/v1/ slots/", "contains whitespace"),
        ("base-sepolia", "http://api.openad.xyz/v1/slots/", "must use https on base-sepolia"),
        ("base", "ftp://api.openad.xyz/v1/slots/", "must use https on base"),
        ("anvil", "ftp://localhost/v1/slots/", "must use http or https on anvil"),
        ("base-sepolia", "api.openad.xyz/v1/slots/", "must use https"),
        ("base-sepolia", "https:///v1/slots/", "has no host"),
        ("base-sepolia", "https://me:pw@api.openad.xyz/v1/slots/", "must not carry credentials"),
        ("base-sepolia", "https://api.openad.xyz/v1/slots/?v=1", "query or fragment"),
        ("base-sepolia", "https://api.openad.xyz/v1/slots/?", "query or fragment"),
        ("base-sepolia", "https://api.openad.xyz/v1/slots/#x", "query or fragment"),
        ("base-sepolia", "https://api.openad.xyz/v1/slots", "must end in /v1/slots/"),
        ("base-sepolia", "https://api.openad.xyz/", "must end in /v1/slots/"),
        ("base-sepolia", "https://api.openad.xyz/v1/slot/", "must end in /v1/slots/"),
        # The deploy's placeholder, and other names or addresses that aren't public.
        ("base-sepolia", "https://api.openad.example/v1/slots/", "isn't a public host"),
        ("base", "https://api.openad.test/v1/slots/", "isn't a public host"),
        ("base-sepolia", "https://api.openad.example./v1/slots/", "isn't a public host"),
        ("base-sepolia", "https://localhost/v1/slots/", "isn't a public host"),
        ("base-sepolia", "https://api/v1/slots/", "isn't a public host"),
        ("base-sepolia", "https://127.0.0.1:8000/v1/slots/", "isn't a public host"),
        ("base-sepolia", "https://10.0.0.5/v1/slots/", "isn't a public host"),
        ("base-sepolia", "https://[::1]/v1/slots/", "isn't a public host"),
    ],
)
def test_resolve_base_uri_refuses(network: str, configured: str | None, reason: str) -> None:
    with pytest.raises(BaseURIError, match=re.escape(reason)):
        resolve_base_uri(network, configured)


# --------------------------------------------------------------------------- the script


def _mint(ad_slot) -> int:
    with boa.env.prank(OTHER):
        return ad_slot.mint_slot((300, 250, 0, "example.com"))


@pytest.fixture
def loaded(ad_slot, tmp_path):
    """The conftest AdSlot (owned by the deployer), loaded back through `load_ad_slot` from a
    written 84532 artifact, as the script does."""
    artifact = build_artifact(
        chain_id=84532,
        network="base-sepolia",
        deployer=str(boa.env.eoa),
        contracts={
            "AdSlot": ContractRecord(address=str(ad_slot.address), start_block=0, abi=ad_slot.abi)
        },
    )
    write_artifact(artifact, directory=tmp_path)
    contract = load_ad_slot(84532, directory=tmp_path)
    assert contract.address == ad_slot.address
    return contract


def test_point_base_uri_sends_from_the_owner(loaded, capsys) -> None:
    slot_id = _mint(loaded)
    after = point_base_uri(
        loaded, network_name="base-sepolia", sender=boa.env.eoa, configured=STAGING
    )
    assert after == STAGING
    assert loaded.base_uri() == STAGING
    assert loaded.tokenURI(slot_id) == f"{STAGING}{slot_id}"
    out = capsys.readouterr().out
    assert f"base_uri {LOCAL} -> {STAGING}" in out
    assert f"base_uri() is now {STAGING}" in out


def test_point_base_uri_refuses_a_sender_that_is_not_the_owner(loaded) -> None:
    with pytest.raises(BaseURIError, match="is not the AdSlot owner"):
        point_base_uri(loaded, network_name="base-sepolia", sender=OTHER, configured=STAGING)
    with pytest.raises(BaseURIError, match="is not the AdSlot owner"):
        point_base_uri(loaded, network_name="base-sepolia", sender=None, configured=STAGING)
    assert loaded.base_uri() == LOCAL  # nothing was sent


def test_point_base_uri_on_base_prints_the_safe_transaction_and_sends_nothing(
    loaded, capsys
) -> None:
    loaded.transfer_ownership(SAFE)
    uri = "https://api.openad.xyz/v1/slots/"
    assert point_base_uri(loaded, network_name="base", sender=boa.env.eoa, configured=uri) == LOCAL
    assert loaded.base_uri() == LOCAL
    out = capsys.readouterr().out
    assert f"to     {loaded.address}" in out
    selector = function_signature_to_4byte_selector("set_base_uri(string)").hex()
    data = next(line.split()[-1] for line in out.splitlines() if line.strip().startswith("data"))
    assert data.startswith("0x" + selector)
    assert uri.encode().hex() in data


def test_point_base_uri_to_the_current_value_sends_nothing(loaded, capsys) -> None:
    assert point_base_uri(loaded, network_name="anvil", sender=OTHER, configured=LOCAL) == LOCAL
    assert "nothing to send" in capsys.readouterr().out


class _NoChain:
    """An AdSlot stand-in that fails the test on any read or write."""

    address = "0x" + "ab" * 20

    def __getattr__(self, name: str):
        pytest.fail(f"touched AdSlot.{name} before refusing the base URI")


def test_point_base_uri_refuses_a_bad_value_before_touching_the_chain() -> None:
    with pytest.raises(BaseURIError, match="isn't a public host"):
        point_base_uri(
            _NoChain(),
            network_name="base-sepolia",
            sender=boa.env.eoa,
            configured="https://api.openad.example/v1/slots/",
        )


class _UnchangedAdSlot:
    """Accepts `set_base_uri` but keeps returning the old value, like a dropped transaction."""

    address = "0x" + "cd" * 20

    def __init__(self) -> None:
        self.sent: list[tuple[str, str]] = []

    def owner(self) -> str:
        return str(boa.env.eoa)

    def base_uri(self) -> str:
        return LOCAL

    def set_base_uri(self, uri: str, *, sender: str) -> None:
        self.sent.append((uri, sender))


def test_point_base_uri_checks_base_uri_after_sending() -> None:
    ad_slot = _UnchangedAdSlot()
    with pytest.raises(BaseURIError, match="set_base_uri was sent, but base_uri"):
        point_base_uri(ad_slot, network_name="base-sepolia", sender=boa.env.eoa, configured=STAGING)
    assert ad_slot.sent == [(STAGING, boa.env.eoa)]  # sent once, from the checked sender


def test_load_ad_slot_needs_the_artifact(tmp_path) -> None:
    with pytest.raises(BaseURIError, match="no deployments artifact"):
        load_ad_slot(84532, directory=tmp_path)


def test_load_ad_slot_refuses_an_artifact_without_ad_slot(tmp_path) -> None:
    artifact = build_artifact(chain_id=84532, network="base-sepolia", deployer=OTHER, contracts={})
    (tmp_path / "84532.json").write_text(json.dumps(artifact), encoding="utf-8")
    with pytest.raises(BaseURIError, match="records no AdSlot"):
        load_ad_slot(84532, directory=tmp_path)


def _network(monkeypatch, name: str, chain_id: int, loaded, calls: list[str]) -> None:
    """Make `moccasin_main` see `name`, and load `loaded` for `chain_id` only."""
    monkeypatch.setattr(
        set_base_uri_script,
        "get_active_network",
        lambda: SimpleNamespace(name=name, chain_id=chain_id),
    )
    monkeypatch.setattr(
        set_base_uri_script, "require_canonical_receipts", lambda env: calls.append("receipts")
    )

    def load(requested: int):
        assert requested == chain_id
        calls.append(f"load {requested}")
        return loaded

    monkeypatch.setattr(set_base_uri_script, "load_ad_slot", load)


def test_moccasin_main_sets_the_configured_uri(loaded, monkeypatch) -> None:
    calls: list[str] = []
    _network(monkeypatch, "base-sepolia", 84532, loaded, calls)
    monkeypatch.setenv(BASE_URI_ENV, STAGING)
    assert set_base_uri_script.moccasin_main() == STAGING
    assert loaded.base_uri() == STAGING
    assert calls == ["receipts", "load 84532"]


def test_moccasin_main_refuses_a_bad_value_before_loading(loaded, monkeypatch) -> None:
    calls: list[str] = []
    _network(monkeypatch, "base-sepolia", 84532, loaded, calls)
    monkeypatch.setenv(BASE_URI_ENV, "https://api.openad.example/v1/slots/")
    with pytest.raises(BaseURIError, match="isn't a public host"):
        set_base_uri_script.moccasin_main()
    assert calls == []
    assert loaded.base_uri() == LOCAL


def test_moccasin_main_patches_boa_on_anvil_before_loading(loaded, monkeypatch) -> None:
    calls: list[str] = []
    _network(monkeypatch, "anvil", 31337, loaded, calls)
    monkeypatch.setattr(
        set_base_uri_script, "_purge_anvil_fork_cache", lambda: calls.append("purge")
    )
    monkeypatch.setattr(set_base_uri_script, "_patch_anvil_boa", lambda: calls.append("patch"))
    monkeypatch.setenv(BASE_URI_ENV, "http://127.0.0.1:8000/v1/slots/")
    assert set_base_uri_script.moccasin_main() == "http://127.0.0.1:8000/v1/slots/"
    assert calls == ["purge", "patch", "receipts", "load 31337"]


def test_set_base_uri_refuses_pyevm() -> None:
    with pytest.raises(BaseURIError, match="pyevm keeps no deployment"):
        set_base_uri_script.moccasin_main()
