"""Pytest fixtures for OpenAd contract tests (titanoboa / pyevm).

Conventions: docs/CONVENTIONS.md section 3. Time is controlled with `boa.env.time_travel`;
never sleep. Fixtures here are shared by all test files; contract-specific fixtures live in
their own test modules.
"""

from __future__ import annotations

import boa
import pytest
from eth_account import Account

from script.deploy import deploy_usdc
from tests.helpers import usdc

# Deterministic test personas. Keys are only ever used on the in-process EVM.
PUBLISHER_KEY = "0x" + "11" * 32
ADVERTISER_KEY = "0x" + "22" * 32
TREASURY_KEY = "0x" + "33" * 32


@pytest.fixture(scope="session")
def deployer() -> str:
    return boa.env.eoa


@pytest.fixture(scope="session")
def publisher() -> str:
    return Account.from_key(PUBLISHER_KEY).address


@pytest.fixture(scope="session")
def advertiser() -> str:
    return Account.from_key(ADVERTISER_KEY).address


@pytest.fixture(scope="session")
def treasury() -> str:
    return Account.from_key(TREASURY_KEY).address


@pytest.fixture(scope="session")
def chain_id() -> int:
    return boa.env.evm.patch.chain_id


@pytest.fixture
def usdc_token(advertiser: str):
    """Fresh MockUSDC per test; advertiser starts with 10,000 USDC."""
    token = deploy_usdc()
    token.mint(advertiser, usdc(10_000))
    return token
