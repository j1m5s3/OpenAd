"""FastAPI application factory.

Run:  uv run uvicorn openad.main:app --reload
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from openad import __version__
from openad.config import Settings, get_settings
from openad.db.session import Database
from openad.errors import DomainError, InvalidRequestError
from openad.logging import configure_logging, get_logger
from openad.ratelimit import TokenBucketLimiter
from openad.routers import (
    advertisers,
    analytics,
    auth,
    clicks,
    creatives,
    health,
    publishers,
    serve,
    slots,
)

log = get_logger(__name__)

SERVE_PATH_PREFIX = "/v1/serve"
AUTH_PATH_PREFIX = "/v1/auth"


def _is_serve_path(path: str) -> bool:
    """True when ``path`` is exactly ``/v1/serve`` or a sub-path of it — never merely a string
    with that prefix (``/v1/serve-x`` is a different, same-prefixed route).

    This matches Starlette's own routing exactly, so it is deliberately *not* more clever than
    the router: ``scope["path"]`` arrives percent-decoded (an ASGI server decodes it before the
    app ever sees it) but with any ``..``/``.`` segments left unresolved, because Starlette's
    router does not resolve them either — a path containing them never matches a route and
    simply 404s. Normalizing dot segments here, ahead of a router that does not, would only let
    this check disagree with what actually gets served.
    """
    return path == SERVE_PATH_PREFIX or path.startswith(SERVE_PATH_PREFIX + "/")


def _is_auth_path(path: str) -> bool:
    """True for ``/v1/auth`` and its sub-paths, matched like :func:`_is_serve_path`."""
    return path == AUTH_PATH_PREFIX or path.startswith(AUTH_PATH_PREFIX + "/")


class ServeCorsMiddleware:
    """Public, credential-free CORS for the serve edge (docs/ARCHITECTURE.md section 3.4).

    ``<open-ad>`` runs on a publisher's own domain, so ``GET /v1/serve/{id}`` and
    ``/v1/serve/{id}/media`` must be readable from any origin. This is a small, path-scoped
    ASGI middleware placed *outside* the credentialed :class:`CORSMiddleware`, so it can
    short-circuit serve requests before that middleware's origin allowlist ever applies.
    Every other route is untouched and keeps the credentialed allowlist.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not _is_serve_path(scope["path"]):
            await self.app(scope, receive, send)
            return

        request_headers = dict(scope.get("headers") or [])
        if scope["method"] == "OPTIONS" and b"access-control-request-method" in request_headers:
            preflight_headers: list[tuple[bytes, bytes]] = [
                (b"access-control-allow-origin", b"*"),
                (b"access-control-allow-methods", b"GET, OPTIONS"),
                (b"access-control-allow-headers", b"*"),
                (b"access-control-max-age", b"86400"),
                (b"vary", b"origin"),
                (b"content-length", b"0"),
            ]
            await send({"type": "http.response.start", "status": 200, "headers": preflight_headers})
            await send({"type": "http.response.body", "body": b""})
            return

        # The route handler still needs the real Origin/Referer headers for
        # `serve_enforce_origin` (paid vs house is unrelated to CORS), so the request is
        # forwarded unchanged. The inner CORSMiddleware sees it too and, since it unconditionally
        # sets `Access-Control-Allow-Credentials: true` on any response whose request carried an
        # Origin header — even one outside its allowlist — its CORS headers on the response are
        # discarded below and replaced with our own credential-free ones.
        stripped_cors_headers = {
            b"access-control-allow-origin",
            b"access-control-allow-credentials",
            b"access-control-expose-headers",
        }

        async def send_with_cors(message: Message) -> None:
            if message["type"] == "http.response.start":
                response_headers: list[tuple[bytes, bytes]] = [
                    (name, value)
                    for name, value in (message.get("headers") or [])
                    if name.lower() not in stripped_cors_headers
                ]
                response_headers.append((b"access-control-allow-origin", b"*"))
                has_vary = any(k.lower() == b"vary" for k, _ in response_headers)
                if not has_vary:
                    response_headers.append((b"vary", b"origin"))
                message = {**message, "headers": response_headers}
            await send(message)

        await self.app(scope, receive, send_with_cors)


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
    # One limiter per process, so the auth rate limit is per instance (ADR-0009 amendment).
    app.state.auth_rate_limiter = (
        TokenBucketLimiter(settings.auth_rate_limit_per_minute)
        if settings.auth_rate_limit_per_minute > 0
        else None
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["*"],
        allow_headers=["*"],
        allow_credentials=True,
    )
    # Added after CORSMiddleware so it wraps outside it (Starlette's add_middleware makes the
    # most-recently-added middleware outermost) and can short-circuit /v1/serve before the
    # credentialed allowlist above ever applies.
    app.add_middleware(ServeCorsMiddleware)

    @app.exception_handler(DomainError)
    async def domain_error_handler(_: Request, exc: DomainError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": exc.code, "message": exc.message},
            headers=exc.headers,
        )

    @app.exception_handler(RequestValidationError)
    async def request_validation_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        # The auth routes answer a body that fails validation (a SIWE message over
        # MAX_MESSAGE_LENGTH, a missing field, broken JSON) in the house style, like their other
        # errors. Every other route keeps FastAPI's default 422 body.
        if _is_auth_path(request.scope["path"]):
            return await domain_error_handler(request, InvalidRequestError("invalid request body"))
        return await request_validation_exception_handler(request, exc)

    app.include_router(health.router, prefix="/v1")
    app.include_router(serve.router, prefix="/v1")
    app.include_router(clicks.router, prefix="/v1")
    app.include_router(slots.router, prefix="/v1")
    app.include_router(creatives.router, prefix="/v1")
    app.include_router(publishers.router, prefix="/v1")
    app.include_router(advertisers.router, prefix="/v1")
    app.include_router(analytics.router, prefix="/v1")
    app.include_router(auth.router, prefix="/v1")
    return app


app = create_app()
