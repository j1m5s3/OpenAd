"""The settler address for the deploy and for rotations (PROTOCOL.md section 10; threat model T20).

Off Anvil and pyevm the settler must be a dedicated, gas-only EOA: `OPENAD_SETTLER_ADDRESS` is
required there and may never be the deployer, nor (for a rotation) the vault's current owner.
"""

from __future__ import annotations

import json
from types import SimpleNamespace

import boa
import pytest
from eth_account import Account
from eth_utils import function_signature_to_4byte_selector, to_canonical_address

from script import deploy as deploy_script
from script import set_settler as set_settler_script
from script import settler as settler_module
from script.artifacts import ContractRecord, build_artifact, write_artifact
from script.set_settler import LoadedVault, RotationError, load_vault, rotate_settler
from script.settler import SETTLER_ADDRESS_ENV, SettlerAddressError, resolve_settler

DEPLOYER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"  # Anvil #0, a public Foundry key
SETTLER = Account.from_key("0x" + "44" * 32).address
OTHER = Account.from_key("0x" + "55" * 32).address
SAFE = Account.from_key("0x" + "66" * 32).address  # a stand-in for the Base Safe
ZERO = "0x" + "00" * 20
OWNER_ROLE = "the CampaignVault owner"


def _flip_first_letter(address: str) -> str:
    """The same address with one hex letter's case flipped: a broken EIP-55 checksum."""
    digits = list(address[2:])
    i = next(i for i, ch in enumerate(digits) if ch.isalpha())
    digits[i] = digits[i].swapcase()
    return "0x" + "".join(digits)


@pytest.mark.parametrize(
    ("network", "configured", "expected"),
    [
        ("pyevm", None, DEPLOYER),
        ("anvil", None, DEPLOYER),
        ("anvil", "", DEPLOYER),
        ("pyevm", "   ", DEPLOYER),
        ("anvil", SETTLER, SETTLER),
        ("pyevm", SETTLER.lower(), SETTLER),  # checksummed on the way out
        ("anvil", DEPLOYER, DEPLOYER),  # locally the settler may be the deployer
        ("base-sepolia", SETTLER, SETTLER),
        ("base", SETTLER, SETTLER),
        ("base-sepolia", f"  {SETTLER}\n", SETTLER),
        ("base", "0x" + SETTLER[2:].upper(), SETTLER),  # no case pattern, no checksum to check
    ],
)
def test_resolve_settler_accepts(network: str, configured: str | None, expected: str) -> None:
    assert resolve_settler(network, DEPLOYER, configured) == expected


@pytest.mark.parametrize(
    ("network", "configured", "reason"),
    [
        ("base-sepolia", None, "is required"),
        ("base", None, "is required"),
        ("base", "", "is required"),
        ("base-sepolia", " \t", "is required"),
        ("some-other-network", None, "is required"),  # anything but pyevm and anvil
        ("base-sepolia", DEPLOYER, "the deployer"),
        ("base-sepolia", DEPLOYER.lower(), "the deployer"),
        ("base", "0x" + DEPLOYER[2:].upper(), "the deployer"),
        ("base-sepolia", ZERO, "zero address"),
        ("anvil", ZERO, "zero address"),
        ("base-sepolia", "0x1234", "not a 20-byte hex address"),
        ("anvil", "0x1234", "not a 20-byte hex address"),
        ("base-sepolia", SETTLER[2:], "not a 20-byte hex address"),
        ("base-sepolia", SETTLER + "00", "not a 20-byte hex address"),
        ("base", "0x" + "g" * 40, "not a 20-byte hex address"),
        ("base", "settler.eth", "not a 20-byte hex address"),
        ("base-sepolia", _flip_first_letter(SETTLER), "EIP-55"),
        ("anvil", _flip_first_letter(SETTLER), "EIP-55"),
    ],
)
def test_resolve_settler_refuses(network: str, configured: str | None, reason: str) -> None:
    with pytest.raises(SettlerAddressError) as exc:
        resolve_settler(network, DEPLOYER, configured)
    message = str(exc.value)
    assert reason in message
    assert SETTLER_ADDRESS_ENV in message
    assert "docs/deploy-sepolia.md" in message


@pytest.mark.parametrize("configured", [OTHER, OTHER.lower(), "0x" + OTHER[2:].upper()])
@pytest.mark.parametrize("network", ["base-sepolia", "base"])
def test_resolve_settler_refuses_a_forbidden_address(network: str, configured: str) -> None:
    with pytest.raises(SettlerAddressError, match=OWNER_ROLE) as exc:
        resolve_settler(network, DEPLOYER, configured, forbidden={OWNER_ROLE: OTHER})
    assert "owner-side key" in str(exc.value)


def test_resolve_settler_keeps_refusing_the_deployer_beside_a_forbidden_map() -> None:
    forbidden = {OWNER_ROLE: OTHER}
    with pytest.raises(SettlerAddressError, match="the deployer"):
        resolve_settler("base", DEPLOYER, DEPLOYER.lower(), forbidden=forbidden)
    assert resolve_settler("base", DEPLOYER, SETTLER, forbidden=forbidden) == SETTLER
    # Locally an owner may be the settler too: Anvil #0 is every role there.
    assert resolve_settler("anvil", DEPLOYER, OTHER, forbidden=forbidden) == OTHER


def test_the_scripts_share_one_helper() -> None:
    assert deploy_script.resolve_settler is settler_module.resolve_settler
    assert set_settler_script.resolve_settler is settler_module.resolve_settler


# --------------------------------------------------------------------------- deploy.py


def test_pyevm_deploy_defaults_the_settler_to_the_deployer(monkeypatch, capsys) -> None:
    monkeypatch.delenv(SETTLER_ADDRESS_ENV, raising=False)
    deployed = deploy_script.deploy()
    assert deployed["CampaignVault"].settler() == boa.env.eoa
    assert f"[deploy] settler {boa.env.eoa}" in capsys.readouterr().out


def test_pyevm_deploy_uses_the_configured_settler(monkeypatch, capsys) -> None:
    monkeypatch.setenv(SETTLER_ADDRESS_ENV, SETTLER.lower())
    deployed = deploy_script.deploy()
    vault = deployed["CampaignVault"]
    assert vault.settler() == SETTLER
    # Only the settler moves off the deployer: the treasury and the moderator are owner-side.
    assert vault.treasury() == boa.env.eoa
    assert deployed["Marketplace"].treasury() == boa.env.eoa
    assert deployed["CreativeRegistry"].moderator() == boa.env.eoa
    assert f"[deploy] settler {SETTLER} ({SETTLER_ADDRESS_ENV})" in capsys.readouterr().out


def _remote_network(monkeypatch, name: str) -> None:
    """Make `deploy.py` see a non-local network, and fail the test on any chain access."""
    fake = SimpleNamespace(name=name, chain_id=84532, url="http://unused.invalid")
    monkeypatch.setattr(deploy_script, "get_active_network", lambda: fake)

    def no_chain_access(*_args, **_kwargs):
        pytest.fail("the deploy reached the chain before refusing the settler")

    monkeypatch.setattr(deploy_script, "_current_block_number", no_chain_access)
    monkeypatch.setattr(deploy_script, "deploy_usdc", no_chain_access)
    monkeypatch.setattr(deploy_script, "CreativeRegistry", SimpleNamespace(deploy=no_chain_access))


@pytest.mark.parametrize("network", ["base-sepolia", "base"])
def test_remote_deploy_requires_the_settler_address(monkeypatch, network: str) -> None:
    _remote_network(monkeypatch, network)
    monkeypatch.delenv(SETTLER_ADDRESS_ENV, raising=False)
    with pytest.raises(SettlerAddressError, match="is required"):
        deploy_script.deploy()


@pytest.mark.parametrize("network", ["base-sepolia", "base"])
def test_remote_deploy_refuses_the_deployer_as_settler(monkeypatch, network: str) -> None:
    _remote_network(monkeypatch, network)
    monkeypatch.setenv(SETTLER_ADDRESS_ENV, str(boa.env.eoa).lower())
    with pytest.raises(SettlerAddressError, match="the deployer"):
        deploy_script.deploy()


def test_deploy_protocol_rechecks_the_settler(monkeypatch) -> None:
    """No caller of `deploy_protocol` can make the deployer the settler off Anvil and pyevm."""
    _remote_network(monkeypatch, "base-sepolia")
    with pytest.raises(SettlerAddressError, match="the deployer"):
        deploy_script.deploy_protocol(SimpleNamespace(address=ZERO), str(boa.env.eoa))


def test_pyevm_deploy_refuses_a_malformed_settler_before_any_transaction(monkeypatch) -> None:
    def no_transaction(*_args, **_kwargs):
        pytest.fail("the deploy sent a transaction before resolving the settler")

    monkeypatch.setattr(deploy_script, "deploy_usdc", no_transaction)
    monkeypatch.setenv(SETTLER_ADDRESS_ENV, "0x1234")
    with pytest.raises(SettlerAddressError, match="not a 20-byte hex address"):
        deploy_script.deploy()


# --------------------------------------------------------------------------- set_settler.py


def _deploy_and_load(monkeypatch, tmp_path, *, settler: str | None = None) -> LoadedVault:
    """A pyevm deploy, loaded back through `load_vault` from a written 84532 artifact."""
    if settler is None:
        monkeypatch.delenv(SETTLER_ADDRESS_ENV, raising=False)
    else:
        monkeypatch.setenv(SETTLER_ADDRESS_ENV, settler)
    deployed = deploy_script.deploy()
    monkeypatch.delenv(SETTLER_ADDRESS_ENV, raising=False)
    contract = deployed["CampaignVault"]
    artifact = build_artifact(
        chain_id=84532,
        network="base-sepolia",
        deployer=str(boa.env.eoa),
        contracts={
            "CampaignVault": ContractRecord(
                address=str(contract.address), start_block=0, abi=contract.abi
            )
        },
    )
    write_artifact(artifact, directory=tmp_path)
    loaded = load_vault(84532, directory=tmp_path)
    assert loaded.vault.address == contract.address
    assert loaded.deployer == boa.env.eoa
    return loaded


@pytest.fixture
def loaded(monkeypatch, tmp_path) -> LoadedVault:
    """Deployed on pyevm with the default settler (the deployer), which still owns the vault."""
    return _deploy_and_load(monkeypatch, tmp_path)


@pytest.fixture
def safe_owned(monkeypatch, tmp_path) -> LoadedVault:
    """Deployed with a dedicated settler, then the vault's ownership moved to a (stand-in) Safe,
    as docs/deploy-mainnet.md describes. The deployer EOA still exists."""
    loaded = _deploy_and_load(monkeypatch, tmp_path, settler=OTHER)
    loaded.vault.transfer_ownership(SAFE)
    assert loaded.vault.owner() == SAFE
    assert loaded.vault.settler() == OTHER
    return loaded


def test_rotation_sends_set_settler_from_the_owner(loaded, capsys) -> None:
    vault, deployer = loaded
    after = rotate_settler(
        vault, network_name="base-sepolia", deployer=deployer, sender=deployer, configured=SETTLER
    )
    assert after == SETTLER
    assert vault.settler() == SETTLER
    assert f"settler() is now {SETTLER}" in capsys.readouterr().out


def test_rotation_back_to_the_deployer_is_local_only(loaded) -> None:
    vault, deployer = loaded
    rotate_settler(
        vault, network_name="anvil", deployer=deployer, sender=deployer, configured=SETTLER
    )
    with pytest.raises(SettlerAddressError, match="the deployer"):
        rotate_settler(
            vault,
            network_name="base-sepolia",
            deployer=deployer,
            sender=deployer,
            configured=deployer,
        )
    assert vault.settler() == SETTLER
    # On Anvil an unset address means the deployer again, as in the deploy.
    assert (
        rotate_settler(
            vault, network_name="anvil", deployer=deployer, sender=deployer, configured=None
        )
        == deployer
    )


def test_rotation_requires_the_address_off_anvil(loaded) -> None:
    vault, deployer = loaded
    with pytest.raises(SettlerAddressError, match="is required"):
        rotate_settler(
            vault, network_name="base-sepolia", deployer=deployer, sender=deployer, configured=None
        )
    assert vault.settler() == deployer


def test_rotation_refuses_a_sender_that_is_not_the_owner(loaded) -> None:
    vault, deployer = loaded
    with pytest.raises(RotationError, match="is not the vault owner"):
        rotate_settler(
            vault, network_name="base-sepolia", deployer=deployer, sender=OTHER, configured=SETTLER
        )
    assert vault.settler() == deployer


def test_rotation_on_base_prints_the_safe_transaction_and_sends_nothing(loaded, capsys) -> None:
    vault, deployer = loaded
    before = vault.settler()
    returned = rotate_settler(
        vault, network_name="base", deployer=deployer, sender=None, configured=SETTLER
    )
    assert returned == before
    assert vault.settler() == before  # nothing was sent
    expected = (
        function_signature_to_4byte_selector("set_settler(address)")
        + b"\x00" * 12
        + to_canonical_address(SETTLER)
    )
    out = capsys.readouterr().out
    assert f"to     {vault.address}" in out
    assert "value  0" in out
    assert f"data   0x{expected.hex()}" in out


def test_rotation_to_the_current_settler_sends_nothing(loaded, capsys) -> None:
    vault, deployer = loaded
    rotate_settler(
        vault, network_name="base-sepolia", deployer=deployer, sender=deployer, configured=SETTLER
    )
    capsys.readouterr()
    returned = rotate_settler(
        vault, network_name="base", deployer=deployer, sender=None, configured=SETTLER.lower()
    )
    assert returned == SETTLER
    out = capsys.readouterr().out
    assert "already the settler" in out
    assert "data" not in out


# The review's reproduction: once ownership has moved, owner() is no longer the deployer, so a
# rule that refused only owner() let the rotation make the deployer the settler.


@pytest.mark.parametrize("network", ["base-sepolia", "base"])
def test_rotation_after_an_ownership_move_refuses_the_deployer(safe_owned, network, capsys) -> None:
    vault, deployer = safe_owned
    for configured in (deployer, deployer.lower()):
        with pytest.raises(SettlerAddressError, match="the deployer"):
            rotate_settler(
                vault, network_name=network, deployer=deployer, sender=SAFE, configured=configured
            )
    assert vault.settler() == OTHER
    assert "data" not in capsys.readouterr().out  # no Safe transaction for it either


@pytest.mark.parametrize("network", ["base-sepolia", "base"])
def test_rotation_after_an_ownership_move_refuses_the_new_owner(safe_owned, network) -> None:
    vault, deployer = safe_owned
    with pytest.raises(SettlerAddressError, match=OWNER_ROLE):
        rotate_settler(
            vault, network_name=network, deployer=deployer, sender=SAFE, configured=SAFE.lower()
        )
    assert vault.settler() == OTHER


def test_rotation_after_an_ownership_move_is_sent_by_the_new_owner(safe_owned) -> None:
    vault, deployer = safe_owned
    with pytest.raises(RotationError, match="is not the vault owner"):
        rotate_settler(
            vault,
            network_name="base-sepolia",
            deployer=deployer,
            sender=deployer,
            configured=SETTLER,
        )
    after = rotate_settler(
        vault, network_name="base-sepolia", deployer=deployer, sender=SAFE, configured=SETTLER
    )
    assert after == SETTLER
    assert vault.settler() == SETTLER


class _UnchangedVault:
    """A vault whose `set_settler` returns without `settler()` changing (a dropped or
    reverted-but-reported transaction)."""

    address = "0x" + "ab" * 20

    def __init__(self, owner: str) -> None:
        self._owner = owner
        self.sent: list[tuple[str, str]] = []

    def owner(self) -> str:
        return self._owner

    def settler(self) -> str:
        return self._owner

    def set_settler(self, new: str, sender: str) -> None:
        self.sent.append((new, sender))


def test_rotation_checks_settler_after_sending() -> None:
    vault = _UnchangedVault(DEPLOYER)
    with pytest.raises(RotationError, match="set_settler was sent, but settler\\(\\) reads"):
        rotate_settler(
            vault,
            network_name="base-sepolia",
            deployer=DEPLOYER,
            sender=DEPLOYER,
            configured=SETTLER,
        )
    assert vault.sent == [(SETTLER, DEPLOYER)]  # sent once, from the checked sender


def test_load_vault_needs_the_artifact(tmp_path) -> None:
    with pytest.raises(RotationError, match="no deployments artifact"):
        load_vault(84532, directory=tmp_path)


@pytest.mark.parametrize("deployer", [None, "", "0x1234", "ab" * 20, 42])
def test_load_vault_refuses_an_artifact_without_a_valid_deployer(tmp_path, deployer) -> None:
    artifact = build_artifact(chain_id=84532, network="base-sepolia", deployer="", contracts={})
    if deployer is None:
        del artifact["deployer"]
    else:
        artifact["deployer"] = deployer
    (tmp_path / "84532.json").write_text(json.dumps(artifact), encoding="utf-8")
    with pytest.raises(RotationError, match="records no valid deployer address"):
        load_vault(84532, directory=tmp_path)


def _network(monkeypatch, name: str, chain_id: int, loaded: LoadedVault, calls: list[str]) -> None:
    """Make `moccasin_main` see `name`, and load `loaded` for `chain_id` only."""
    monkeypatch.setattr(
        set_settler_script,
        "get_active_network",
        lambda: SimpleNamespace(name=name, chain_id=chain_id),
    )

    def load(requested: int) -> LoadedVault:
        assert requested == chain_id
        calls.append(f"load {requested}")
        return loaded

    monkeypatch.setattr(set_settler_script, "load_vault", load)


def test_moccasin_main_rotates_to_the_configured_address(loaded, monkeypatch) -> None:
    calls: list[str] = []
    _network(monkeypatch, "base-sepolia", 84532, loaded, calls)
    monkeypatch.setenv(SETTLER_ADDRESS_ENV, SETTLER)
    assert set_settler_script.moccasin_main() == SETTLER
    assert loaded.vault.settler() == SETTLER
    assert calls == ["load 84532"]


@pytest.mark.parametrize(("network", "chain_id"), [("base-sepolia", 84532), ("base", 8453)])
def test_moccasin_main_refuses_the_deployer_after_an_ownership_move(
    safe_owned, monkeypatch, capsys, network: str, chain_id: int
) -> None:
    """`mox run set_settler` checks the artifact's deployer, not owner(): once the Safe owns the
    vault, the deployer must still be refused, before any transaction is built or sent."""
    calls: list[str] = []
    _network(monkeypatch, network, chain_id, safe_owned, calls)

    def no_transaction(*_args, **_kwargs):
        pytest.fail("built a set_settler transaction for the deployer")

    monkeypatch.setattr(set_settler_script, "set_settler_calldata", no_transaction)
    monkeypatch.setenv(SETTLER_ADDRESS_ENV, safe_owned.deployer)
    with pytest.raises(SettlerAddressError, match="the deployer"):
        set_settler_script.moccasin_main()
    assert calls == [f"load {chain_id}"]
    assert safe_owned.vault.owner() == SAFE
    assert safe_owned.vault.settler() == OTHER  # nothing was sent
    out = capsys.readouterr().out
    assert "data" not in out
    assert "settler() is now" not in out


def test_moccasin_main_patches_boa_on_anvil_before_loading(loaded, monkeypatch) -> None:
    calls: list[str] = []
    _network(monkeypatch, "anvil", 31337, loaded, calls)
    monkeypatch.setattr(
        set_settler_script, "_purge_anvil_fork_cache", lambda: calls.append("purge")
    )
    monkeypatch.setattr(set_settler_script, "_patch_anvil_boa", lambda: calls.append("patch"))
    monkeypatch.delenv(SETTLER_ADDRESS_ENV, raising=False)
    # Unset on Anvil means the deployer, which the default deploy already made the settler.
    assert set_settler_script.moccasin_main() == loaded.deployer
    assert calls == ["purge", "patch", "load 31337"]


def test_set_settler_refuses_pyevm() -> None:
    with pytest.raises(RotationError, match="pyevm keeps no deployment"):
        set_settler_script.moccasin_main()
