"""Property tests for PROTOCOL.md section 8 invariants not covered in per-contract files."""

from __future__ import annotations

import boa
from hypothesis import given, settings
from hypothesis import strategies as st

from src.mocks import MockUSDC
from src import AdSlot, CreativeRegistry, Marketplace
from tests.helpers import usdc

WEB = (300, 250, 0, "example.com")
MEDIA_HASH = b"\xcd" * 32


@given(fee_bps=st.integers(min_value=0, max_value=1000), price=st.integers(min_value=0, max_value=10**12))
@settings(max_examples=40, deadline=None)
def test_invariant_5_fee_plus_publisher_equals_price(fee_bps, price):
    fee = price * fee_bps // 10_000
    assert fee + (price - fee) == price
    assert fee_bps <= 1000


def test_invariant_3_only_market_writes_leases():
    slot = AdSlot.deploy("OpenAd Slot", "OASLT", "http://x/")
    pub = boa.env.generate_address("p")
    stranger = boa.env.generate_address("s")
    market = boa.env.generate_address("m")
    slot.set_market(market)
    with boa.env.prank(pub):
        sid = slot.mint_slot(WEB)
        slot.set_calendar(sid, 3600, boa.env.evm.patch.timestamp + 100)
    with boa.env.prank(stranger):
        with boa.reverts("not market"):
            slot.set_lease(sid, 0, stranger, 1)
    with boa.env.prank(market):
        slot.set_lease(sid, 0, stranger, 1)
    assert slot.lease_of(sid, 0).user == stranger


def test_invariant_6_and_10_buy_passthrough_atomicity():
    token = MockUSDC.deploy()
    token.mint(boa.env.eoa, usdc(1_000_000))
    registry = CreativeRegistry.deploy()
    slot = AdSlot.deploy("OpenAd Slot", "OASLT", "http://x/")
    market = Marketplace.deploy(token.address, slot.address, registry.address)
    slot.set_market(market.address)
    treasury = boa.env.generate_address("t")
    market.set_treasury(treasury)
    market.set_fee_bps(250)
    pub = boa.env.generate_address("p")
    adv = boa.env.generate_address("a")
    token.mint(adv, usdc(1_000))
    now = boa.env.evm.patch.timestamp
    with boa.env.prank(pub):
        sid = slot.mint_slot(WEB)
        slot.set_calendar(sid, 3600, now + 3600)
        market.set_terms(sid, usdc(100), usdc(100), 3600, 0, 0)
    with boa.env.prank(adv):
        cid = registry.register_media("https://x/a.png", MEDIA_HASH, "image/png", 300, 250, "")
        registry.request_approval(pub, cid)
    with boa.env.prank(pub):
        registry.set_approval(cid, True)
    before_m = token.balanceOf(market.address)
    with boa.env.prank(adv):
        token.approve(market.address, usdc(100))
        market.buy(sid, 0, cid, usdc(100))
    assert token.balanceOf(market.address) == before_m == 0
    assert slot.lease_of(sid, 0).user == adv
    # failed buy (already leased) leaves balances unchanged
    pub_bal = token.balanceOf(pub)
    tre_bal = token.balanceOf(treasury)
    with boa.env.prank(adv):
        token.approve(market.address, usdc(100))
        with boa.reverts("already leased"):
            market.buy(sid, 0, cid, usdc(100))
    assert token.balanceOf(pub) == pub_bal
    assert token.balanceOf(treasury) == tre_bal
    assert token.balanceOf(market.address) == 0


@given(elapsed=st.integers(min_value=0, max_value=3599))
@settings(max_examples=20, deadline=None)
def test_invariant_4_remainder_price(elapsed: int) -> None:
    from src import AdSlot, CreativeRegistry, Marketplace
    from src.mocks import MockUSDC

    token = MockUSDC.deploy()
    registry = CreativeRegistry.deploy()
    slot = AdSlot.deploy("OpenAd Slot", "OASLT", "http://x/")
    m = Marketplace.deploy(token.address, slot.address, registry.address)
    slot.set_market(m.address)
    pub = boa.env.generate_address("p")
    period = 3600
    lead = 100
    floor = usdc(10)
    with boa.env.prank(pub):
        sid = slot.mint_slot(WEB)
        first = boa.env.evm.patch.timestamp + lead
        slot.set_calendar(sid, period, first)
        m.set_terms(sid, usdc(100), floor, lead, 0, 0)
    boa.env.time_travel(seconds=lead + elapsed)
    p = m.price(sid, 0)
    remaining = period - elapsed
    assert p == floor * remaining // period
    assert 0 <= p <= floor
