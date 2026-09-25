"""Media cache storage backends (ADR-0017, ARCHITECTURE §3.5).

The indexer writes verified creative bytes; the api reads them back at serve time. On Cloud
Run the indexer and api are separate containers with ephemeral, non-shared disks, so the
default local-disk cache only works when both processes share a filesystem (dev / a single
box). `GcsMediaStore` lets both processes read/write the same bucket instead.

Serve never fetches advertiser URLs; this module only ever reads/writes bytes *we* already
verified and stored ourselves.
"""

from __future__ import annotations

import asyncio
from functools import lru_cache
from pathlib import Path
from typing import TYPE_CHECKING, Any, Protocol

from openad.logging import get_logger

if TYPE_CHECKING:
    from openad.config import Settings

log = get_logger(__name__)

try:  # pragma: no cover - branch taken only with the optional `gcs` extra installed
    from google.cloud.exceptions import NotFound as _GcsNotFound
except ImportError:  # default install: no google-cloud-storage

    class _GcsNotFound(Exception):  # type: ignore[no-redef]  # noqa: N818 - mirrors the real class name
        """Stand-in for `google.cloud.exceptions.NotFound` when the `gcs` extra isn't
        installed, so this module always imports. A real GCS 404 without the extra
        installed would raise `ModuleNotFoundError` from `default_gcs_client_factory`
        long before this branch matters."""


class MediaStore(Protocol):
    """A place to put and get verified media bytes, keyed by an opaque ``key``."""

    async def put(self, key: str, data: bytes) -> str:
        """Store ``data`` under ``key`` and return the ref to persist in ``cached_path``."""
        ...

    async def get(self, ref: str) -> bytes | None:
        """Return the bytes for a ref this store (or a compatible legacy ref) produced."""
        ...


class LocalMediaStore:
    """Local disk cache. The ref is the absolute path string (legacy `cached_path` behaviour)."""

    def __init__(self, root: Path) -> None:
        self._root = root.resolve()

    async def put(self, key: str, data: bytes) -> str:
        path = self._root / key
        await asyncio.to_thread(_write_file, path, data)
        return str(path)

    async def get(self, ref: str) -> bytes | None:
        return await asyncio.to_thread(_read_file_under_root, ref, self._root)


def _write_file(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def _read_file_under_root(ref: str, root: Path) -> bytes | None:
    """Read `ref`, but only when it resolves inside `root`. A `cached_path` value that
    somehow pointed outside the media cache (a bad row, not something we ever write) is
    treated as missing rather than read, and logged."""
    resolved = Path(ref).resolve()
    if not resolved.is_relative_to(root):
        log.warning("media_store.local_ref_outside_root", ref=ref, root=str(root))
        return None
    if not resolved.is_file():
        return None
    return resolved.read_bytes()


class GcsMediaStore:
    """Google Cloud Storage cache. The ref is `gs://<bucket>/<prefix>/<key>`.

    `google-cloud-storage` is only imported when a GCS client is actually built (inside
    `client_factory`), so the default install (no `gcs` extra) never needs it.
    """

    def __init__(self, bucket: str, prefix: str, client_factory: ClientFactory) -> None:
        self._bucket_name = bucket
        self._prefix = prefix.strip("/")
        self._client_factory = client_factory

    def _blob_name(self, key: str) -> str:
        return f"{self._prefix}/{key}" if self._prefix else key

    def _ref(self, key: str) -> str:
        return f"gs://{self._bucket_name}/{self._blob_name(key)}"

    async def put(self, key: str, data: bytes) -> str:
        await asyncio.to_thread(self._put_sync, key, data)
        return self._ref(key)

    def _put_sync(self, key: str, data: bytes) -> None:
        # No generation precondition: a replay (indexer re-verifying after a reorg or a
        # scheduled re-check) overwrites the existing object instead of failing on it.
        client: Any = self._client_factory()
        bucket = client.bucket(self._bucket_name)
        blob = bucket.blob(self._blob_name(key))
        blob.upload_from_string(data)

    def _blob_under_prefix(self, blob_name: str) -> bool:
        if not self._prefix:
            return True
        return blob_name == self._prefix or blob_name.startswith(self._prefix + "/")

    async def get(self, ref: str) -> bytes | None:
        bucket_name, blob_name = _parse_gs_ref(ref)
        if bucket_name != self._bucket_name or not self._blob_under_prefix(blob_name):
            log.warning(
                "media_store.gcs_ref_rejected",
                ref=ref,
                expected_bucket=self._bucket_name,
                expected_prefix=self._prefix,
            )
            return None
        return await asyncio.to_thread(self._get_sync, bucket_name, blob_name)

    def _get_sync(self, bucket_name: str, blob_name: str) -> bytes | None:
        client: Any = self._client_factory()
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(blob_name)
        try:
            result: bytes = blob.download_as_bytes()
            return result
        except _GcsNotFound:
            return None


class ClientFactory(Protocol):
    def __call__(self) -> object: ...


@lru_cache(maxsize=1)
def default_gcs_client_factory() -> object:
    """Build (once) a real `google.cloud.storage.Client`, then reuse it. Imported lazily so
    the default install (no `gcs` extra) never needs `google-cloud-storage` installed. Cached
    because a worker process calls this on every `put`/`get`, and constructing a GCS client
    does its own credential discovery — not something to redo per call in a long-lived
    container. `media_store_for(settings)` builds a fresh `GcsMediaStore` per call, but they
    all share this one underlying client."""
    from google.cloud import storage

    return storage.Client()


def _parse_gs_ref(ref: str) -> tuple[str, str]:
    rest = ref.removeprefix("gs://")
    bucket, _, blob_name = rest.partition("/")
    return bucket, blob_name


def media_store_for(settings: Settings) -> MediaStore:
    """Pick the media store for ``settings.media_backend``."""
    if settings.media_backend == "gcs":
        assert settings.media_gcs_bucket is not None  # enforced by the Settings validator
        return GcsMediaStore(
            bucket=settings.media_gcs_bucket,
            prefix=settings.media_gcs_prefix,
            client_factory=default_gcs_client_factory,
        )
    return LocalMediaStore(settings.media_cache_path)


async def dispatch_get(ref: str, *, settings: Settings) -> bytes | None:
    """Read a ref by its own scheme, regardless of the currently configured backend.

    A database written under one backend keeps working after `OPENAD_MEDIA_BACKEND` changes,
    as long as the old backend's refs are still reachable. A `gs://` ref read with a `local`
    backend configured (no bucket credentials available) returns None and logs a warning
    instead of raising.
    """
    if ref.startswith("gs://"):
        if settings.media_backend != "gcs" or not settings.media_gcs_bucket:
            log.warning("media_store.gs_ref_unreachable", ref=ref)
            return None
        return await media_store_for(settings).get(ref)
    return await LocalMediaStore(settings.media_cache_path).get(ref)
