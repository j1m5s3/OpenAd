# OpenAd

An open, non-custodial advertising marketplace on Base.

- **Publishers** mint ad **slots** as NFTs, define a **calendar** of periods, and sell each period
  by **Dutch auction** in USDC. Proceeds arrive in the same transaction as the sale, minus a
  transparent protocol fee.
- **Advertisers** register **creatives** (hosted media with an on-chain content hash, or an NFT
  they own), get publisher **approval**, and **buy** periods in one transaction.
- **Pages** render the current creative through a ≤ 5 KB `<open-ad>` element backed by an
  indexer-fed serving edge that never reads the chain and never exposes visitors to advertisers.

Status: **Phase 0 (foundation) complete; Phase 1 (protocol contracts) next.** See
[`docs/ROADMAP.md`](docs/ROADMAP.md).

## Documentation

Start at [`docs/README.md`](docs/README.md). AI agents and new contributors: read
[`AGENTS.md`](AGENTS.md) first.

| Document | What it answers |
| --- | --- |
| [`docs/GLOSSARY.md`](docs/GLOSSARY.md) | What do the words mean? |
| [`docs/PROTOCOL.md`](docs/PROTOCOL.md) | What do the contracts do, exactly? |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | How do the packages fit together? |
| [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md) | How do we write and test code here? |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | What is next, and what does "done" mean? |
| [`docs/adr/`](docs/adr/) | Why was it decided this way? |

## Repository layout

```text
contracts/   Vyper + Moccasin — AdSlot, Marketplace, CreativeRegistry, MockUSDC
api/         Python/FastAPI — read API, serving edge, chain indexer
web/         Vite + React + MUI + wagmi — marketplace and dashboards
embed/       <open-ad> web component (zero dependencies)
docs/        Specifications, conventions, roadmap, ADRs
```

## Quickstart (local)

Prerequisites: [uv](https://docs.astral.sh/uv/), Node ≥ 20, Docker.

```bash
docker compose up -d                                  # Anvil :8545, Postgres :5432
cp .env.example .env

cd contracts && uv sync && uv run mox compile && uv run mox test
uv run mox run deploy --network anvil                 # → deployments/31337.json
cd ..

cd api && uv sync && uv run pytest
uv run python -m openad.db.bootstrap                  # dev tables (Alembic baseline is ROADMAP 2.2)
uv run uvicorn openad.main:app --reload               # http://localhost:8000/v1/health
uv run python -m openad.indexer                       # in another shell
cd ..

npm install && npm run build
npm run dev:web                                       # http://localhost:5173
npm run dev:embed                                     # embed demo page
```

## License

TBD.
