"""slot_listings table (ROADMAP 6.3, step 16): publisher-provided audience description +
categories per slot. Off-chain only, not rebuildable from chain — see docs/ARCHITECTURE.md §3.2.

Explicit DDL, no model imports (docs/CONVENTIONS.md api section): a model change without a
matching revision here is caught by ``api/tests/test_migrations.py``'s parity test.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004_slot_listings"
down_revision: str | None = "0003_analytics_indexes"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "slot_listings",
        sa.Column("slot_id", sa.String(length=78), nullable=False),
        sa.Column("summary", sa.String(length=140), nullable=False),
        sa.Column("audience", sa.Text(), nullable=False),
        sa.Column("categories", sa.String(length=200), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["slot_id"], ["slots.slot_id"], name=op.f("fk_slot_listings_slot_id_slots")
        ),
        sa.PrimaryKeyConstraint("slot_id", name=op.f("pk_slot_listings")),
    )


def downgrade() -> None:
    op.drop_table("slot_listings")
