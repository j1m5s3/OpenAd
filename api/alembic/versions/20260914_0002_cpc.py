"""CPC tables and Terms/serve_events/protocol_config columns (ROADMAP 5.4, PROTOCOL.md §11)."""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002_cpc"
down_revision: str | None = "0001_baseline"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_ZERO_UINT = "0" * 78


def upgrade() -> None:
    op.add_column(
        "terms",
        sa.Column("sale_mode", sa.SmallInteger(), nullable=False, server_default="0"),
    )
    op.add_column(
        "terms",
        sa.Column("floor_cpc", sa.String(78), nullable=False, server_default=_ZERO_UINT),
    )
    op.add_column("serve_events", sa.Column("campaign_id", sa.String(78), nullable=True))
    op.add_column("serve_events", sa.Column("gsp_cpc", sa.String(78), nullable=True))
    op.create_index("ix_serve_events_campaign_id", "serve_events", ["campaign_id"])

    op.add_column("protocol_config", sa.Column("campaign_vault", sa.String(42), nullable=True))
    op.add_column("protocol_config", sa.Column("settler", sa.String(42), nullable=True))
    op.add_column("protocol_config", sa.Column("vault_fee_bps", sa.Integer(), nullable=True))
    op.add_column("protocol_config", sa.Column("vault_treasury", sa.String(42), nullable=True))
    op.add_column("protocol_config", sa.Column("close_delay_seconds", sa.Integer(), nullable=True))
    op.add_column("protocol_config", sa.Column("max_batch_charge", sa.String(78), nullable=True))

    op.create_table(
        "campaigns",
        sa.Column("campaign_id", sa.String(78), primary_key=True),
        sa.Column("advertiser", sa.String(42), nullable=False),
        sa.Column("slot_id", sa.String(78), sa.ForeignKey("slots.slot_id"), nullable=False),
        sa.Column("creative_id", sa.String(78), nullable=False),
        sa.Column("max_cpc", sa.String(78), nullable=False),
        sa.Column("remaining", sa.String(78), nullable=False),
        sa.Column("budget", sa.String(78), nullable=False),
        sa.Column("valid_from", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("valid_until", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("paused", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("close_after", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("closed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("opened_tx", sa.String(66), nullable=False),
        sa.Column("opened_block", sa.BigInteger(), nullable=False),
        sa.Column("updated_block", sa.BigInteger(), nullable=False),
    )
    op.create_index("ix_campaigns_advertiser", "campaigns", ["advertiser"])
    op.create_index("ix_campaigns_slot_id", "campaigns", ["slot_id"])
    op.create_index("ix_campaigns_creative_id", "campaigns", ["creative_id"])
    op.create_index("ix_campaigns_closed", "campaigns", ["closed"])

    op.create_table(
        "campaign_settlements",
        sa.Column("batch_id", sa.String(66), primary_key=True),
        sa.Column(
            "campaign_id",
            sa.String(78),
            sa.ForeignKey("campaigns.campaign_id"),
            nullable=False,
        ),
        sa.Column("slot_id", sa.String(78), nullable=False),
        sa.Column("publisher", sa.String(42), nullable=False),
        sa.Column("payable_clicks", sa.Integer(), nullable=False),
        sa.Column("charged", sa.String(78), nullable=False),
        sa.Column("fee", sa.String(78), nullable=False),
        sa.Column("tx_hash", sa.String(66), nullable=False),
        sa.Column("block_number", sa.BigInteger(), nullable=False),
    )
    op.create_index(
        "ix_campaign_settlements_campaign_id", "campaign_settlements", ["campaign_id"]
    )

    op.create_table(
        "click_events",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("slot_id", sa.String(78), nullable=False),
        sa.Column("campaign_id", sa.String(78), nullable=False),
        sa.Column("creative_id", sa.String(78), nullable=False),
        sa.Column("serve_event_id", sa.Integer(), nullable=True),
        sa.Column("payable", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("ivt_reason", sa.String(32), nullable=True),
        sa.Column("gsp_cpc", sa.String(78), nullable=False, server_default=_ZERO_UINT),
        sa.Column("settled_batch_id", sa.String(66), nullable=True),
        sa.Column("at", sa.BigInteger(), nullable=False),
    )
    op.create_index("ix_click_events_token_hash", "click_events", ["token_hash"], unique=True)
    op.create_index("ix_click_events_slot_id", "click_events", ["slot_id"])
    op.create_index("ix_click_events_campaign_id", "click_events", ["campaign_id"])
    op.create_index("ix_click_events_settled_batch_id", "click_events", ["settled_batch_id"])
    op.create_index("ix_click_events_at", "click_events", ["at"])


def downgrade() -> None:
    op.drop_table("click_events")
    op.drop_table("campaign_settlements")
    op.drop_table("campaigns")
    op.drop_column("protocol_config", "max_batch_charge")
    op.drop_column("protocol_config", "close_delay_seconds")
    op.drop_column("protocol_config", "vault_treasury")
    op.drop_column("protocol_config", "vault_fee_bps")
    op.drop_column("protocol_config", "settler")
    op.drop_column("protocol_config", "campaign_vault")
    op.drop_index("ix_serve_events_campaign_id", table_name="serve_events")
    op.drop_column("serve_events", "gsp_cpc")
    op.drop_column("serve_events", "campaign_id")
    op.drop_column("terms", "floor_cpc")
    op.drop_column("terms", "sale_mode")
