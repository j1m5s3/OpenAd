"""Marketplace unit tests (ROADMAP 1.3). PROTOCOL.md §5.2 check order, §8 (4, 5, 6, 10)."""

from __future__ import annotations

import boa
import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from tests.conftest import ADVERTISER_KEY
from tests.helpers import sign_permit, usdc

MEDIA_HASH = b"\xab" * 32
WEB = (300, 250, 0, "example.com")


def _setup_open_auction(ad_slot, market, registry, publisher, advertiser, *, lead=3600, period=3600, start_price=None, floor=None, mode=0, sale_end=0):
    start_price = usdc(100) if start_price is None else start_price
    floor = usdc(10) if floor is None else floor
    now = boa.env.evm.patch.timestamp
    first = now + lead  # auction opens immediately (open_at = first - lead = now)
    with boa.env.prank(publisher):
        sid = ad_slot.mint_slot(WEB)
        ad_slot.set_calendar(sid, period, first)
        market.set_terms(sid, start_price, floor, lead, sale_end, mode, 0, 0)
    with boa.env.prank(advertiser):
        cid = registry.register_media("https://cdn.example/a.png", MEDIA_HASH, "image/png", 300, 250, "https://adv.example")
        registry.request_approval(publisher, cid)
    with boa.env.prank(publisher):
        registry.set_approval(cid, True)
    return sid, cid, first


def test_price_at_open_mid_and_before_start(ad_slot, market, registry, publisher, advertiser):
    sid, cid, first = _setup_open_auction(ad_slot, market, registry, publisher, advertiser, lead=1000, start_price=usdc(100), floor=usdc(0))
    # at open_at (== now): price == start
    assert market.price(sid, 0) == usdc(100)
    boa.env.time_travel(seconds=500)
    mid = market.price(sid, 0)
    assert usdc(0) <= mid <= usdc(100)
    assert mid == usdc(50)  # halfway
    boa.env.time_travel(seconds=499)
    late = market.price(sid, 0)
    assert late < mid
    boa.env.time_travel(seconds=1)
    assert market.price(sid, 0) == usdc(0)  # remainder at start with floor 0


def test_remainder_price_and_quote(ad_slot, market, registry, publisher, advertiser):
    sid, cid, first = _setup_open_auction(
        ad_slot,
        market,
        registry,
        publisher,
        advertiser,
        lead=1000,
        period=3600,
        start_price=usdc(100),
        floor=usdc(10),
    )
    boa.env.time_travel(seconds=1000)  # now == start
    assert market.price(sid, 0) == usdc(10)
    q = market.quote(sid, 0)
    assert q.sellable is True and q.reason == ""
    boa.env.time_travel(seconds=1800)
    mid = market.price(sid, 0)
    assert mid == usdc(5)
    boa.env.time_travel(seconds=1800)
    with boa.reverts("closed"):
        market.price(sid, 0)
    q2 = market.quote(sid, 0)
    assert q2.sellable is False and q2.reason == "closed"


def test_fixed_price(ad_slot, market, registry, publisher, advertiser):
    sid, cid, _ = _setup_open_auction(ad_slot, market, registry, publisher, advertiser, start_price=usdc(25), floor=usdc(25))
    assert market.price(sid, 0) == usdc(25)


def test_not_open(ad_slot, market, registry, publisher, advertiser):
    now = boa.env.evm.patch.timestamp
    with boa.env.prank(publisher):
        sid = ad_slot.mint_slot(WEB)
        ad_slot.set_calendar(sid, 3600, now + 10_000)
        market.set_terms(sid, usdc(10), 0, 100, 0, 0, 0, 0)
    with boa.reverts("not open"):
        market.price(sid, 0)
    q = market.quote(sid, 0)
    assert q.sellable is False and q.reason == "not open"


def test_buy_revert_order(ad_slot, market, registry, publisher, advertiser, usdc_token):
    # 1. no terms
    with boa.env.prank(publisher):
        sid = ad_slot.mint_slot(WEB)
        ad_slot.set_calendar(sid, 3600, boa.env.evm.patch.timestamp + 3600)
    with boa.env.prank(advertiser):
        with boa.reverts("no terms"):
            market.buy(sid, 0, 1, usdc(1000))
    # 2. paused
    with boa.env.prank(publisher):
        market.set_terms(sid, usdc(100), usdc(10), 3600, 0, 0, 0, 0)
        market.set_paused(sid, True)
    with boa.env.prank(advertiser):
        with boa.reverts("paused"):
            market.buy(sid, 0, 1, usdc(1000))
    with boa.env.prank(publisher):
        market.set_paused(sid, False)
        market.set_terms(sid, usdc(100), usdc(10), 3600, boa.env.evm.patch.timestamp + 10, 0, 0, 0)
    with boa.env.prank(advertiser):
        with boa.reverts("beyond sale end"):
            market.buy(sid, 0, 1, usdc(1000))
    sid2, cid, _ = _setup_open_auction(ad_slot, market, registry, publisher, advertiser)
    with boa.env.prank(advertiser):
        with boa.reverts("price exceeds max"):
            market.buy(sid2, 0, cid, 0)
    other = boa.env.generate_address("other")
    with boa.env.prank(other):
        with boa.reverts("not creative owner"):
            market.buy(sid2, 0, cid, usdc(1000))
    with boa.env.prank(advertiser):
        cid_bad = registry.register_media("https://cdn.example/b.png", MEDIA_HASH, "image/png", 728, 90, "")
        registry.request_approval(publisher, cid_bad)
    with boa.env.prank(publisher):
        registry.set_approval(cid_bad, True)
    with boa.env.prank(advertiser):
        with boa.reverts("dimension mismatch"):
            market.buy(sid2, 0, cid_bad, usdc(1000))
        cid_unapproved = registry.register_media("https://cdn.example/c.png", MEDIA_HASH, "image/png", 300, 250, "")
        with boa.reverts("not approved"):
            market.buy(sid2, 0, cid_unapproved, usdc(1000))


def test_waived_blocked(ad_slot, market, registry, publisher, advertiser):
    sid, cid, _ = _setup_open_auction(ad_slot, market, registry, publisher, advertiser, mode=1)
    with boa.env.prank(publisher):
        registry.revoke_approval(cid)
    with boa.env.prank(advertiser):
        with boa.reverts("creative blocked"):
            market.buy(sid, 0, cid, usdc(1000))


def test_buy_fee_split_and_passthrough(ad_slot, market, registry, publisher, advertiser, usdc_token, treasury):
    sid, cid, _ = _setup_open_auction(ad_slot, market, registry, publisher, advertiser, start_price=usdc(100), floor=usdc(100))
    price = market.price(sid, 0)
    fee = price * 250 // 10_000
    with boa.env.prank(advertiser):
        usdc_token.approve(market.address, price)
        market.buy(sid, 0, cid, price)
    assert usdc_token.balanceOf(market.address) == 0
    assert usdc_token.balanceOf(treasury) == fee
    assert usdc_token.balanceOf(publisher) == price - fee
    lease = ad_slot.lease_of(sid, 0)
    assert lease.user == advertiser and lease.creative_id == cid
    with boa.env.prank(advertiser):
        with boa.reverts("already leased"):
            market.buy(sid, 0, cid, price)


def test_buy_with_permit(ad_slot, market, registry, publisher, advertiser, usdc_token, chain_id):
    sid, cid, _ = _setup_open_auction(ad_slot, market, registry, publisher, advertiser, start_price=usdc(40), floor=usdc(40))
    price = market.price(sid, 0)
    deadline = boa.env.evm.patch.timestamp + 3600
    v, r, s = sign_permit(
        token=usdc_token,
        owner_key=ADVERTISER_KEY,
        spender=market.address,
        value=price,
        deadline=deadline,
        chain_id=chain_id,
    )
    with boa.env.prank(advertiser):
        market.buy_with_permit(sid, 0, cid, price, deadline, v, r, s)
    assert ad_slot.lease_of(sid, 0).user == advertiser
    assert usdc_token.balanceOf(market.address) == 0


def test_buy_with_permit_preconsumed_still_works_with_allowance(
    ad_slot, market, registry, publisher, advertiser, usdc_token, chain_id
):
    sid, cid, _ = _setup_open_auction(ad_slot, market, registry, publisher, advertiser, start_price=usdc(40), floor=usdc(40))
    price = market.price(sid, 0)
    deadline = boa.env.evm.patch.timestamp + 3600
    v, r, s = sign_permit(
        token=usdc_token,
        owner_key=ADVERTISER_KEY,
        spender=market.address,
        value=price,
        deadline=deadline,
        chain_id=chain_id,
    )
    # Front-run: consume the permit, then set allowance directly.
    usdc_token.permit(advertiser, market.address, price, deadline, v, r, s)
    with boa.env.prank(advertiser):
        usdc_token.approve(market.address, price)
        market.buy_with_permit(sid, 0, cid, price, deadline, v, r, s)
    assert ad_slot.lease_of(sid, 0).user == advertiser


def test_cpc_mode_buy_quote_and_price(ad_slot, market, registry, publisher, advertiser):
    with boa.env.prank(publisher):
        sid = ad_slot.mint_slot(WEB)
        market.set_terms(sid, 0, 0, 0, 0, 0, 1, 100_000)
    q = market.quote(sid, 0)
    assert q.sellable is False and q.reason == "cpc mode"
    with boa.reverts("cpc mode"):
        market.price(sid, 0)
    with boa.env.prank(advertiser):
        with boa.reverts("cpc mode"):
            market.buy(sid, 0, 1, usdc(1000))


def test_quote_sellable(ad_slot, market, registry, publisher, advertiser):
    sid, cid, _ = _setup_open_auction(ad_slot, market, registry, publisher, advertiser)
    q = market.quote(sid, 0)
    assert q.sellable is True
    assert q.reason == ""
    assert q.price == market.price(sid, 0)
    assert q.fee == q.price * 250 // 10_000


def test_set_fee_and_treasury(market, publisher):
    with boa.env.prank(publisher):
        with boa.reverts():
            market.set_fee_bps(1)
    with boa.reverts("fee too high"):
        market.set_fee_bps(1001)
    with boa.reverts("bad treasury"):
        market.set_treasury("0x" + "00" * 20)


@given(t=st.integers(min_value=0, max_value=999))
@settings(max_examples=30, deadline=None)
def test_price_bounds_and_monotonic(t):
    # Isolated deploy so hypothesis examples don't share state.
    from src import AdSlot, CreativeRegistry, Marketplace
    from src.mocks import MockUSDC

    usdc_token = MockUSDC.deploy()
    usdc_token.mint(boa.env.eoa, usdc(1_000_000))
    registry = CreativeRegistry.deploy()
    slot = AdSlot.deploy("OpenAd Slot", "OASLT", "http://x/")
    m = Marketplace.deploy(usdc_token.address, slot.address, registry.address)
    slot.set_market(m.address)
    pub = boa.env.generate_address("p")
    with boa.env.prank(pub):
        sid = slot.mint_slot(WEB)
        lead = 1000
        first = boa.env.evm.patch.timestamp + lead
        slot.set_calendar(sid, 3600, first)
        m.set_terms(sid, usdc(100), usdc(10), lead, 0, 0, 0, 0)
    boa.env.time_travel(seconds=min(t, 999))
    p = m.price(sid, 0)
    assert usdc(10) <= p <= usdc(100)
    if t < 999:
        later = p
        boa.env.time_travel(seconds=1)
        p2 = m.price(sid, 0)
        assert p2 <= later
