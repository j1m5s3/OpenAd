"""FastAPI application factory.

Run:  uv run uvicorn openad.main:app --reload
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from openad import __version__
from openad.config import Settings, get_settings
from openad.db.session import Database
from openad.errors import DomainError
from openad.logging import configure_logging, get_logger
from openad.routers import health, serve, slots

log = get_logger(__name__)


def create_app(settings: Settings | None = None, database: Database | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level, json_output=not settings.is_dev)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        db = database or Database(settings.database_url)
        app.state.db = db
        log.info("api.start", env=settings.env, chain_id=settings.chain_id)
        try:
            yield
        finally:
            if database is None:  # only dispose what we created
                await db.dispose()
            log.info("api.stop")

    app = FastAPI(
        title="OpenAd API",
        version=__version__,
        lifespan=lifespan,
        docs_url="/v1/docs",
        openapi_url="/v1/openapi.json",
    )
    app.state.settings = settings

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["*"],
        allow_headers=["*"],
        allow_credentials=True,
    )

    @app.exception_handler(DomainError)
    async def domain_error_handler(_: Request, exc: DomainError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code, content={"error": exc.code, "message": exc.message}
        )

    app.include_router(health.router, prefix="/v1")
    app.include_router(serve.router, prefix="/v1")
    app.include_router(slots.router, prefix="/v1")
    return app


app = create_app()
