"""Indexer handlers with synthetic decoded events (no chain). ROADMAP 2.1 adds Anvil replay."""

from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from openad.indexer import handlers
from openad.indexer.events import EXPECTED_EVENTS, DecodedEvent
from openad.models import (
    Approval,
    Campaign,
    CampaignSettlement,
    Creative,
    CreativeVerification,
    Lease,
    ProtocolConfig,
    Slot,
    Terms,
)
from openad.models.creative import APPROVAL_APPROVED
from openad.models.offchain import VERIFY_PENDING
from tests.conftest import ADVERTISER, PUBLISHER, TX

BLOCK_HASH = "0x" + "dd" * 32


def ev(contract: str, name: str, block: int = 10, log_index: int = 0, **args: Any) -> DecodedEvent:
    return DecodedEvent(
        contract=contract,
        name=name,
        args=args,
        block_number=block,
        block_hash=BLOCK_HASH,
        tx_hash=TX,
        log_index=log_index,
    )


def test_every_protocol_event_has_exactly_one_handler() -> None:
    assert handlers.registered_events() == EXPECTED_EVENTS


async def test_slot_lifecycle_mint_calendar_lease_purchase(session: AsyncSession) -> None:
    session.info["chain_id"] = 31337
    events = [
        ev("AdSlot", "Transfer", **{"from": "0x" + "00" * 20, "to": PUBLISHER, "tokenId": 1}),
        ev(
            "AdSlot",
            "SlotMinted",
            log_index=1,
            slot_id=1,
            owner=PUBLISHER,
            width=300,
            height=250,
            kind=0,
            domain="Example.com",
        ),
        ev(
            "AdSlot",
            "CalendarSet",
            block=11,
            slot_id=1,
            version=1,
            period_seconds=86400,
            first_period_start=1_700_000_000,
        ),
        ev(
            "Marketplace",
            "TermsSet",
            block=12,
            slot_id=1,
            start_price=10_000_000,
            floor_price=1_000_000,
            lead_seconds=3600,
            sale_end=0,
            approval_mode=0,
        ),
        ev(
            "AdSlot",
            "LeaseSet",
            block=13,
            log_index=0,
            slot_id=1,
            period_index=5,
            user=ADVERTISER,
            version=1,
            start=1_700_432_000,
            end=1_700_518_400,
            creative_id=7,
        ),
        ev(
            "Marketplace",
            "Purchased",
            block=13,
            log_index=1,
            slot_id=1,
            period_index=5,
            buyer=ADVERTISER,
            publisher=PUBLISHER,
            creative_id=7,
            price=4_000_000,
            fee=100_000,
            approval_mode=0,
            start=1_700_432_000,
            end=1_700_518_400,
        ),
    ]
    for e in events:
        assert await handlers.dispatch(session, e)
    await session.commit()

    slot = await session.get(Slot, 1)
    assert slot is not None and slot.owner == PUBLISHER and slot.domain == "example.com"
    assert (slot.calendar_version, slot.period_seconds) == (1, 86400)
    terms = await session.get(Terms, 1)
    assert terms is not None and terms.start_price == 10_000_000 and terms.paused is False
    lease = await session.get(Lease, (1, 1, 5))
    assert lease is not None
    assert (lease.user, lease.creative_id, lease.price, lease.fee) == (
        ADVERTISER,
        7,
        4_000_000,
        100_000,
    )
    assert lease.approval_mode == 0

    # Idempotency: replaying the same events changes nothing.
    for e in events:
        await handlers.dispatch(session, e)
    await session.commit()
    assert len((await session.execute(Lease.__table__.select())).all()) == 1


async def test_slot_minted_replaces_stale_spec(session: AsyncSession) -> None:
    await handlers.dispatch(
        session,
        ev(
            "AdSlot",
            "SlotMinted",
            slot_id=3,
            owner=PUBLISHER,
            width=728,
            height=90,
            kind=1,
            domain="old.example",
        ),
    )
    await handlers.dispatch(
        session,
        ev(
            "AdSlot",
            "CalendarSet",
            slot_id=3,
            version=1,
            period_seconds=3600,
            first_period_start=1_700_000_000,
        ),
    )
    await handlers.dispatch(
        session,
        ev(
            "Marketplace",
            "TermsSet",
            slot_id=3,
            start_price=1,
            floor_price=1,
            lead_seconds=1,
            sale_end=0,
            approval_mode=0,
        ),
    )
    await handlers.dispatch(
        session,
        ev(
            "AdSlot",
            "LeaseSet",
            slot_id=3,
            period_index=0,
            user=ADVERTISER,
            version=1,
            start=1,
            end=2,
            creative_id=1,
        ),
    )
    await handlers.dispatch(
        session,
        ev(
            "AdSlot",
            "SlotMinted",
            block=50,
            slot_id=3,
            owner=PUBLISHER,
            width=300,
            height=250,
            kind=0,
            domain="Smoke.example",
        ),
    )
    await session.commit()
    slot = await session.get(Slot, 3)
    assert slot is not None
    assert slot.domain == "smoke.example"
    assert slot.width == 300 and slot.calendar_version == 0
    assert await session.get(Terms, 3) is None
    assert await session.get(Lease, (3, 1, 0)) is None


async def test_transfer_updates_publisher(session: AsyncSession) -> None:
    await handlers.dispatch(
        session,
        ev(
            "AdSlot",
            "SlotMinted",
            slot_id=2,
            owner=PUBLISHER,
            width=1,
            height=1,
            kind=3,
            domain="x.io",
        ),
    )
    new_owner = "0x" + "ee" * 20
    await handlers.dispatch(
        session,
        ev("AdSlot", "Transfer", block=20, **{"from": PUBLISHER, "to": new_owner, "tokenId": 2}),
    )
    await session.commit()
    slot = await session.get(Slot, 2)
    assert slot is not None and slot.owner == new_owner and slot.updated_block == 20


async def test_creative_registration_and_approval(session: AsyncSession) -> None:
    await handlers.dispatch(
        session,
        ev(
            "CreativeRegistry",
            "CreativeRegistered",
            creative_id=7,
            advertiser=ADVERTISER,
            kind=0,
            content_hash=bytes.fromhex("11" * 32),
            uri="https://ads.example/b.png",
            mime="image/png",
            width=300,
            height=250,
            click_url="https://advertiser.example/",
        ),
    )
    await handlers.dispatch(
        session,
        ev(
            "CreativeRegistry",
            "ApprovalRequested",
            block=11,
            publisher=PUBLISHER,
            creative_id=7,
            advertiser=ADVERTISER,
        ),
    )
    await handlers.dispatch(
        session,
        ev(
            "CreativeRegistry",
            "ApprovalSet",
            block=12,
            publisher=PUBLISHER,
            creative_id=7,
            status=APPROVAL_APPROVED,
        ),
    )
    await handlers.dispatch(
        session,
        ev("CreativeRegistry", "CreativeRevoked", block=13, creative_id=7, by="0x" + "99" * 20),
    )
    await session.commit()

    creative = await session.get(Creative, 7)
    assert creative is not None
    assert creative.content_hash == "0x" + "11" * 32 and creative.revoked is True
    verification = await session.get(CreativeVerification, 7)
    assert verification is not None and verification.status == VERIFY_PENDING
    approval = await session.get(Approval, (PUBLISHER, 7))
    assert approval is not None and approval.status == APPROVAL_APPROVED


async def test_protocol_config_events(session: AsyncSession) -> None:
    session.info["chain_id"] = 31337
    await handlers.dispatch(session, ev("AdSlot", "MarketSet", market="0x" + "01" * 20))
    await handlers.dispatch(session, ev("Marketplace", "FeeSet", fee_bps=250))
    await handlers.dispatch(session, ev("Marketplace", "TreasurySet", treasury="0x" + "02" * 20))
    await handlers.dispatch(
        session, ev("CreativeRegistry", "ModeratorSet", moderator="0x" + "03" * 20)
    )
    await session.commit()
    cfg = await session.get(ProtocolConfig, 31337)
    assert cfg is not None
    assert (cfg.market, cfg.fee_bps, cfg.treasury, cfg.moderator) == (
        "0x" + "01" * 20,
        250,
        "0x" + "02" * 20,
        "0x" + "03" * 20,
    )


async def test_campaign_lifecycle_replay(session: AsyncSession) -> None:
    session.info["chain_id"] = 31337
    await handlers.dispatch(
        session,
        ev(
            "AdSlot",
            "SlotMinted",
            slot_id=9,
            owner=PUBLISHER,
            width=300,
            height=250,
            kind=0,
            domain="cpc.example",
        ),
    )
    await handlers.dispatch(
        session,
        ev(
            "Marketplace",
            "TermsSet",
            slot_id=9,
            start_price=0,
            floor_price=0,
            lead_seconds=0,
            sale_end=0,
            approval_mode=0,
            sale_mode=1,
            floor_cpc=100_000,
        ),
    )
    events = [
        ev(
            "CampaignVault",
            "CampaignOpened",
            campaign_id=1,
            advertiser=ADVERTISER,
            slot_id=9,
            creative_id=7,
            max_cpc=1_000_000,
            budget=10_000_000,
            valid_from=0,
            valid_until=0,
        ),
        ev(
            "CampaignVault",
            "CampaignToppedUp",
            campaign_id=1,
            amount=2_000_000,
            remaining=12_000_000,
        ),
        ev("CampaignVault", "MaxCpcSet", campaign_id=1, max_cpc=2_000_000),
        ev("CampaignVault", "CampaignPausedSet", campaign_id=1, paused=True),
        ev("CampaignVault", "CampaignPausedSet", campaign_id=1, paused=False, block=11),
        ev(
            "CampaignVault",
            "Settled",
            campaign_id=1,
            slot_id=9,
            publisher=PUBLISHER,
            payable_clicks=3,
            charged=1_000_000,
            fee=25_000,
            batch_id=bytes.fromhex("aa" * 32),
        ),
        ev("CampaignVault", "CloseRequested", campaign_id=1, close_after=1_800_003_600),
        ev("CampaignVault", "CampaignFinalized", campaign_id=1, refund=11_000_000),
    ]
    for e in events:
        assert await handlers.dispatch(session, e)
    await session.commit()

    terms = await session.get(Terms, 9)
    assert terms is not None and terms.sale_mode == 1 and terms.floor_cpc == 100_000
    camp = await session.get(Campaign, 1)
    assert camp is not None
    assert camp.advertiser == ADVERTISER and camp.slot_id == 9
    assert camp.closed is True and camp.remaining == 0
    assert camp.max_cpc == 2_000_000 and camp.close_after == 1_800_003_600
    row = await session.get(CampaignSettlement, "0x" + "aa" * 32)
    assert row is not None and row.charged == 1_000_000 and row.fee == 25_000

    for e in events:
        await handlers.dispatch(session, e)
    await session.commit()
    assert len((await session.execute(CampaignSettlement.__table__.select())).all()) == 1
    camp = await session.get(Campaign, 1)
    assert camp is not None and camp.remaining == 0


async def test_vault_config_events(session: AsyncSession) -> None:
    session.info["chain_id"] = 31337
    await handlers.dispatch(session, ev("Marketplace", "CampaignVaultSet", vault="0x" + "04" * 20))
    await handlers.dispatch(session, ev("CampaignVault", "SettlerSet", settler="0x" + "05" * 20))
    await handlers.dispatch(session, ev("CampaignVault", "VaultFeeSet", fee_bps=250))
    await handlers.dispatch(
        session, ev("CampaignVault", "VaultTreasurySet", treasury="0x" + "06" * 20)
    )
    await handlers.dispatch(session, ev("CampaignVault", "CloseDelaySet", seconds=3600))
    await handlers.dispatch(
        session, ev("CampaignVault", "MaxBatchChargeSet", max_batch_charge=10_000_000_000)
    )
    await session.commit()
    cfg = await session.get(ProtocolConfig, 31337)
    assert cfg is not None
    assert cfg.campaign_vault == "0x" + "04" * 20
    assert cfg.settler == "0x" + "05" * 20
    assert cfg.vault_fee_bps == 250
    assert cfg.vault_treasury == "0x" + "06" * 20
    assert cfg.close_delay_seconds == 3600
    assert cfg.max_batch_charge == 10_000_000_000


async def test_unknown_event_is_reported(session: AsyncSession) -> None:
    assert not await handlers.dispatch(session, ev("AdSlot", "NotAnEvent"))
