"""Baseline schema for every table in docs/ARCHITECTURE.md §3.2.

Uses ``Base.metadata.create_all`` so the first revision cannot drift from the models.
Later PRs that touch models must add a normal Alembic revision.
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

import openad.models  # noqa: F401
from openad.db.base import Base

revision: str = "0001_baseline"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind)


def downgrade() -> None:
    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind)
