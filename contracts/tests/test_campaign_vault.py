"""CampaignVault + CPC Terms (ROADMAP 5.3). PROTOCOL.md §11 check order and invariants 11–15."""

from __future__ import annotations

import boa

from tests.conftest import ADVERTISER_KEY
from tests.helpers import sign_permit, usdc

MEDIA_HASH = b"\xcd" * 32
WEB = (300, 250, 0, "example.com")
FLOOR_CPC = 100_000  # 0.10 USDC
BATCH_A = b"\xaa" * 32
BATCH_B = b"\xbb" * 32


def _register_approved(registry, publisher, advertiser, *, w=300, h=250):
    with boa.env.prank(advertiser):
        cid = registry.register_media(
            "https://cdn.example/cpc.png", MEDIA_HASH, "image/png", w, h, "https://adv.example"
        )
        registry.request_approval(publisher, cid)
    with boa.env.prank(publisher):
        registry.set_approval(cid, True)
    return cid


def _cpc_slot(ad_slot, market, registry, publisher, advertiser, *, floor=FLOOR_CPC, approval=0):
    with boa.env.prank(publisher):
        sid = ad_slot.mint_slot(WEB)
        market.set_terms(sid, 0, 0, 0, 0, approval, 1, floor)
    cid = _register_approved(registry, publisher, advertiser)
    return sid, cid


def _open(vault, usdc_token, advertiser, sid, cid, *, max_cpc=None, budget=None, valid_from=0, valid_until=0):
    max_cpc = usdc(1) if max_cpc is None else max_cpc
    budget = usdc(10) if budget is None else budget
    with boa.env.prank(advertiser):
        usdc_token.approve(vault.address, budget)
        camp_id = vault.open_campaign(sid, cid, max_cpc, budget, valid_from, valid_until)
    return camp_id, max_cpc, budget


def test_set_terms_reverts(ad_slot, market, publisher):
    with boa.env.prank(publisher):
        sid = ad_slot.mint_slot(WEB)
    stranger = boa.env.generate_address("x")
    with boa.env.prank(stranger):
        with boa.reverts("not owner"):
            market.set_terms(sid, usdc(10), usdc(1), 100, 0, 0, 0, 0)
    with boa.env.prank(publisher):
        with boa.reverts("bad mode"):
            market.set_terms(sid, usdc(10), usdc(1), 100, 0, 2, 0, 0)
        with boa.reverts("bad mode"):
            market.set_terms(sid, 0, 0, 0, 0, 0, 2, FLOOR_CPC)
        with boa.reverts("bad prices"):
            market.set_terms(sid, usdc(1), usdc(10), 100, 0, 0, 0, 0)
        with boa.reverts("bad lead"):
            market.set_terms(sid, usdc(10), usdc(1), 0, 0, 0, 0, 0)
        with boa.reverts("bad floor cpc"):
            market.set_terms(sid, 0, 0, 0, 0, 0, 1, 0)
        market.set_terms(sid, 0, 0, 0, 0, 0, 1, FLOOR_CPC)
    t = market.terms_of(sid)
    assert t.sale_mode == 1 and t.floor_cpc == FLOOR_CPC


def test_leases_outstanding_blocks_cpc(ad_slot, market, registry, publisher, advertiser, usdc_token):
    now = boa.env.evm.patch.timestamp
    with boa.env.prank(publisher):
        sid = ad_slot.mint_slot(WEB)
        ad_slot.set_calendar(sid, 3600, now + 3600)
        market.set_terms(sid, usdc(10), usdc(10), 3600, 0, 0, 0, 0)
    cid = _register_approved(registry, publisher, advertiser)
    with boa.env.prank(advertiser):
        usdc_token.approve(market.address, usdc(10))
        market.buy(sid, 0, cid, usdc(10))
    with boa.env.prank(publisher):
        with boa.reverts("leases outstanding"):
            market.set_terms(sid, 0, 0, 0, 0, 0, 1, FLOOR_CPC)


def test_campaigns_open_blocks_lease(ad_slot, market, registry, publisher, advertiser, usdc_token, vault):
    sid, cid = _cpc_slot(ad_slot, market, registry, publisher, advertiser)
    _open(vault, usdc_token, advertiser, sid, cid)
    with boa.env.prank(publisher):
        with boa.reverts("campaigns open"):
            market.set_terms(sid, usdc(10), usdc(1), 100, 0, 0, 0, 0)
    assert vault.open_campaigns_of(sid) == 1


def test_open_campaign_revert_order(ad_slot, market, registry, publisher, advertiser, usdc_token, vault):
    with boa.env.prank(publisher):
        sid = ad_slot.mint_slot(WEB)
    cid = _register_approved(registry, publisher, advertiser)
    with boa.env.prank(advertiser):
        usdc_token.approve(vault.address, usdc(10))
        with boa.reverts("no terms"):
            vault.open_campaign(sid, cid, usdc(1), usdc(10), 0, 0)
    with boa.env.prank(publisher):
        market.set_terms(sid, usdc(10), usdc(1), 100, 0, 0, 0, 0)
    with boa.env.prank(advertiser):
        with boa.reverts("lease mode"):
            vault.open_campaign(sid, cid, usdc(1), usdc(10), 0, 0)
    with boa.env.prank(publisher):
        market.set_terms(sid, 0, 0, 0, 0, 0, 1, FLOOR_CPC)
        market.set_paused(sid, True)
    with boa.env.prank(advertiser):
        with boa.reverts("paused"):
            vault.open_campaign(sid, cid, usdc(1), usdc(10), 0, 0)
    with boa.env.prank(publisher):
        market.set_paused(sid, False)
    with boa.env.prank(advertiser):
        with boa.reverts("below floor"):
            vault.open_campaign(sid, cid, FLOOR_CPC - 1, usdc(10), 0, 0)
        with boa.reverts("budget too small"):
            vault.open_campaign(sid, cid, usdc(1), FLOOR_CPC - 1, 0, 0)
        with boa.reverts("bad window"):
            vault.open_campaign(sid, cid, usdc(1), usdc(10), 10, 10)
        with boa.reverts("bad window"):
            vault.open_campaign(sid, cid, usdc(1), usdc(10), 20, 10)
        cid_bad = registry.register_media(
            "https://cdn.example/wide.png", MEDIA_HASH, "image/png", 728, 90, ""
        )
        registry.request_approval(publisher, cid_bad)
    with boa.env.prank(publisher):
        registry.set_approval(cid_bad, True)
    with boa.env.prank(advertiser):
        with boa.reverts("dimension mismatch"):
            vault.open_campaign(sid, cid_bad, usdc(1), usdc(10), 0, 0)
        cid_unapproved = registry.register_media(
            "https://cdn.example/u.png", MEDIA_HASH, "image/png", 300, 250, ""
        )
        with boa.reverts("not approved"):
            vault.open_campaign(sid, cid_unapproved, usdc(1), usdc(10), 0, 0)
    other = boa.env.generate_address("o")
    with boa.env.prank(other):
        with boa.reverts("not creative owner"):
            vault.open_campaign(sid, cid, usdc(1), usdc(10), 0, 0)


def test_open_top_up_permits_and_settle(
    ad_slot, market, registry, publisher, advertiser, usdc_token, vault, settler, treasury, chain_id
):
    sid, cid = _cpc_slot(ad_slot, market, registry, publisher, advertiser)
    budget = usdc(10)
    deadline = boa.env.evm.patch.timestamp + 3600
    v, r, s = sign_permit(
        token=usdc_token,
        owner_key=ADVERTISER_KEY,
        spender=vault.address,
        value=budget,
        deadline=deadline,
        chain_id=chain_id,
    )
    with boa.env.prank(advertiser):
        camp_id = vault.open_campaign_with_permit(sid, cid, usdc(1), budget, 0, 0, deadline, v, r, s)
    assert camp_id == 1
    camp = vault.campaign_of(camp_id)
    assert camp.advertiser == advertiser
    assert camp.remaining == budget
    assert usdc_token.balanceOf(vault.address) == budget
    assert vault.open_campaigns_of(sid) == 1

    top = usdc(2)
    deadline2 = deadline + 1
    v2, r2, s2 = sign_permit(
        token=usdc_token,
        owner_key=ADVERTISER_KEY,
        spender=vault.address,
        value=top,
        deadline=deadline2,
        chain_id=chain_id,
    )
    with boa.env.prank(advertiser):
        vault.top_up_with_permit(camp_id, top, deadline2, v2, r2, s2)
    assert vault.campaign_of(camp_id).remaining == budget + top
    assert usdc_token.balanceOf(vault.address) == budget + top

    charged = usdc(1)
    fee = charged * 250 // 10_000
    pub_before = usdc_token.balanceOf(publisher)
    tre_before = usdc_token.balanceOf(treasury)
    with boa.env.prank(advertiser):
        with boa.reverts("not settler"):
            vault.settle_batch(camp_id, 3, charged, BATCH_A)
    with boa.env.prank(settler):
        vault.settle_batch(camp_id, 3, charged, BATCH_A)
        with boa.reverts("batch used"):
            vault.settle_batch(camp_id, 3, charged, BATCH_A)
        with boa.reverts("bad charge"):
            vault.settle_batch(camp_id, 0, charged, BATCH_B)
        with boa.reverts("bad charge"):
            vault.settle_batch(camp_id, 1, 0, BATCH_B)
    assert vault.used_batch(BATCH_A) is True
    assert vault.campaign_of(camp_id).remaining == budget + top - charged
    assert usdc_token.balanceOf(vault.address) == budget + top - charged
    assert usdc_token.balanceOf(treasury) == tre_before + fee
    assert usdc_token.balanceOf(publisher) == pub_before + charged - fee
    assert int(ad_slot.lease_of(sid, 0).user, 16) == 0


def test_permit_preconsumed_still_opens_with_allowance(
    ad_slot, market, registry, publisher, advertiser, usdc_token, vault, chain_id
):
    sid, cid = _cpc_slot(ad_slot, market, registry, publisher, advertiser)
    budget = usdc(5)
    deadline = boa.env.evm.patch.timestamp + 3600
    v, r, s = sign_permit(
        token=usdc_token,
        owner_key=ADVERTISER_KEY,
        spender=vault.address,
        value=budget,
        deadline=deadline,
        chain_id=chain_id,
    )
    usdc_token.permit(advertiser, vault.address, budget, deadline, v, r, s)
    with boa.env.prank(advertiser):
        usdc_token.approve(vault.address, budget)
        camp_id = vault.open_campaign_with_permit(sid, cid, usdc(1), budget, 0, 0, deadline, v, r, s)
    assert vault.campaign_of(camp_id).remaining == budget


def test_pause_close_finalize_and_mode_switch(
    ad_slot, market, registry, publisher, advertiser, usdc_token, vault
):
    sid, cid = _cpc_slot(ad_slot, market, registry, publisher, advertiser)
    camp_id, _, budget = _open(vault, usdc_token, advertiser, sid, cid)
    with boa.env.prank(advertiser):
        vault.set_paused(camp_id, True)
        vault.set_max_cpc(camp_id, usdc(2))
        with boa.reverts("below floor"):
            vault.set_max_cpc(camp_id, FLOOR_CPC - 1)
        vault.request_close(camp_id)
        with boa.reverts("closing"):
            vault.request_close(camp_id)
        with boa.reverts("too early"):
            vault.finalize_close(camp_id)
    boa.env.time_travel(seconds=3600)
    adv_before = usdc_token.balanceOf(advertiser)
    vault.finalize_close(camp_id)
    assert vault.campaign_of(camp_id).closed is True
    assert vault.campaign_of(camp_id).remaining == 0
    assert usdc_token.balanceOf(advertiser) == adv_before + budget
    assert usdc_token.balanceOf(vault.address) == 0
    assert vault.open_campaigns_of(sid) == 0
    with boa.env.prank(advertiser):
        with boa.reverts("closed"):
            vault.top_up(camp_id, 1)
    with boa.env.prank(publisher):
        market.set_terms(sid, usdc(10), usdc(1), 100, 0, 0, 0, 0)
    assert market.terms_of(sid).sale_mode == 0


def test_owner_setters(vault, market, publisher):
    with boa.env.prank(publisher):
        with boa.reverts():
            vault.set_settler(publisher)
        with boa.reverts():
            market.set_campaign_vault(vault.address)
    with boa.reverts("bad settler"):
        vault.set_settler("0x" + "00" * 20)
    with boa.reverts("fee too high"):
        vault.set_fee_bps(1001)
    with boa.reverts("bad treasury"):
        vault.set_treasury("0x" + "00" * 20)
    with boa.reverts("bad delay"):
        vault.set_close_delay(0)
    with boa.reverts("bad delay"):
        vault.set_close_delay(604_801)
    with boa.reverts("bad charge"):
        vault.set_max_batch_charge(0)
    with boa.reverts("bad vault"):
        market.set_campaign_vault("0x" + "00" * 20)
    vault.set_close_delay(120)
    vault.set_max_batch_charge(1)
    assert vault.close_delay_seconds() == 120
    assert vault.max_batch_charge() == 1
    assert market.campaign_vault() == vault.address
    assert vault.MARKETPLACE() == market.address
