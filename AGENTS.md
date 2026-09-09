# AGENTS.md — how to work in this repository

You are working on **OpenAd**, a non-custodial advertising marketplace on Base: publishers mint
ad **slots** as NFTs, define a **calendar** of periods, and sell each period by **Dutch auction**
in USDC; advertisers register **creatives**, get publisher **approval**, and **buy** periods in
one transaction; a tiny **embed** renders the current creative from an indexer-backed **serve**
endpoint. The full vocabulary is in `docs/GLOSSARY.md`.

## Read this first, in order

1. `docs/GLOSSARY.md` — terms (2 min).
2. `docs/PROTOCOL.md` — on-chain rules. Signatures live in `contracts/src/interfaces/*.vyi`.
3. `docs/ARCHITECTURE.md` — packages, data flow, serve contract, env vars.
4. `docs/CONVENTIONS.md` — coding rules per package, testing, git, definition of done.
5. `docs/ROADMAP.md` — pick the first unchecked task; each has Pointers and Acceptance.
6. `docs/adr/` — why decisions were made. Add an ADR for any new non-obvious decision.

Do not read the old prototype (`C:\source\mixed-lang\old-ad-nft\…`); its lessons are in
`docs/adr/0001-lessons-from-the-prototype.md` and it must not be ported.

## Non-negotiable invariants

- Non-custodial: no code in `api/` or `web/` signs user transactions or holds keys that can move
  funds or write leases.
- Slots are permanent; periods are leased; leases expire by time. Never "sell" a slot in protocol code.
- One transaction to buy. No bids, escrow, settle steps, or keepers.
- `Marketplace` never holds USDC after a transaction.
- Serving (`api/src/openad/serve/`, `embed/`) never reads the chain and never proxies advertiser URLs.
- Every on-chain state change emits exactly one event from `docs/PROTOCOL.md` §6, and every
  event has exactly one indexer handler.
- Money is integer USDC base units end to end. Time is Unix seconds.
- Spec ↔ interface ↔ code stay in sync in the same commit.

## Where things are

| Need | Location |
| --- | --- |
| Contract semantics | `docs/PROTOCOL.md` |
| Contract signatures | `contracts/src/interfaces/*.vyi` |
| Contract code / tests / deploy | `contracts/src/`, `contracts/tests/`, `contracts/script/deploy.py` |
| Addresses + ABIs per chain | `contracts/deployments/<chainId>.json` (the only contracts → off-chain hand-off) |
| API app, settings, routers, services | `api/src/openad/` (see `ARCHITECTURE.md` §3.1) |
| Indexer | `api/src/openad/indexer/` |
| Serve endpoint + media cache | `api/src/openad/serve/`, `api/src/openad/services/serve.py` |
| Serve JSON contract | `api/src/openad/schemas/serve.py` ⇔ `embed/src/types.ts` |
| Web app | `web/src/` (feature folders; wagmi for writes; API for reads) |
| Embed element | `embed/src/open-ad.ts` |
| Env vars | `.env.example` (all prefixed `OPENAD_`; web uses `VITE_`) |
| Local infra | `docker-compose.yml` (Anvil + Postgres) |

## Commands

```text
# infra
docker compose up -d

# contracts (uv-managed venv inside contracts/; snekmate comes from pyproject, never `mox install`)
cd contracts && uv sync                             # once
uv run mox compile
uv run mox test
uv run mox run deploy --network anvil               # writes deployments/31337.json

# api
cd api && uv sync                                   # once
uv run ruff check && uv run ruff format --check && uv run mypy src
uv run pytest
uv run python -m openad.db.bootstrap                # dev tables until ROADMAP 2.2 (then: alembic upgrade head)
uv run uvicorn openad.main:app --reload             # http://localhost:8000/v1/health
uv run python -m openad.indexer

# web + embed (npm workspaces at repo root)
npm install                                         # once
npm run typecheck && npm run lint && npm run test && npm run build
npm run dev:web                                     # http://localhost:5173
npm run dev:embed                                   # demo page
```

## Working style expected of you

- Start from `docs/ROADMAP.md`; state which task you are taking; read only its Pointers.
- Write or update the spec before the code when behaviour changes.
- Keep changes scoped to the task. Note unrelated findings in your summary; do not fix them.
- Run the package's checks (see "Definition of done" in `docs/CONVENTIONS.md` §7) before you stop.
- Update `docs/ROADMAP.md` status and any affected doc in the same change.
- Use Conventional Commits with the package as scope (`feat(contracts): …`).
- Never create files or directories whose names end in whitespace.
