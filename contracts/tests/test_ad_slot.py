"""AdSlot unit tests (ROADMAP 1.2). PROTOCOL.md §5.1, §8 (1, 2, 3, 9)."""

from __future__ import annotations

import boa
import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

WEB = (300, 250, 0, "example.com")


def mint_web(ad_slot, prank, spec=WEB):
    with boa.env.prank(prank):
        return ad_slot.mint_slot(spec)


def test_mint_validation(ad_slot, publisher):
    slot_id = mint_web(ad_slot, publisher)
    assert slot_id == 1
    assert ad_slot.ownerOf(1) == publisher
    spec = ad_slot.spec_of(1)
    assert spec.width == 300 and spec.domain == "example.com"
    with boa.env.prank(publisher):
        with boa.reverts("empty domain"):
            ad_slot.mint_slot((1, 1, 0, ""))
        with boa.reverts("bad kind"):
            ad_slot.mint_slot((1, 1, 4, "x.com"))
        with boa.reverts("bad dimensions"):
            ad_slot.mint_slot((0, 250, 0, "x.com"))


def test_newsletter_allows_zero_pixels(ad_slot, publisher):
    with boa.env.prank(publisher):
        sid = ad_slot.mint_slot((0, 0, 1, "news.example"))
    assert sid == 1


def test_set_calendar_and_period_window(ad_slot, publisher):
    sid = mint_web(ad_slot, publisher)
    start = boa.env.evm.patch.timestamp + 3600
    with boa.env.prank(publisher):
        ad_slot.set_calendar(sid, 3600, start)
    cal = ad_slot.calendar_of(sid)
    assert cal.version == 1
    assert cal.period_seconds == 3600
    s, e = ad_slot.period_window(sid, 0)
    assert s == start and e == start + 3600
    s1, e1 = ad_slot.period_window(sid, 1)
    assert s1 == start + 3600 and e1 == start + 7200


def test_calendar_reverts(ad_slot, publisher, advertiser):
    sid = mint_web(ad_slot, publisher)
    with boa.env.prank(advertiser):
        with boa.reverts("not owner"):
            ad_slot.set_calendar(sid, 3600, 1)
    with boa.env.prank(publisher):
        with boa.reverts("period too short"):
            ad_slot.set_calendar(sid, 3599, 1)
        with boa.reverts("no calendar"):
            ad_slot.period_window(sid, 0)


def test_set_lease_market_only_and_userOf(ad_slot, publisher, advertiser, market):
    sid = mint_web(ad_slot, publisher)
    now = boa.env.evm.patch.timestamp
    with boa.env.prank(publisher):
        ad_slot.set_calendar(sid, 3600, now + 10)
    # period 0 ends at now+10+3600; still in the future
    with boa.env.prank(advertiser):
        with boa.reverts("not market"):
            ad_slot.set_lease(sid, 0, advertiser, 1)
    with boa.env.prank(market.address):
        ad_slot.set_lease(sid, 0, advertiser, 7)
    lease = ad_slot.lease_of(sid, 0)
    assert lease.user == advertiser and lease.creative_id == 7
    assert ad_slot.last_leased_end_of(sid) == now + 10 + 3600
    # current period does not exist yet (before first_period_start)
    exists, _ = ad_slot.current_period(sid)
    assert exists is False
    assert ad_slot.userOf(sid) == "0x" + "00" * 20
    boa.env.time_travel(seconds=15)
    exists, idx = ad_slot.current_period(sid)
    assert exists is True and idx == 0
    assert ad_slot.userOf(sid) == advertiser
    assert ad_slot.userExpires(sid) == now + 10 + 3600
    boa.env.time_travel(seconds=3600)
    exists, idx = ad_slot.current_period(sid)
    assert exists is True and idx == 1
    assert ad_slot.userOf(sid) == "0x" + "00" * 20
    assert ad_slot.userExpires(sid) == 0


def test_leases_outstanding_blocks_calendar(ad_slot, publisher, advertiser, market):
    sid = mint_web(ad_slot, publisher)
    now = boa.env.evm.patch.timestamp
    with boa.env.prank(publisher):
        ad_slot.set_calendar(sid, 3600, now + 100)
    with boa.env.prank(market.address):
        ad_slot.set_lease(sid, 0, advertiser, 1)
    with boa.env.prank(publisher):
        with boa.reverts("leases outstanding"):
            ad_slot.set_calendar(sid, 3600, now + 10_000)
    # after the lease ends, calendar can change
    boa.env.time_travel(seconds=100 + 3600 + 1)
    with boa.env.prank(publisher):
        ad_slot.set_calendar(sid, 7200, boa.env.evm.patch.timestamp + 10)
    assert ad_slot.calendar_of(sid).version == 2


def test_already_leased_and_bad_lease(ad_slot, publisher, advertiser, market):
    sid = mint_web(ad_slot, publisher)
    now = boa.env.evm.patch.timestamp
    with boa.env.prank(publisher):
        ad_slot.set_calendar(sid, 3600, now + 50)
    with boa.env.prank(market.address):
        with boa.reverts("bad lease"):
            ad_slot.set_lease(sid, 0, "0x" + "00" * 20, 1)
        with boa.reverts("bad lease"):
            ad_slot.set_lease(sid, 0, advertiser, 0)
        ad_slot.set_lease(sid, 0, advertiser, 1)
        with boa.reverts("already leased"):
            ad_slot.set_lease(sid, 0, advertiser, 2)


def test_period_ended(ad_slot, publisher, advertiser, market):
    sid = mint_web(ad_slot, publisher)
    now = boa.env.evm.patch.timestamp
    with boa.env.prank(publisher):
        ad_slot.set_calendar(sid, 3600, now)
    boa.env.time_travel(seconds=3601)
    with boa.env.prank(market.address):
        with boa.reverts("period ended"):
            ad_slot.set_lease(sid, 0, advertiser, 1)


def test_token_uri_and_set_base_uri(ad_slot, publisher):
    sid = mint_web(ad_slot, publisher)
    assert ad_slot.tokenURI(sid) == "http://localhost:8000/v1/slots/1"
    ad_slot.set_base_uri("https://api.example/v1/slots/")
    assert ad_slot.tokenURI(sid) == "https://api.example/v1/slots/1"


def test_set_market_owner_only(ad_slot, publisher):
    with boa.env.prank(publisher):
        with boa.reverts():
            ad_slot.set_market(publisher)


@given(n=st.integers(min_value=1, max_value=5))
@settings(max_examples=15, deadline=None)
def test_leases_never_overlap_within_version(n):
    slot = boa.load("src/AdSlot.vy", "OpenAd Slot", "OASLT", "http://x/")
    pub = boa.env.generate_address("p")
    market = boa.env.generate_address("m")
    adv = boa.env.generate_address("a")
    slot.set_market(market)
    with boa.env.prank(pub):
        sid = slot.mint_slot(WEB)
        slot.set_calendar(sid, 3600, boa.env.evm.patch.timestamp + 10)
    windows = []
    with boa.env.prank(market):
        for i in range(n):
            slot.set_lease(sid, i, adv, i + 1)
            windows.append(slot.period_window(sid, i))
    for i in range(n - 1):
        assert windows[i][1] == windows[i + 1][0]
        assert windows[i][0] < windows[i][1]
    assert slot.last_leased_end_of(sid) >= max(w[1] for w in windows)
