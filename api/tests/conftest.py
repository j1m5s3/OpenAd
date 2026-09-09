"""Shared fixtures: in-memory SQLite database, app, HTTP client, and row factories."""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from openad.config import Settings
from openad.db.session import Database
from openad.main import create_app
from openad.models import Creative, CreativeVerification, HouseAd, Lease, Slot
from openad.models.creative import KIND_MEDIA
from openad.models.offchain import VERIFY_VERIFIED

PUBLISHER = "0x" + "aa" * 20
ADVERTISER = "0x" + "bb" * 20
TX = "0x" + "cc" * 32


@pytest.fixture
def settings() -> Settings:
    return Settings(
        env="test",
        database_url="sqlite+aiosqlite:///:memory:",
        public_url="http://api.test",
        serve_ttl_seconds=30,
        serve_enforce_origin=False,
        _env_file=None,  # type: ignore[call-arg]  # pydantic-settings init-only kwarg
    )


@pytest.fixture
async def db(settings: Settings) -> AsyncIterator[Database]:
    database = Database(settings.database_url)
    await database.create_all()
    try:
        yield database
    finally:
        await database.dispose()


@pytest.fixture
async def session(db: Database) -> AsyncIterator[AsyncSession]:
    async with db.sessions() as s:
        yield s


@pytest.fixture
async def client(settings: Settings, db: Database) -> AsyncIterator[AsyncClient]:
    app = create_app(settings=settings, database=db)
    async with app.router.lifespan_context(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://api.test") as c:
            yield c


# ----------------------------------------------------------------------------- row factories


def make_slot(
    slot_id: int = 1,
    *,
    owner: str = PUBLISHER,
    period_seconds: int | None = 86_400,
    first_period_start: int | None = 1_700_000_000,
    calendar_version: int = 1,
    domain: str = "example.com",
) -> Slot:
    return Slot(
        slot_id=slot_id,
        owner=owner,
        width=300,
        height=250,
        kind=0,
        domain=domain,
        calendar_version=calendar_version if period_seconds else 0,
        period_seconds=period_seconds,
        first_period_start=first_period_start,
        minted_block=1,
        minted_tx=TX,
        updated_block=1,
    )


def make_creative(creative_id: int = 7, *, advertiser: str = ADVERTISER) -> Creative:
    return Creative(
        creative_id=creative_id,
        advertiser=advertiser,
        kind=KIND_MEDIA,
        uri="https://ads.example/banner.png",
        content_hash="0x" + "11" * 32,
        mime="image/png",
        width=300,
        height=250,
        click_url="https://advertiser.example/",
        registered_block=1,
        updated_block=1,
    )


def make_verified(creative_id: int = 7) -> CreativeVerification:
    return CreativeVerification(creative_id=creative_id, status=VERIFY_VERIFIED)


def make_lease(
    slot: Slot,
    period_index: int,
    *,
    creative_id: int = 7,
    approval_mode: int = 0,
    user: str = ADVERTISER,
) -> Lease:
    start, end = slot.period_window(period_index)
    return Lease(
        slot_id=slot.slot_id,
        calendar_version=slot.calendar_version,
        period_index=period_index,
        user=user,
        creative_id=creative_id,
        start=start,
        end=end,
        price=5_000_000,
        fee=125_000,
        approval_mode=approval_mode,
        tx_hash=TX,
        block_number=2,
    )


def make_house(slot_id: int = 1) -> HouseAd:
    from datetime import UTC, datetime

    return HouseAd(
        slot_id=slot_id,
        media_url="https://example.com/house.png",
        click_url="https://example.com/",
        updated_at=datetime.now(UTC),
    )
