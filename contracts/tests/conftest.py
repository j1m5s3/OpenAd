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
from src.mocks import MockUSDC
from tests.helpers import usdc

# Deterministic test personas. Keys are only ever used on the in-process EVM.
PUBLISHER_KEY = "0x" + "11" * 32
ADVERTISER_KEY = "0x" + "22" * 32
TREASURY_KEY = "0x" + "33" * 32
SETTLER_KEY = "0x" + "44" * 32


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
def settler() -> str:
    return Account.from_key(SETTLER_KEY).address


@pytest.fixture(scope="session")
def chain_id() -> int:
    return boa.env.evm.patch.chain_id


@pytest.fixture
def usdc_token(advertiser: str):
    """Fresh MockUSDC per test; advertiser starts with 10,000 USDC."""
    try:
        token = deploy_usdc()
    except ValueError:
        token = MockUSDC.deploy()
        token.mint(boa.env.eoa, 1_000_000 * 10**6)
    token.mint(advertiser, usdc(10_000))
    return token


@pytest.fixture
def registry():
    from src import CreativeRegistry

    return CreativeRegistry.deploy()


@pytest.fixture
def ad_slot():
    from src import AdSlot

    return AdSlot.deploy("OpenAd Slot", "OASLT", "http://localhost:8000/v1/slots/")


@pytest.fixture
def market(usdc_token, ad_slot, registry, treasury):
    from src import Marketplace

    m = Marketplace.deploy(usdc_token.address, ad_slot.address, registry.address)
    ad_slot.set_market(m.address)
    m.set_treasury(treasury)
    m.set_fee_bps(250)
    return m


@pytest.fixture
def vault(usdc_token, ad_slot, registry, market, treasury, settler):
    from src import CampaignVault

    v = CampaignVault.deploy(
        usdc_token.address, ad_slot.address, registry.address, market.address
    )
    market.set_campaign_vault(v.address)
    v.set_treasury(treasury)
    v.set_fee_bps(250)
    v.set_settler(settler)
    return v
