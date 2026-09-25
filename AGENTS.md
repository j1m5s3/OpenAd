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
  funds or write leases. The opt-in `sim/` daemon may use public Anvil keys on 31337 only (ADR-0012).
  The DEV-only Anvil injector (ADR-0013) forwards RPC and stores addresses, not keys. The CPC
  settler process (ADR-0014) may hold `OPENAD_SETTLER_KEY` and may only `settle_batch`.
- Slots are permanent; periods are leased; leases expire by time. Never "sell" a slot in protocol code.
- One transaction to buy **in LEASE mode**. No bids, escrow, settle steps, or keepers on
  `Marketplace`. CPC mode (ADR-0014) escrows in `CampaignVault` and batch-settles; HTTP `api/`
  and `web/` still hold no spending keys. The settler process may hold `OPENAD_SETTLER_KEY` only.
- `Marketplace` never holds USDC after a transaction. `CampaignVault` may, equal to open
  `remaining` (PROTOCOL §11 invariant 11).
- Serving (`api/src/openad/serve/`, `embed/`) never reads the chain and never proxies advertiser
  **media** URLs. CPC clicks may 302 through `/v1/c` (ADR-0014).
- Every on-chain state change emits exactly one event from `docs/PROTOCOL.md` §6, and every
  event has exactly one indexer handler.
- Money is integer USDC base units end to end. Time is Unix seconds.
- Spec ↔ interface ↔ code stay in sync in the same commit.

## Where things are

| Need                                 | Location                                                                                  |
| ------------------------------------ | ----------------------------------------------------------------------------------------- |
| Contract semantics                   | `docs/PROTOCOL.md` (CPC: §11 Implemented)                                                 |
| Contract signatures                  | `contracts/src/interfaces/*.vyi` (`ICampaignVault.vyi` = ROADMAP 5.2)                     |
| Contract code / tests / deploy       | `contracts/src/`, `contracts/tests/`, `contracts/script/deploy.py`                        |
| Addresses + ABIs per chain           | `contracts/deployments/<chainId>.json` (the only contracts → off-chain hand-off)          |
| API app, settings, routers, services | `api/src/openad/` (see `ARCHITECTURE.md` §3.1)                                            |
| Indexer                              | `api/src/openad/indexer/`                                                                 |
| Serve endpoint + media cache         | `api/src/openad/serve/`, `api/src/openad/services/serve.py`                               |
| Serve JSON contract                  | `api/src/openad/schemas/serve.py` ⇔ `embed/src/types.ts`                                  |
| Web app                              | `web/src/` (feature folders; wagmi for writes; API for reads)                             |
| Embed element                        | `embed/src/open-ad.ts`                                                                    |
| Playwright E2E                       | `e2e/` (YAML scenarios, mock EIP-1193)                                                    |
| Headed SME / UX critique             | `.cursor/skills/sandbox-sme-critique/`, `sandbox-ux-critique/`; `docs/qa/`                |
| Playwright MCP                       | `.cursor/mcp.json` (`playwright` + `openad-sim`)                                          |
| Local sim daemon                     | `sim/` (opt-in Anvil personas; ADR-0012)                                                  |
| Env vars                             | `.env.example` (all prefixed `OPENAD_`; web uses `VITE_`)                                 |
| Local infra                          | `docker-compose.yml` (Anvil + Postgres); `docker-compose.stack.yml` (api/indexer/settler) |
| API image                            | `api/Dockerfile` (also used for the indexer and settler processes)                        |
| CI                                   | `.github/workflows/ci.yml` (no GCP / no mainnet broadcast)                                |
| Business docs                        | `docs/business/` (market fit, GTM, pitch deck, demo script, launch checklist)             |
| Demo mode                            | `web/src/demo/` (ADR-0016); `e2e/demo/` (Playwright suite + screenshot capture)           |
| GCP deploy                           | `infra/gcp/`, `docs/deploy-gcp.md`, `scripts/deploy-gcp.sh` (ADR-0017)                    |

## Commands

```text
# local stack (Windows; scripts/*.cmd bypass PowerShell execution policy)
.\scripts\setup.cmd                                 # .env, docker, protocol deploy, alembic upgrade, npm install (no wallet prompt)
.\scripts\dev-up.cmd                                # starts docker if needed; titled windows: api, indexer, web (-Embed optional)
.\scripts\sim-up.cmd                                # optional live marketplace activity (does not start with the stack)
.\scripts\dev-down.cmd                              # stops docker; next up restarts Anvil/Postgres (Anvil chain is ephemeral)
# if npm.ps1 is blocked: use the .cmd files or npm.cmd run stack:*  (not `npm`)

# local stack (Linux/macOS/WSL; bash twins, ADR-0007 amendment; PowerShell stays canonical on Windows)
./scripts/setup.sh                                  # same steps as setup.ps1; --skip-docker, --dry-run
./scripts/dev-up.sh                                 # starts docker if needed; background children, not titled windows; --embed, --dry-run
./scripts/dev-down.sh                               # stops docker; --reset drops pgdata/31337.json/api/.cache; --dry-run
./scripts/stack-docker.sh                           # one-command full stack: api/indexer/settler as containers; --dry-run
npm run stack:setup:sh / stack:up:sh / stack:down:sh / stack:docker   # npm wrappers for the above
npm run check:sh                                    # static self-test for scripts/*.sh (bash -n, --help, --dry-run)

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
uv run alembic upgrade head                         # schema (bootstrap.py remains a test/dev helper; refuses prod)
uv run uvicorn openad.main:app --reload             # http://localhost:8000/v1/health
uv run python -m openad.indexer
uv run python -m openad.settler                     # CPC settle; needs OPENAD_SETTLER_KEY

# web + embed (npm workspaces at repo root)
npm install                                         # once
npm run typecheck && npm run lint && npm run test && npm run build
npm run test:e2e                                    # Playwright YAML (needs Chromium once)
npm run dev:web                                     # http://localhost:5173
npm run dev:embed                                   # demo page
npm run build:demo                                  # static web/dist-demo (ADR-0016)
npm run test:demo -w e2e                            # demo-mode Playwright suite (no stack needed)
npm run capture:screenshots -w e2e                  # regenerate docs/business/assets/*.png
```

## Working style expected of you

- Start from `docs/ROADMAP.md`; state which task you are taking; read only its Pointers.
- Write or update the spec before the code when behaviour changes.
- Keep changes scoped to the task. Note unrelated findings in your summary; do not fix them.
- Run the package's checks (see "Definition of done" in `docs/CONVENTIONS.md` §7) before you stop.
- Update `docs/ROADMAP.md` status and any affected doc in the same change.
- Use Conventional Commits with the package as scope (`feat(contracts): …`).
- Never create files or directories whose names end in whitespace.
