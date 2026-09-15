"""CreativeRegistry unit tests (ROADMAP 1.1). PROTOCOL.md §5.3, §8 (7, 8)."""

from __future__ import annotations

import boa
import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from src.mocks import MockERC721

MEDIA_HASH = b"\x11" * 32


def register_media(registry, *, prank, width=300, height=250):
    with boa.env.prank(prank):
        return registry.register_media(
            "https://cdn.example/ad.png",
            MEDIA_HASH,
            "image/png",
            width,
            height,
            "https://advertiser.example",
        )


def test_register_media_issues_id_from_one(registry, advertiser):
    cid = register_media(registry, prank=advertiser)
    assert cid == 1
    assert registry.next_id() == 2
    c = registry.get_creative(1)
    assert c.advertiser == advertiser
    assert c.kind == 0
    assert c.width == 300
    assert c.height == 250
    assert c.revoked is False


@pytest.mark.parametrize(
    "kwargs,reason",
    [
        ({"uri": "", "hash_": MEDIA_HASH, "mime": "image/png", "w": 1, "h": 1}, "bad uri"),
        ({"uri": "https://x", "hash_": b"\x00" * 32, "mime": "image/png", "w": 1, "h": 1}, "bad hash"),
        ({"uri": "https://x", "hash_": MEDIA_HASH, "mime": "", "w": 1, "h": 1}, "bad mime"),
        ({"uri": "https://x", "hash_": MEDIA_HASH, "mime": "image/png", "w": 0, "h": 1}, "bad dimensions"),
    ],
)
def test_register_media_reverts(registry, advertiser, kwargs, reason):
    with boa.env.prank(advertiser):
        with boa.reverts(reason):
            registry.register_media(kwargs["uri"], kwargs["hash_"], kwargs["mime"], kwargs["w"], kwargs["h"], "")


def test_register_nft_same_chain_owner(registry, advertiser):
    nft = MockERC721.deploy()
    nft.safe_mint(advertiser, "")
    with boa.env.prank(advertiser):
        cid = registry.register_nft(boa.env.evm.patch.chain_id, nft.address, 0, 1, "")
    assert cid == 1
    c = registry.get_creative(1)
    assert c.kind == 1
    assert c.nft_standard == 1
    assert c.nft_contract == nft.address


def test_register_nft_not_owner(registry, advertiser, publisher):
    nft = MockERC721.deploy()
    nft.safe_mint(publisher, "")
    with boa.env.prank(advertiser):
        with boa.reverts("not nft owner"):
            registry.register_nft(boa.env.evm.patch.chain_id, nft.address, 0, 1, "")


def test_register_nft_bad_standard_and_contract(registry, advertiser):
    with boa.env.prank(advertiser):
        with boa.reverts("bad standard"):
            registry.register_nft(1, boa.env.generate_address("nft"), 1, 0, "")
        with boa.reverts("bad contract"):
            registry.register_nft(1, "0x" + "00" * 20, 1, 1, "")


def test_approval_paths(registry, advertiser, publisher):
    cid = register_media(registry, prank=advertiser)
    with boa.env.prank(advertiser):
        registry.request_approval(publisher, cid)
    assert registry.approval_status(publisher, cid) == 1  # REQUESTED
    with boa.env.prank(publisher):
        registry.set_approval(cid, True)
    assert registry.is_approved_for(publisher, cid)
    with boa.env.prank(publisher):
        registry.set_approval(cid, False)
    assert registry.approval_status(publisher, cid) == 3  # REJECTED
    assert registry.is_blocked_for(publisher, cid)
    with boa.env.prank(advertiser):
        registry.request_approval(publisher, cid)
    with boa.env.prank(publisher):
        registry.set_approval(cid, True)
        registry.revoke_approval(cid)
    assert registry.approval_status(publisher, cid) == 4  # REVOKED
    assert not registry.is_approved_for(publisher, cid)


def test_allowlist_approves_without_per_creative(registry, advertiser, publisher):
    cid = register_media(registry, prank=advertiser)
    with boa.env.prank(publisher):
        registry.set_advertiser_allowed(advertiser, True)
    assert registry.is_advertiser_allowed(publisher, advertiser)
    assert registry.is_approved_for(publisher, cid)


def test_request_approval_bad_status(registry, advertiser, publisher):
    cid = register_media(registry, prank=advertiser)
    with boa.env.prank(advertiser):
        registry.request_approval(publisher, cid)
        with boa.reverts("bad status"):
            registry.request_approval(publisher, cid)
    with boa.env.prank(publisher):
        with boa.reverts("not creative owner"):
            registry.request_approval(publisher, cid)


def test_moderator_revoke(registry, advertiser, publisher):
    cid = register_media(registry, prank=advertiser)
    with boa.env.prank(publisher):
        with boa.reverts("not moderator"):
            registry.moderator_revoke(cid)
    registry.set_moderator(publisher)
    with boa.env.prank(publisher):
        registry.moderator_revoke(cid)
    assert not registry.is_active(cid)
    c = registry.get_creative(cid)
    assert c.revoked is True
    # other fields unchanged (invariant 7)
    assert c.advertiser == advertiser
    assert c.content_hash == MEDIA_HASH


def test_get_creative_missing(registry):
    with boa.reverts("no creative"):
        registry.get_creative(0)
    with boa.reverts("no creative"):
        registry.get_creative(1)


@given(width=st.integers(min_value=1, max_value=10_000), height=st.integers(min_value=1, max_value=10_000))
@settings(max_examples=25, deadline=None)
def test_invariant_7_fields_immutable_except_revoked(width, height):
    registry = boa.load("src/CreativeRegistry.vy")
    advertiser = boa.env.generate_address("adv")
    cid = register_media(registry, prank=advertiser, width=width, height=height)
    before = registry.get_creative(cid)
    registry.moderator_revoke(cid)
    after = registry.get_creative(cid)
    assert after.advertiser == before.advertiser
    assert after.kind == before.kind
    assert after.uri == before.uri
    assert after.content_hash == before.content_hash
    assert after.mime == before.mime
    assert after.width == before.width
    assert after.height == before.height
    assert after.click_url == before.click_url
    assert after.revoked is True


@given(approved=st.booleans())
@settings(max_examples=20, deadline=None)
def test_invariant_8_approval_scoped_to_msg_sender(approved):
    registry = boa.load("src/CreativeRegistry.vy")
    advertiser = boa.env.generate_address("adv")
    pub_a = boa.env.generate_address("a")
    pub_b = boa.env.generate_address("b")
    cid = register_media(registry, prank=advertiser)
    with boa.env.prank(pub_a):
        registry.set_approval(cid, approved)
        registry.set_advertiser_allowed(advertiser, True)
    assert registry.approval_status(pub_b, cid) == 0
    assert not registry.is_advertiser_allowed(pub_b, advertiser)
    with boa.env.prank(pub_a):
        registry.revoke_approval(cid)
    assert registry.approval_status(pub_b, cid) == 0
