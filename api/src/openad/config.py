"""Runtime configuration. The ONLY place that reads environment variables.

Every variable is prefixed ``OPENAD_`` and documented in ``/.env.example`` and
``docs/ARCHITECTURE.md`` section 3.8.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="OPENAD_",
        env_file=(REPO_ROOT / ".env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- general
    env: Literal["dev", "staging", "prod", "test"] = "dev"
    log_level: str = "INFO"

    # --- chain / contracts
    chain_id: int = 31337
    rpc_url: str = "http://127.0.0.1:8545"
    deployments_dir: Path = Path("contracts/deployments")

    # --- database
    database_url: str = "postgresql+asyncpg://openad:openad@127.0.0.1:15432/openad"
    # Pool settings (ROADMAP 6.9; docs/deploy-gcp.md "Connection budget"). SQLite (unit tests,
    # `db/bootstrap.py` local runs) always uses `StaticPool` and ignores these — see
    # `Database.__init__` in `db/session.py`. Per-service overrides for Cloud Run live in
    # `infra/gcp/services/*.yaml` env vars, not in these defaults.
    db_pool_size: int = Field(default=5, ge=1)
    db_max_overflow: int = Field(default=5, ge=0)
    db_pool_timeout: int = Field(default=30, ge=1)
    db_pool_recycle: int = Field(default=1800, ge=1)

    # --- api
    api_host: str = "127.0.0.1"
    api_port: int = 8000
    public_url: str = "http://localhost:8000"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # --- serving edge
    serve_ttl_seconds: int = Field(default=30, ge=1)
    serve_enforce_origin: bool = False
    media_cache_dir: Path = Path("api/.cache/media")
    # "local" (default; same-disk indexer + api) or "gcs" (ADR-0017; required on Cloud Run,
    # where the indexer and api are separate containers with no shared disk).
    media_backend: Literal["local", "gcs"] = "local"
    media_gcs_bucket: str | None = None
    media_gcs_prefix: str = "media"
    max_media_bytes: int = 2 * 1024 * 1024
    ipfs_gateway: str = "https://ipfs.io/ipfs/"
    verify_interval_seconds: int = 6 * 3600
    safe_browsing_key: str | None = None

    # --- indexer
    indexer_poll_seconds: float = 2.0
    indexer_batch_blocks: int = Field(default=2000, ge=1)
    indexer_confirmations: int = Field(default=1, ge=0)
    indexer_reorg_depth: int = Field(default=32, ge=1)

    # --- auth (SIWE; ROADMAP 3.1)
    session_secret: str = "change-me-in-real-environments"  # noqa: S105 - documented placeholder
    session_ttl_seconds: int = 86400
    # Origins a SIWE message may be bound to (ADR-0009 amendment), comma-separated. Unset or
    # empty follows `cors_origins`. Only http(s) origins count; `*` allows nothing.
    siwe_allowed_origins: str | None = None
    # Best-effort, per-process limit on POST /v1/auth/nonce and /verify; 0 disables it.
    auth_rate_limit_per_minute: int = Field(default=0, ge=0)
    # Proxies in front of the api that append to X-Forwarded-For. 0 keys the limit by the TCP
    # peer; N > 0 by the N-th X-Forwarded-For entry from the right.
    trusted_proxy_hops: int = Field(default=0, ge=0)

    # --- CPC clicks (ADR-0014). Settler key is NOT here; see openad.settler.settings.
    click_hmac_secret: str = "change-me-click-hmac"  # noqa: S105 - documented placeholder
    click_ivt: bool = True
    click_max_per_campaign_hour: int = Field(default=120, ge=1)

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def siwe_origin_list(self) -> list[str]:
        """Origins SIWE messages may be bound to: `siwe_allowed_origins`, else the CORS list."""
        raw = self.siwe_allowed_origins or ""
        origins = [o.strip() for o in raw.split(",") if o.strip()]
        return origins or self.cors_origin_list

    @property
    def deployments_path(self) -> Path:
        p = self.deployments_dir
        return p if p.is_absolute() else REPO_ROOT / p

    @property
    def media_cache_path(self) -> Path:
        p = self.media_cache_dir
        return p if p.is_absolute() else REPO_ROOT / p

    @property
    def is_dev(self) -> bool:
        return self.env in ("dev", "test")

    @model_validator(mode="after")
    def _require_gcs_bucket(self) -> Settings:
        if self.media_backend == "gcs" and not self.media_gcs_bucket:
            raise ValueError("OPENAD_MEDIA_GCS_BUCKET is required when OPENAD_MEDIA_BACKEND=gcs")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
