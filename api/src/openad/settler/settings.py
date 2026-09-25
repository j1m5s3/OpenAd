"""Settler-only settings. HTTP ``openad.config.Settings`` must not include the key."""

from __future__ import annotations

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from openad.config import REPO_ROOT


class SettlerSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="OPENAD_",
        env_file=(REPO_ROOT / ".env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    env: str = "dev"
    log_level: str = "INFO"
    chain_id: int = 31337
    rpc_url: str = "http://127.0.0.1:8545"
    deployments_dir: Path = Path("contracts/deployments")
    database_url: str = "postgresql+asyncpg://openad:openad@127.0.0.1:15432/openad"
    # Pool settings (ROADMAP 6.9), same shape as `openad.config.Settings` so both satisfy
    # `openad.db.session.PoolSettings`; the settler's Cloud Run env overrides these smaller
    # (see infra/gcp/services/settler.yaml / docs/deploy-gcp.md "Connection budget").
    db_pool_size: int = Field(default=5, ge=1)
    db_max_overflow: int = Field(default=5, ge=0)
    db_pool_timeout: int = Field(default=30, ge=1)
    db_pool_recycle: int = Field(default=1800, ge=1)
    settler_key: str = ""
    settler_poll_seconds: float = Field(default=15.0, ge=1.0)

    @property
    def deployments_path(self) -> Path:
        p = self.deployments_dir
        return p if p.is_absolute() else REPO_ROOT / p
