"""Indexes for pruning the SIWE auth tables (JIT step 37, ADR-0009 amendment).

``POST /v1/auth/nonce`` prunes the auth tables at most once a minute per process
(``prune_auth`` in ``services/auth.py``). ``ix_auth_nonces_created_at`` serves its DELETE of
expired nonces (``created_at < cutoff``) and ``ix_sessions_expires_at`` its DELETE of expired
sessions (``expires_at < now``). Used nonces go in a separate DELETE on ``used``, which has no
index: it runs after the expiry DELETE, so it only looks at nonces issued within the TTL. The
same indexes are declared with ``index=True`` on the ``AuthNonce`` and ``Session`` models, so
the parity test in ``api/tests/test_migrations.py`` checks them.

Explicit DDL with ``IF [NOT] EXISTS`` (supported by both Postgres and SQLite), like 0003, so the
revision is idempotent for a database that already has the indexes.
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0005_auth_prune_indexes"
down_revision: str | None = "0004_slot_listings"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE INDEX IF NOT EXISTS ix_auth_nonces_created_at ON auth_nonces (created_at)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_sessions_expires_at ON sessions (expires_at)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_sessions_expires_at")
    op.execute("DROP INDEX IF EXISTS ix_auth_nonces_created_at")
