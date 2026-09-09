"""MockUSDC: proves the toolchain (snekmate modules, permit signing helper, boa fixtures)."""

from __future__ import annotations

import boa
import pytest

from tests.conftest import ADVERTISER_KEY
from tests.helpers import sign_permit, usdc


def test_metadata(usdc_token):
    assert usdc_token.name() == "USD Coin (Mock)"
    assert usdc_token.symbol() == "USDC"
    assert usdc_token.decimals() == 6


def test_mint_is_owner_gated(usdc_token, publisher, advertiser):
    assert usdc_token.balanceOf(advertiser) == usdc(10_000)
    with boa.reverts():
        with boa.env.prank(publisher):
            usdc_token.mint(publisher, usdc(1))


def test_transfer(usdc_token, publisher, advertiser):
    with boa.env.prank(advertiser):
        assert usdc_token.transfer(publisher, usdc(12.5))
    assert usdc_token.balanceOf(publisher) == usdc(12.5)
    assert usdc_token.balanceOf(advertiser) == usdc(10_000) - usdc(12.5)


def test_permit_then_transfer_from(usdc_token, publisher, advertiser, chain_id):
    spender = boa.env.generate_address("spender")
    deadline = boa.env.evm.patch.timestamp + 3600
    v, r, s = sign_permit(
        token=usdc_token,
        owner_key=ADVERTISER_KEY,
        spender=spender,
        value=usdc(100),
        deadline=deadline,
        chain_id=chain_id,
    )
    # Anyone may submit the permit (this is what Marketplace.buy_with_permit relies on).
    usdc_token.permit(advertiser, spender, usdc(100), deadline, v, r, s)
    assert usdc_token.allowance(advertiser, spender) == usdc(100)
    assert usdc_token.nonces(advertiser) == 1

    with boa.env.prank(spender):
        assert usdc_token.transferFrom(advertiser, publisher, usdc(40))
    assert usdc_token.allowance(advertiser, spender) == usdc(60)
    assert usdc_token.balanceOf(publisher) == usdc(40)


def test_permit_replay_rejected(usdc_token, advertiser, chain_id):
    spender = boa.env.generate_address("spender")
    deadline = boa.env.evm.patch.timestamp + 3600
    sig = sign_permit(
        token=usdc_token,
        owner_key=ADVERTISER_KEY,
        spender=spender,
        value=usdc(1),
        deadline=deadline,
        chain_id=chain_id,
    )
    usdc_token.permit(advertiser, spender, usdc(1), deadline, *sig)
    with boa.reverts():
        usdc_token.permit(advertiser, spender, usdc(1), deadline, *sig)


@pytest.mark.parametrize("seconds", [1, 3600, 7 * 86400])
def test_time_travel_moves_block_timestamp(seconds):
    before = boa.env.evm.patch.timestamp
    boa.env.time_travel(seconds=seconds)
    assert boa.env.evm.patch.timestamp == before + seconds
