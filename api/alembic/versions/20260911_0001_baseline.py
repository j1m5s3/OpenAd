"""Baseline schema: the tables as the models defined them at commit 95163d9.

Frozen DDL, written out table by table. A revision must never import ``openad.models`` or
call ``Base.metadata.create_all``: that created the *current* models on an empty database,
so ``0002_cpc`` then failed with "duplicate column" (docs/CONVENTIONS.md, api section).
``tests/test_migrations.py`` checks that head matches the models.

Custom column types are written as their ``impl``: ``Uint256`` is ``String(78)``,
``Address`` is ``String(42)`` and ``Bytes32`` is ``String(66)`` (``openad/db/types.py``).
Constraint and index names follow ``openad.db.base.NAMING_CONVENTION``, so databases that
were created by the old ``create_all`` baseline keep the same names.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001_baseline"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Children before parents, so foreign keys never block a drop.
_TABLES_DROP_ORDER = (
    "terms",
    "leases",
    "house_ads",
    "domain_verifications",
    "creative_verifications",
    "slots",
    "sessions",
    "serve_events",
    "protocol_config",
    "indexer_cursor",
    "creatives",
    "auth_nonces",
    "approvals",
    "allowed_advertisers",
)


def upgrade() -> None:
    op.create_table(
        "allowed_advertisers",
        sa.Column("publisher", sa.String(length=42), nullable=False),
        sa.Column("advertiser", sa.String(length=42), nullable=False),
        sa.Column("allowed", sa.Boolean(), nullable=False),
        sa.Column("updated_block", sa.BigInteger(), nullable=False),
        sa.PrimaryKeyConstraint("publisher", "advertiser", name=op.f("pk_allowed_advertisers")),
    )
    op.create_table(
        "approvals",
        sa.Column("publisher", sa.String(length=42), nullable=False),
        sa.Column("creative_id", sa.String(length=78), nullable=False),
        sa.Column("status", sa.SmallInteger(), nullable=False),
        sa.Column("updated_block", sa.BigInteger(), nullable=False),
        sa.PrimaryKeyConstraint("publisher", "creative_id", name=op.f("pk_approvals")),
    )
    op.create_table(
        "auth_nonces",
        sa.Column("nonce", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.BigInteger(), nullable=False),
        sa.Column("used", sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint("nonce", name=op.f("pk_auth_nonces")),
    )
    op.create_table(
        "creatives",
        sa.Column("creative_id", sa.String(length=78), nullable=False),
        sa.Column("advertiser", sa.String(length=42), nullable=False),
        sa.Column("kind", sa.SmallInteger(), nullable=False),
        sa.Column("uri", sa.Text(), nullable=False),
        sa.Column("content_hash", sa.String(length=66), nullable=True),
        sa.Column("mime", sa.String(length=64), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column("click_url", sa.Text(), nullable=False),
        sa.Column("nft_chain_id", sa.BigInteger(), nullable=True),
        sa.Column("nft_contract", sa.String(length=42), nullable=True),
        sa.Column("nft_token_id", sa.String(length=78), nullable=True),
        sa.Column("nft_standard", sa.SmallInteger(), nullable=True),
        sa.Column("revoked", sa.Boolean(), nullable=False),
        sa.Column("registered_block", sa.BigInteger(), nullable=False),
        sa.Column("updated_block", sa.BigInteger(), nullable=False),
        sa.PrimaryKeyConstraint("creative_id", name=op.f("pk_creatives")),
    )
    op.create_index(op.f("ix_creatives_advertiser"), "creatives", ["advertiser"], unique=False)
    op.create_table(
        "indexer_cursor",
        sa.Column("chain_id", sa.Integer(), nullable=False),
        sa.Column("contract", sa.String(length=64), nullable=False),
        sa.Column("block_number", sa.BigInteger(), nullable=False),
        sa.Column("block_hash", sa.String(length=66), nullable=False),
        sa.PrimaryKeyConstraint("chain_id", "contract", name=op.f("pk_indexer_cursor")),
    )
    op.create_table(
        "protocol_config",
        sa.Column("chain_id", sa.Integer(), nullable=False),
        sa.Column("market", sa.String(length=42), nullable=True),
        sa.Column("fee_bps", sa.Integer(), nullable=True),
        sa.Column("treasury", sa.String(length=42), nullable=True),
        sa.Column("moderator", sa.String(length=42), nullable=True),
        sa.Column("updated_block", sa.BigInteger(), nullable=False),
        sa.PrimaryKeyConstraint("chain_id", name=op.f("pk_protocol_config")),
    )
    op.create_table(
        "serve_events",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("slot_id", sa.String(length=78), nullable=False),
        sa.Column("lease_calendar_version", sa.Integer(), nullable=True),
        sa.Column("lease_period_index", sa.String(length=78), nullable=True),
        sa.Column("served_kind", sa.String(length=8), nullable=False),
        sa.Column("origin_ok", sa.Boolean(), nullable=False),
        sa.Column("at", sa.BigInteger(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_serve_events")),
    )
    op.create_index(op.f("ix_serve_events_at"), "serve_events", ["at"], unique=False)
    op.create_index(op.f("ix_serve_events_slot_id"), "serve_events", ["slot_id"], unique=False)
    op.create_table(
        "sessions",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("address", sa.String(length=42), nullable=False),
        sa.Column("expires_at", sa.BigInteger(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_sessions")),
    )
    op.create_index(op.f("ix_sessions_address"), "sessions", ["address"], unique=False)
    op.create_table(
        "slots",
        sa.Column("slot_id", sa.String(length=78), nullable=False),
        sa.Column("owner", sa.String(length=42), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column("kind", sa.SmallInteger(), nullable=False),
        sa.Column("domain", sa.String(length=253), nullable=False),
        sa.Column("calendar_version", sa.Integer(), nullable=False),
        sa.Column("period_seconds", sa.BigInteger(), nullable=True),
        sa.Column("first_period_start", sa.BigInteger(), nullable=True),
        sa.Column("minted_block", sa.BigInteger(), nullable=False),
        sa.Column("minted_tx", sa.String(length=66), nullable=False),
        sa.Column("updated_block", sa.BigInteger(), nullable=False),
        sa.PrimaryKeyConstraint("slot_id", name=op.f("pk_slots")),
    )
    op.create_index(op.f("ix_slots_domain"), "slots", ["domain"], unique=False)
    op.create_index(op.f("ix_slots_owner"), "slots", ["owner"], unique=False)
    op.create_table(
        "creative_verifications",
        sa.Column("creative_id", sa.String(length=78), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("checked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cached_path", sa.Text(), nullable=True),
        sa.Column("resolved_image_url", sa.Text(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(
            ["creative_id"],
            ["creatives.creative_id"],
            name=op.f("fk_creative_verifications_creative_id_creatives"),
        ),
        sa.PrimaryKeyConstraint("creative_id", name=op.f("pk_creative_verifications")),
    )
    op.create_table(
        "domain_verifications",
        sa.Column("slot_id", sa.String(length=78), nullable=False),
        sa.Column("method", sa.String(length=16), nullable=False),
        sa.Column("token", sa.String(length=64), nullable=False),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_checked_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["slot_id"], ["slots.slot_id"], name=op.f("fk_domain_verifications_slot_id_slots")
        ),
        sa.PrimaryKeyConstraint("slot_id", name=op.f("pk_domain_verifications")),
    )
    op.create_table(
        "house_ads",
        sa.Column("slot_id", sa.String(length=78), nullable=False),
        sa.Column("media_url", sa.Text(), nullable=False),
        sa.Column("click_url", sa.Text(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["slot_id"], ["slots.slot_id"], name=op.f("fk_house_ads_slot_id_slots")
        ),
        sa.PrimaryKeyConstraint("slot_id", name=op.f("pk_house_ads")),
    )
    op.create_table(
        "leases",
        sa.Column("slot_id", sa.String(length=78), nullable=False),
        sa.Column("calendar_version", sa.Integer(), nullable=False),
        sa.Column("period_index", sa.String(length=78), nullable=False),
        sa.Column("user", sa.String(length=42), nullable=False),
        sa.Column("creative_id", sa.String(length=78), nullable=False),
        sa.Column("start", sa.BigInteger(), nullable=False),
        sa.Column("end", sa.BigInteger(), nullable=False),
        sa.Column("price", sa.String(length=78), nullable=True),
        sa.Column("fee", sa.String(length=78), nullable=True),
        sa.Column("approval_mode", sa.SmallInteger(), nullable=True),
        sa.Column("tx_hash", sa.String(length=66), nullable=False),
        sa.Column("block_number", sa.BigInteger(), nullable=False),
        sa.ForeignKeyConstraint(
            ["slot_id"], ["slots.slot_id"], name=op.f("fk_leases_slot_id_slots")
        ),
        sa.PrimaryKeyConstraint(
            "slot_id", "calendar_version", "period_index", name=op.f("pk_leases")
        ),
    )
    op.create_index(op.f("ix_leases_creative_id"), "leases", ["creative_id"], unique=False)
    op.create_index(op.f("ix_leases_end"), "leases", ["end"], unique=False)
    op.create_index(op.f("ix_leases_start"), "leases", ["start"], unique=False)
    op.create_index(op.f("ix_leases_user"), "leases", ["user"], unique=False)
    op.create_table(
        "terms",
        sa.Column("slot_id", sa.String(length=78), nullable=False),
        sa.Column("start_price", sa.String(length=78), nullable=False),
        sa.Column("floor_price", sa.String(length=78), nullable=False),
        sa.Column("lead_seconds", sa.BigInteger(), nullable=False),
        sa.Column("sale_end", sa.BigInteger(), nullable=False),
        sa.Column("approval_mode", sa.SmallInteger(), nullable=False),
        sa.Column("paused", sa.Boolean(), nullable=False),
        sa.Column("updated_block", sa.BigInteger(), nullable=False),
        sa.ForeignKeyConstraint(
            ["slot_id"], ["slots.slot_id"], name=op.f("fk_terms_slot_id_slots")
        ),
        sa.PrimaryKeyConstraint("slot_id", name=op.f("pk_terms")),
    )


def downgrade() -> None:
    for table in _TABLES_DROP_ORDER:
        op.drop_table(table)
