"""Composite (slot_id, at) indexes for analytics range scans (ROADMAP 6.4).

``serve_events.at`` and ``.slot_id`` are already indexed individually, but the analytics
service always filters by both together (a slot or campaign scope plus a day window), so a
composite index lets Postgres do a single index range scan instead of intersecting two.

These indexes are also declared in ``__table_args__`` on the ``ServeEvent``/``ClickEvent``
models (same names), so a database bootstrapped by the ``0001_baseline`` revision's
``Base.metadata.create_all`` already has them by the time this revision runs. ``IF [NOT]
EXISTS`` (supported by both Postgres and SQLite) keeps this revision idempotent for that case
and for a database built up one revision at a time.
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0003_analytics_indexes"
down_revision: str | None = "0002_cpc"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_serve_events_slot_id_at ON serve_events (slot_id, at)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_click_events_slot_id_at ON click_events (slot_id, at)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_click_events_slot_id_at")
    op.execute("DROP INDEX IF EXISTS ix_serve_events_slot_id_at")
