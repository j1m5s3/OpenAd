"""Media cache storage backends (ADR-0017, ARCHITECTURE §3.5)."""

from __future__ import annotations

from pathlib import Path

import pytest

from openad.config import Settings
from openad.services import media as media_service
from openad.services.media_store import (
    GcsMediaStore,
    LocalMediaStore,
    _GcsNotFound,
    dispatch_get,
    media_store_for,
)


async def test_local_store_round_trip(tmp_path: Path) -> None:
    store = LocalMediaStore(tmp_path)
    ref = await store.put("1.bin", b"hello")
    assert ref == str(tmp_path / "1.bin")
    assert await store.get(ref) == b"hello"


async def test_local_store_missing_ref(tmp_path: Path) -> None:
    store = LocalMediaStore(tmp_path)
    assert await store.get(str(tmp_path / "missing.bin")) is None


async def test_legacy_absolute_path_ref_still_reads(tmp_path: Path) -> None:
    """A cached_path written before this ADR (a bare local path) keeps reading."""
    legacy_path = tmp_path / "42.bin"
    legacy_path.write_bytes(b"legacy bytes")
    settings = Settings(
        env="test",
        media_cache_dir=tmp_path,
        _env_file=None,  # type: ignore[call-arg]
    )
    assert await media_service.read_cached(str(legacy_path), settings=settings) == b"legacy bytes"


class _FakeBlob:
    def __init__(self, store: dict[str, bytes], name: str) -> None:
        self._store = store
        self._name = name

    def upload_from_string(self, data: bytes) -> None:
        self._store[self._name] = data

    def download_as_bytes(self) -> bytes:
        if self._name not in self._store:
            raise _GcsNotFound(f"no such object: {self._name}")
        return self._store[self._name]


class _FakeBucket:
    def __init__(self, store: dict[str, bytes]) -> None:
        self._store = store

    def blob(self, name: str) -> _FakeBlob:
        return _FakeBlob(self._store, name)


class _FakeClient:
    def __init__(self, store: dict[str, bytes]) -> None:
        self._store = store

    def bucket(self, name: str) -> _FakeBucket:
        return _FakeBucket(self._store)


def _fake_factory(store: dict[str, bytes]) -> object:
    def factory() -> object:
        return _FakeClient(store)

    return factory


async def test_gcs_store_round_trip() -> None:
    backing: dict[str, bytes] = {}
    store = GcsMediaStore(
        bucket="openad-media-test", prefix="media", client_factory=_fake_factory(backing)
    )
    ref = await store.put("7.bin", b"gcs bytes")
    assert ref == "gs://openad-media-test/media/7.bin"
    assert await store.get(ref) == b"gcs bytes"


async def test_gcs_store_missing_returns_none() -> None:
    store = GcsMediaStore(bucket="b", prefix="media", client_factory=_fake_factory({}))
    assert await store.get("gs://b/media/missing.bin") is None


async def test_gcs_store_overwrites_existing_object() -> None:
    """A replay (re-verification after a reorg or scheduled re-check) must not fail on an
    object that's already there."""
    backing: dict[str, bytes] = {}
    store = GcsMediaStore(
        bucket="openad-media-test", prefix="media", client_factory=_fake_factory(backing)
    )
    await store.put("7.bin", b"first")
    ref = await store.put("7.bin", b"second")
    assert await store.get(ref) == b"second"


def _counting_factory(store: dict[str, bytes], calls: list[int]) -> object:
    def factory() -> object:
        calls.append(1)
        return _FakeClient(store)

    return factory


async def test_gcs_store_rejects_ref_from_a_different_bucket() -> None:
    calls: list[int] = []
    store = GcsMediaStore(
        bucket="openad-media-test", prefix="media", client_factory=_counting_factory({}, calls)
    )
    assert await store.get("gs://someone-elses-bucket/media/1.bin") is None
    assert calls == []  # rejected before ever touching the client


async def test_gcs_store_rejects_ref_outside_configured_prefix() -> None:
    calls: list[int] = []
    store = GcsMediaStore(
        bucket="openad-media-test", prefix="media", client_factory=_counting_factory({}, calls)
    )
    assert await store.get("gs://openad-media-test/other-prefix/1.bin") is None
    assert calls == []


async def test_local_store_rejects_ref_outside_root(tmp_path: Path) -> None:
    root = tmp_path / "cache"
    root.mkdir()
    outside = tmp_path / "outside.bin"
    outside.write_bytes(b"not in the cache")
    store = LocalMediaStore(root)
    assert await store.get(str(outside)) is None


def test_default_gcs_client_factory_caches_the_client(monkeypatch: pytest.MonkeyPatch) -> None:
    """The client is built once and reused, not reconstructed on every call."""
    import sys
    import types

    from openad.services import media_store as media_store_module

    calls = {"n": 0}

    class _RealishClient:
        def __init__(self) -> None:
            calls["n"] += 1

    fake_storage = types.ModuleType("google.cloud.storage")
    fake_storage.Client = _RealishClient  # type: ignore[attr-defined]
    fake_google_cloud = types.ModuleType("google.cloud")
    fake_google_cloud.storage = fake_storage  # type: ignore[attr-defined]
    fake_google = types.ModuleType("google")
    fake_google.cloud = fake_google_cloud  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "google", fake_google)
    monkeypatch.setitem(sys.modules, "google.cloud", fake_google_cloud)
    monkeypatch.setitem(sys.modules, "google.cloud.storage", fake_storage)

    media_store_module.default_gcs_client_factory.cache_clear()
    try:
        first = media_store_module.default_gcs_client_factory()
        second = media_store_module.default_gcs_client_factory()
        assert first is second
        assert calls["n"] == 1
    finally:
        media_store_module.default_gcs_client_factory.cache_clear()


async def test_dispatcher_picks_by_scheme(tmp_path: Path) -> None:
    settings = Settings(
        env="test",
        media_backend="gcs",
        media_gcs_bucket="openad-media-test",
        media_gcs_prefix="media",
        media_cache_dir=tmp_path,
        _env_file=None,  # type: ignore[call-arg]
    )
    local_path = tmp_path / "9.bin"
    local_path.write_bytes(b"local bytes")
    # A local ref reads via the local dispatch path even though the configured backend is gcs.
    assert await dispatch_get(str(local_path), settings=settings) == b"local bytes"
    # A gs:// ref with no reachable bucket (fake client not wired here) logs and returns None
    # rather than raising, when the configured backend can't reach it.
    other_env_settings = Settings(
        env="test",
        media_backend="local",
        media_cache_dir=tmp_path,
        _env_file=None,  # type: ignore[call-arg]
    )
    assert await dispatch_get("gs://other-bucket/media/1.bin", settings=other_env_settings) is None


def test_media_store_for_picks_local_by_default(tmp_path: Path) -> None:
    settings = Settings(env="test", media_cache_dir=tmp_path, _env_file=None)  # type: ignore[call-arg]
    store = media_store_for(settings)
    assert isinstance(store, LocalMediaStore)


def test_media_store_for_picks_gcs(tmp_path: Path) -> None:
    settings = Settings(
        env="test",
        media_backend="gcs",
        media_gcs_bucket="openad-media-test",
        media_cache_dir=tmp_path,
        _env_file=None,  # type: ignore[call-arg]
    )
    store = media_store_for(settings)
    assert isinstance(store, GcsMediaStore)


def test_settings_requires_bucket_for_gcs_backend(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="OPENAD_MEDIA_GCS_BUCKET"):
        Settings(
            env="test",
            media_backend="gcs",
            media_cache_dir=tmp_path,
            _env_file=None,  # type: ignore[call-arg]
        )


async def test_verify_creative_writes_through_gcs_backend(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    from openad.models.offchain import VERIFY_VERIFIED
    from openad.services import media_store as media_store_module
    from tests.conftest import make_creative
    from tests.test_media import tiny_png

    backing: dict[str, bytes] = {}
    monkeypatch.setattr(media_store_module, "default_gcs_client_factory", _fake_factory(backing))

    settings = Settings(
        env="test",
        database_url="sqlite+aiosqlite:///:memory:",
        media_backend="gcs",
        media_gcs_bucket="openad-media-test",
        media_gcs_prefix="media",
        media_cache_dir=tmp_path,
        rpc_url="http://127.0.0.1:1",
        _env_file=None,  # type: ignore[call-arg]
    )

    from openad.db.session import Database
    from openad.models import CreativeVerification

    database = Database(settings.database_url)
    await database.create_all()
    try:
        async with database.sessions() as session:
            png = tiny_png()
            creative = make_creative()
            creative.content_hash = media_service.keccak_hex(png)

            async def fake_fetch_media(uri: str, *, settings: Settings) -> tuple[bytes, str]:
                return png, VERIFY_VERIFIED

            monkeypatch.setattr(media_service, "fetch_media", fake_fetch_media)
            session.add(creative)
            await session.commit()

            status = await media_service.verify_creative(session, creative.creative_id, settings)
            assert status == VERIFY_VERIFIED

            verification = await session.get(CreativeVerification, creative.creative_id)
            assert verification is not None
            assert verification.cached_path == "gs://openad-media-test/media/7.bin"
            assert backing["media/7.bin"] == png
    finally:
        await database.dispose()
