# openad-api

Off-chain services for OpenAd, one Python package (`openad`) run as three processes:

| Process | Command | Purpose |
| --- | --- | --- |
| api | `uv run uvicorn openad.main:app --reload` | Public read API (`/v1/slots…`), serving edge (`/v1/serve/…`), auth (ROADMAP 3.1) |
| indexer | `uv run python -m openad.indexer` | Contract events → Postgres (`indexer/`) |
| (serve) | same process as api for now | May move to a CDN worker (ROADMAP 4.4) |

Design: [`/docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) §3. Rules: [`/docs/CONVENTIONS.md`](../docs/CONVENTIONS.md) §4
and `.cursor/rules/python-api.mdc`. Serving rule: [`/docs/PROTOCOL.md`](../docs/PROTOCOL.md) §7.

## Layout

```text
src/openad/
  main.py          create_app(); DomainError → HTTP; routers mounted under /v1
  config.py        Settings (OPENAD_*), the only place env vars are read
  logging.py       structlog
  errors.py        DomainError, NotFoundError, ForbiddenError, ConflictError
  db/              Base + naming conventions, Database/session dependency, chain-safe column types
  models/          slots/terms/leases · creatives/approvals/allowlists · indexer cursor/protocol config · off-chain tables
  schemas/         Pydantic (camelCase JSON); serve.py MUST match embed/src/types.ts
  routers/         health, serve, slots, creatives, publishers, advertisers, auth
  services/        serve, slots, periods, creatives, media, auth, offchain
  serve/           origin.py + cache generation; verified bytes on disk via Settings.media_cache_path
  chain/           deployments.py (artifact loader), client.py (AsyncWeb3) — indexer only
  indexer/         events.py (EXPECTED_EVENTS), handlers.py (one per event), runner.py, __main__.py
alembic/           migrations (baseline 0001_baseline)
tests/             pytest + pytest-asyncio; SQLite in-memory; httpx ASGI client
```

## Commands

```bash
uv sync                                  # once
uv run pytest                            # tests
uv run ruff check && uv run ruff format --check && uv run mypy src
uv run uvicorn openad.main:app --reload  # http://localhost:8000/v1/health, docs at /v1/docs
uv run python -m openad.indexer          # needs contracts/deployments/<chainId>.json
uv run alembic upgrade head              # schema
uv run alembic revision --autogenerate -m "describe change"
uv run python -m openad.db.bootstrap     # test/dev helper; refuses OPENAD_ENV=prod
```

Local containers (not GCP): `api/Dockerfile` runs `alembic upgrade head` then uvicorn.
The indexer uses the same image with a different command.

```bash
docker compose -f docker-compose.yml -f docker-compose.stack.yml up --build
# API http://localhost:8000/v1/health (includes indexerLag)
```

Configuration comes from `../.env` (see `../.env.example`); tests never read it.

## Invariants enforced here

- `openad.serve` and `openad.services` never import `openad.chain`; the request path never
  touches the RPC.
- Every event in `indexer/events.py::EXPECTED_EVENTS` has exactly one handler
  (`tests/test_indexer_handlers.py` fails otherwise). Add both when the protocol adds an event.
- Money columns use `db.types.Uint256` (exact, sortable) — never floats or `BigInteger`.
- Addresses are stored lowercase (`db.types.Address`); checksum only in responses if needed.
- `serve_events` never stores IPs, user agents, or cookies.
