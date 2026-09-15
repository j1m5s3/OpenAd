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
        market.set_terms(sid, usdc(100), usdc(100), 3600, 0, 0, 0, 0)
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
        m.set_terms(sid, usdc(100), floor, lead, 0, 0, 0, 0)
    boa.env.time_travel(seconds=lead + elapsed)
    p = m.price(sid, 0)
    remaining = period - elapsed
    assert p == floor * remaining // period
    assert 0 <= p <= floor


FLOOR_CPC = 100_000
BATCH_A = b"\xaa" * 32
MEDIA_HASH = b"\xcd" * 32


@given(
    budget=st.integers(min_value=FLOOR_CPC, max_value=usdc(100)),
    charge=st.integers(min_value=1, max_value=usdc(100)),
)
@settings(max_examples=15, deadline=None)
def test_invariants_11_to_15_settle_then_finalize(budget: int, charge: int):
    from hypothesis import assume
    from src import CampaignVault
    from src.mocks import MockUSDC

    assume(charge <= budget)
    token = MockUSDC.deploy()
    token.mint(boa.env.eoa, usdc(1_000_000))
    registry = CreativeRegistry.deploy()
    slot = AdSlot.deploy("OpenAd Slot", "OASLT", "http://x/")
    m = Marketplace.deploy(token.address, slot.address, registry.address)
    slot.set_market(m.address)
    v = CampaignVault.deploy(token.address, slot.address, registry.address, m.address)
    m.set_campaign_vault(v.address)
    pub = boa.env.generate_address("p")
    adv = boa.env.generate_address("a")
    tre = boa.env.generate_address("t")
    stl = boa.env.generate_address("s")
    m.set_treasury(tre)
    v.set_treasury(tre)
    v.set_fee_bps(250)
    v.set_settler(stl)
    token.mint(adv, budget)
    with boa.env.prank(pub):
        sid = slot.mint_slot(WEB)
        m.set_terms(sid, 0, 0, 0, 0, 0, 1, FLOOR_CPC)
    with boa.env.prank(adv):
        cid = registry.register_media("https://x/a.png", MEDIA_HASH, "image/png", 300, 250, "")
        registry.request_approval(pub, cid)
    with boa.env.prank(pub):
        registry.set_approval(cid, True)
    with boa.env.prank(adv):
        token.approve(v.address, budget)
        camp_id = v.open_campaign(sid, cid, max(FLOOR_CPC, 1), budget, 0, 0)
    assert token.balanceOf(v.address) == v.campaign_of(camp_id).remaining == budget
    assert token.balanceOf(m.address) == 0
    assert int(slot.lease_of(sid, 0).user, 16) == 0
    with boa.env.prank(stl):
        v.settle_batch(camp_id, 1, charge, BATCH_A)
    rem = v.campaign_of(camp_id).remaining
    assert rem == budget - charge
    assert token.balanceOf(v.address) == rem
    with boa.env.prank(adv):
        v.request_close(camp_id)
    boa.env.time_travel(seconds=3600)
    adv_before = token.balanceOf(adv)
    v.finalize_close(camp_id)
    assert token.balanceOf(adv) == adv_before + rem
    assert v.campaign_of(camp_id).remaining == 0
    assert token.balanceOf(v.address) == 0
    assert charge + rem == budget
