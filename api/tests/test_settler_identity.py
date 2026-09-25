"""The settler's startup identity check (ARCHITECTURE §3.9; threat model T20).

Fakes only, no chain: a fake JSON-RPC provider behind a real ``AsyncWeb3``, so the vault reads
go through web3's real ABI encoding, and ``main()`` loads a real artifact file.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from eth_account import Account
from eth_utils import function_signature_to_4byte_selector
from structlog.testing import capture_logs
from web3 import AsyncWeb3
from web3.providers.async_base import AsyncBaseProvider
from web3.types import RPCEndpoint, RPCResponse

import openad.settler.__main__ as settler_main
from openad.chain.deployments import ContractInfo, Deployment, DeploymentsError
from openad.settler.identity import (
    CHAIN_MISMATCH,
    KEY_IS_DEPLOYER,
    KEY_IS_OWNER,
    KEY_IS_TREASURY,
    LOCAL_CHAIN_ID,
    NOT_CURRENT_SETTLER,
    Finding,
    IdentityFindings,
    VaultRoles,
    check_identity,
    read_artifact_deployer,
    read_vault_roles,
    startup_findings,
)
from openad.settler.settings import SettlerSettings

KEY = "0x" + "44" * 32  # a test-only key; the settler address below is derived from it
ADDRESS = Account.from_key(KEY).address
OWNER = "0x" + "11" * 20  # e.g. the Safe, once the vault's ownership has moved
OTHER = "0x" + "22" * 20
TREASURY = "0x" + "33" * 20
DEPLOYER = "0x" + "dd" * 20  # the artifact's `deployer`
VAULT = "0x" + "ab" * 20
BASE_SEPOLIA = 84532
BASE = 8453

VAULT_ABI: list[dict[str, Any]] = [
    {
        "type": "function",
        "name": name,
        "stateMutability": "view",
        "inputs": [],
        "outputs": [{"name": "", "type": "address"}],
    }
    for name in ("owner", "settler", "treasury")
]
DEPLOYMENT = Deployment(
    chain_id=BASE_SEPOLIA,
    network="test",
    contracts={"CampaignVault": ContractInfo("CampaignVault", VAULT, 0, VAULT_ABI)},
)
MISSING = object()  # a `deployer` key left out of the artifact


def _events(findings: tuple[Finding, ...]) -> list[str]:
    return [f.event for f in findings]


def _upper(address: str) -> str:
    return "0x" + address[2:].upper()


def _write_artifact(directory: Path, chain_id: int, deployer: object = DEPLOYER) -> Path:
    """``<chainId>.json`` in the deploy script's shape (ARCHITECTURE §4.1)."""
    raw: dict[str, Any] = {
        "artifactVersion": 1,
        "chainId": chain_id,
        "network": "test",
        "deployedAt": "2026-09-25T00:00:00Z",
        "deployer": deployer,
        "contracts": {"CampaignVault": {"address": VAULT, "startBlock": 0, "abi": VAULT_ABI}},
    }
    if deployer is MISSING:
        del raw["deployer"]
    path = directory / f"{chain_id}.json"
    path.write_text(json.dumps(raw), encoding="utf-8")
    return path


# --------------------------------------------------------------------------- check_identity


def test_a_dedicated_settler_key_has_no_findings() -> None:
    found = check_identity(ADDRESS, OWNER, ADDRESS, TREASURY, BASE_SEPOLIA, deployer=DEPLOYER)
    assert found == IdentityFindings()


@pytest.mark.parametrize("chain_id", [BASE_SEPOLIA, BASE, 1])
def test_the_owner_key_is_fatal_off_anvil(chain_id: int) -> None:
    found = check_identity(ADDRESS, ADDRESS.lower(), ADDRESS, TREASURY, chain_id, deployer=DEPLOYER)
    assert _events(found.fatal) == [KEY_IS_OWNER]
    assert found.warnings == ()


@pytest.mark.parametrize("chain_id", [BASE_SEPOLIA, BASE, 1])
def test_the_deployer_key_is_fatal_off_anvil(chain_id: int) -> None:
    # The vault's ownership has moved (to a Safe), but the key is still the deployer's.
    found = check_identity(ADDRESS, OWNER, ADDRESS, TREASURY, chain_id, deployer=ADDRESS.lower())
    assert _events(found.fatal) == [KEY_IS_DEPLOYER]
    assert found.warnings == ()


def test_a_key_that_is_the_owner_and_the_deployer_reports_both() -> None:
    found = check_identity(ADDRESS, ADDRESS, ADDRESS, TREASURY, BASE, deployer=_upper(ADDRESS))
    assert _events(found.fatal) == [KEY_IS_OWNER, KEY_IS_DEPLOYER]


def test_the_owner_and_deployer_key_only_warns_on_anvil() -> None:
    # The local deploy makes Anvil #0 the deployer, the owner, the settler and the treasury.
    found = check_identity(ADDRESS, ADDRESS, ADDRESS, ADDRESS, LOCAL_CHAIN_ID, deployer=ADDRESS)
    assert found.fatal == ()
    assert _events(found.warnings) == [KEY_IS_OWNER, KEY_IS_DEPLOYER, KEY_IS_TREASURY]


def test_the_deployer_key_only_warns_on_anvil() -> None:
    found = check_identity(ADDRESS, OWNER, ADDRESS, TREASURY, LOCAL_CHAIN_ID, deployer=ADDRESS)
    assert found.fatal == ()
    assert _events(found.warnings) == [KEY_IS_DEPLOYER]


def test_a_key_that_is_not_the_settler_warns() -> None:
    # A rotation in progress: its batches revert with "not settler" and are retried.
    found = check_identity(ADDRESS, OWNER, OTHER, TREASURY, BASE_SEPOLIA, deployer=DEPLOYER)
    assert found.fatal == ()
    assert _events(found.warnings) == [NOT_CURRENT_SETTLER]


def test_a_key_that_is_the_treasury_warns() -> None:
    found = check_identity(ADDRESS, OWNER, ADDRESS, _upper(ADDRESS), BASE, deployer=DEPLOYER)
    assert found.fatal == ()
    assert _events(found.warnings) == [KEY_IS_TREASURY]


def test_the_owner_key_off_anvil_also_reports_the_warnings() -> None:
    found = check_identity(
        _upper(ADDRESS), ADDRESS, OTHER, ADDRESS.lower(), BASE, deployer=DEPLOYER
    )
    assert _events(found.fatal) == [KEY_IS_OWNER]
    assert _events(found.warnings) == [NOT_CURRENT_SETTLER, KEY_IS_TREASURY]


# --------------------------------------------------------------------------- startup_findings


def test_startup_findings_judge_the_chain_the_rpc_serves() -> None:
    roles = VaultRoles(chain_id=LOCAL_CHAIN_ID, owner=ADDRESS, settler=ADDRESS, treasury=ADDRESS)
    found = startup_findings(ADDRESS, roles, LOCAL_CHAIN_ID, deployer=ADDRESS)
    assert found.fatal == ()
    assert _events(found.warnings) == [KEY_IS_OWNER, KEY_IS_DEPLOYER, KEY_IS_TREASURY]


def test_a_chain_mismatch_is_fatal_and_keeps_the_owner_refusal() -> None:
    # OPENAD_CHAIN_ID=31337 pointed at a real network must not turn the refusal into a warning.
    roles = VaultRoles(chain_id=BASE_SEPOLIA, owner=ADDRESS, settler=ADDRESS, treasury=TREASURY)
    found = startup_findings(ADDRESS, roles, LOCAL_CHAIN_ID, deployer=DEPLOYER)
    assert _events(found.fatal) == [CHAIN_MISMATCH, KEY_IS_OWNER]


def test_a_chain_mismatch_keeps_the_deployer_refusal() -> None:
    roles = VaultRoles(chain_id=BASE_SEPOLIA, owner=OWNER, settler=ADDRESS, treasury=TREASURY)
    found = startup_findings(ADDRESS, roles, LOCAL_CHAIN_ID, deployer=ADDRESS)
    assert _events(found.fatal) == [CHAIN_MISMATCH, KEY_IS_DEPLOYER]


# --------------------------------------------------------------------------- read_artifact_deployer


def test_read_artifact_deployer_reads_the_recorded_deployer(tmp_path: Path) -> None:
    _write_artifact(tmp_path, BASE_SEPOLIA, deployer=DEPLOYER)
    assert read_artifact_deployer(tmp_path, BASE_SEPOLIA) == DEPLOYER


@pytest.mark.parametrize("deployer", [MISSING, None, "", "0x1234", "dd" * 20, 42])
def test_read_artifact_deployer_fails_closed(tmp_path: Path, deployer: object) -> None:
    _write_artifact(tmp_path, BASE_SEPOLIA, deployer=deployer)
    with pytest.raises(DeploymentsError, match="records no valid deployer address"):
        read_artifact_deployer(tmp_path, BASE_SEPOLIA)


# --------------------------------------------------------------------------- read_vault_roles


class FakeRpc(AsyncBaseProvider):
    """Answers ``eth_chainId`` and the vault's three views; anything else fails the test."""

    def __init__(
        self,
        *,
        chain_id: int = BASE_SEPOLIA,
        owner: str = OWNER,
        settler: str = ADDRESS,
        treasury: str = TREASURY,
        down: bool = False,
    ) -> None:
        super().__init__()
        self.chain_id = chain_id
        self.down = down
        self.roles = {"owner": owner, "settler": settler, "treasury": treasury}
        self.selectors = {
            "0x" + function_signature_to_4byte_selector(f"{name}()").hex(): name
            for name in self.roles
        }
        self.calls: list[str] = []

    async def make_request(self, method: RPCEndpoint, params: Any) -> RPCResponse:
        self.calls.append(str(method))
        if self.down:
            raise ConnectionError("rpc unreachable")
        if method == "eth_chainId":
            return {"jsonrpc": "2.0", "id": 1, "result": hex(self.chain_id)}
        if method == "eth_call":
            assert params[0]["to"].lower() == VAULT
            name = self.selectors[params[0]["data"][:10]]
            word = "0x" + "00" * 12 + self.roles[name][2:].lower()
            return {"jsonrpc": "2.0", "id": 1, "result": word}
        raise AssertionError(f"unexpected RPC {method}")

    async def is_connected(self, show_traceback: bool = False) -> bool:
        return True


async def test_read_vault_roles_reads_the_chain_id_and_the_three_views() -> None:
    rpc = FakeRpc(chain_id=BASE, owner=OWNER, settler=OTHER, treasury=TREASURY)
    roles = await read_vault_roles(AsyncWeb3(rpc), DEPLOYMENT)
    assert roles == VaultRoles(chain_id=BASE, owner=OWNER, settler=OTHER, treasury=TREASURY)
    assert "eth_chainId" in rpc.calls
    assert rpc.calls.count("eth_call") == 3


async def test_read_vault_roles_raises_on_an_rpc_error() -> None:
    with pytest.raises(ConnectionError):
        await read_vault_roles(AsyncWeb3(FakeRpc(down=True)), DEPLOYMENT)


# --------------------------------------------------------------------------- main()


class Boot:
    """Runs ``main()`` on a real artifact file and a fake RPC, and records, in order, what it
    got to start."""

    def __init__(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
        self.monkeypatch = monkeypatch
        self.tmp_path = tmp_path
        self.steps: list[str] = []
        steps = self.steps

        class FakeDatabase:
            def __init__(self, *_args: Any, **_kwargs: Any) -> None:
                steps.append("database")
                self.sessions = object()

            async def dispose(self) -> None:
                steps.append("dispose")

        class FakeRunner:
            def __init__(self, *_args: Any, **_kwargs: Any) -> None:
                steps.append("runner")

            async def run_forever(self) -> None:
                steps.append("run")

        def start_liveness(_liveness: Any) -> None:
            steps.append("liveness")

        monkeypatch.setattr(settler_main, "configure_logging", lambda *_a, **_k: None)
        monkeypatch.setattr(settler_main, "start_liveness_server_from_env", start_liveness)
        monkeypatch.setattr(settler_main, "Database", FakeDatabase)
        monkeypatch.setattr(settler_main, "SettlerRunner", FakeRunner)

    async def run(
        self,
        *,
        chain_id: int = BASE_SEPOLIA,
        rpc_chain_id: int | None = None,
        deployer: object = DEPLOYER,
        **roles: Any,
    ) -> None:
        """``chain_id`` is ``OPENAD_CHAIN_ID``, whose artifact records ``deployer``; the fake
        RPC serves ``rpc_chain_id`` (the same by default) and the vault ``roles`` (FakeRpc's
        keyword arguments)."""
        _write_artifact(self.tmp_path, chain_id, deployer=deployer)
        settings = SettlerSettings(
            env="test",
            settler_key=KEY,
            chain_id=chain_id,
            rpc_url="http://127.0.0.1:1",
            deployments_dir=self.tmp_path,
            _env_file=None,  # type: ignore[call-arg]  # pydantic-settings init-only kwarg
        )
        rpc = FakeRpc(chain_id=chain_id if rpc_chain_id is None else rpc_chain_id, **roles)
        self.monkeypatch.setattr(settler_main, "SettlerSettings", lambda: settings)
        self.monkeypatch.setattr(settler_main, "make_web3", lambda _url: AsyncWeb3(rpc))
        await settler_main.main()


@pytest.fixture
def boot(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Boot:
    return Boot(monkeypatch, tmp_path)


def _logged(logs: list[dict[str, Any]], level: str) -> list[str]:
    return [str(entry["event"]) for entry in logs if entry["log_level"] == level]


def _no_key(logs: list[dict[str, Any]]) -> bool:
    text = repr(logs).lower()
    return KEY[2:] not in text  # the key itself is never logged, with or without 0x


async def test_main_refuses_the_owner_key_before_the_listener(boot: Boot) -> None:
    with capture_logs() as logs, pytest.raises(SystemExit) as exited:
        await boot.run(chain_id=BASE_SEPOLIA, owner=ADDRESS)
    assert exited.value.code == 1
    assert boot.steps == []  # no liveness listener, no database, no runner
    assert _logged(logs, "error") == [KEY_IS_OWNER]
    refusal = next(entry for entry in logs if entry["event"] == KEY_IS_OWNER)
    assert (refusal["address"], refusal["owner"], refusal["deployer"], refusal["chain_id"]) == (
        ADDRESS,
        ADDRESS,
        DEPLOYER,
        BASE_SEPOLIA,
    )
    assert _no_key(logs)


async def test_main_refuses_the_deployer_key_after_ownership_moved(boot: Boot) -> None:
    # The review's case: the vault is owned by a Safe now, the key is the deployer's, and it is
    # settler(). Without the deployer rule nothing would flag it.
    with capture_logs() as logs, pytest.raises(SystemExit) as exited:
        await boot.run(chain_id=BASE, owner=OWNER, settler=ADDRESS, deployer=ADDRESS.lower())
    assert exited.value.code == 1
    assert boot.steps == []
    assert _logged(logs, "error") == [KEY_IS_DEPLOYER]
    assert _logged(logs, "warning") == []
    assert _no_key(logs)


async def test_main_exits_on_an_rpc_error_before_the_listener(boot: Boot) -> None:
    with capture_logs() as logs, pytest.raises(SystemExit) as exited:
        await boot.run(down=True)
    assert exited.value.code == 1
    assert boot.steps == []
    assert _logged(logs, "error") == ["settler.identity_check_failed"]
    assert _no_key(logs)


@pytest.mark.parametrize("deployer", [MISSING, "0x1234"])
async def test_main_exits_when_the_artifact_has_no_valid_deployer(
    boot: Boot, deployer: object
) -> None:
    with capture_logs() as logs, pytest.raises(SystemExit) as exited:
        await boot.run(deployer=deployer)
    assert exited.value.code == 1
    assert boot.steps == []
    assert _logged(logs, "error") == ["settler.identity_check_failed"]


async def test_main_refuses_a_chain_mismatch(boot: Boot) -> None:
    # OPENAD_CHAIN_ID says Anvil, but the RPC is Base Sepolia and the key owns the vault.
    with capture_logs() as logs, pytest.raises(SystemExit) as exited:
        await boot.run(chain_id=LOCAL_CHAIN_ID, rpc_chain_id=BASE_SEPOLIA, owner=ADDRESS)
    assert exited.value.code == 1
    assert boot.steps == []
    assert _logged(logs, "error") == [CHAIN_MISMATCH, KEY_IS_OWNER]


async def test_main_starts_the_listener_after_a_passing_check(boot: Boot) -> None:
    with capture_logs() as logs:
        await boot.run(chain_id=BASE_SEPOLIA, owner=OWNER, settler=ADDRESS, treasury=TREASURY)
    assert boot.steps == ["liveness", "database", "runner", "run", "dispose"]
    assert _logged(logs, "warning") == []
    assert _logged(logs, "error") == []
    assert "settler.identity_checked" in _logged(logs, "info")
    assert _no_key(logs)


async def test_main_only_warns_about_owner_side_keys_on_anvil(boot: Boot) -> None:
    # The local deploy: Anvil #0 is the deployer, the owner, the settler and the treasury.
    with capture_logs() as logs:
        await boot.run(
            chain_id=LOCAL_CHAIN_ID,
            owner=ADDRESS,
            settler=ADDRESS,
            treasury=ADDRESS,
            deployer=ADDRESS,
        )
    assert boot.steps[0] == "liveness"
    assert _logged(logs, "warning") == [KEY_IS_OWNER, KEY_IS_DEPLOYER, KEY_IS_TREASURY]
    assert _logged(logs, "error") == []


async def test_main_warns_but_runs_during_a_rotation(boot: Boot) -> None:
    with capture_logs() as logs:
        await boot.run(chain_id=BASE, owner=OWNER, settler=OTHER, treasury=TREASURY)
    assert boot.steps[0] == "liveness"
    assert _logged(logs, "warning") == [NOT_CURRENT_SETTLER]
