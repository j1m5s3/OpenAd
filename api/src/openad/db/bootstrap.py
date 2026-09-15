"""Dev-only: create all tables directly from the models.

    uv run python -m openad.db.bootstrap

Prefer ``uv run alembic upgrade head`` (ROADMAP 2.2). This helper remains for unit tests
and one-off SQLite. Refuses to run when OPENAD_ENV=prod.
"""

from __future__ import annotations

import asyncio

import openad.models  # noqa: F401  - registers tables on Base.metadata
from openad.config import get_settings
from openad.db.session import Database
from openad.logging import configure_logging, get_logger


async def main() -> None:
    settings = get_settings()
    configure_logging(settings.log_level)
    log = get_logger(__name__)
    if settings.env == "prod":
        raise SystemExit("refusing to create_all in prod; use alembic")
    db = Database(settings.database_url)
    try:
        await db.create_all()
        log.info("db.bootstrap.done", url=settings.database_url.split("@")[-1])
    finally:
        await db.dispose()


if __name__ == "__main__":
    asyncio.run(main())
