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

| Document                                       | What it answers                          |
| ---------------------------------------------- | ---------------------------------------- |
| [`docs/GLOSSARY.md`](docs/GLOSSARY.md)         | What do the words mean?                  |
| [`docs/PROTOCOL.md`](docs/PROTOCOL.md)         | What do the contracts do, exactly?       |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | How do the packages fit together?        |
| [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md)   | How do we write and test code here?      |
| [`docs/ROADMAP.md`](docs/ROADMAP.md)           | What is next, and what does "done" mean? |
| [`docs/adr/`](docs/adr/)                       | Why was it decided this way?             |

## Repository layout

```text
contracts/   Vyper + Moccasin — AdSlot, Marketplace, CreativeRegistry, MockUSDC
api/         Python/FastAPI — read API, serving edge, chain indexer
web/         Vite + React + MUI + wagmi — marketplace and dashboards
embed/       <open-ad> web component (zero dependencies)
docs/        Specifications, conventions, roadmap, ADRs
```

## Quickstart (local)

Prerequisites: [uv](https://docs.astral.sh/uv/), Node ≥ 20, Docker Desktop running.

```text
.\scripts\setup.cmd      # .env, docker, protocol deploy, alembic upgrade, npm install
.\scripts\dev-up.cmd     # starts docker if needed; titled windows: api, indexer, web  (add -Embed for the embed demo)
.\scripts\dev-down.cmd   # stops docker; next dev-up brings Anvil/Postgres back (Anvil chain is ephemeral)
```

These `.cmd` shims exist because Windows PowerShell often blocks `npm.ps1` (`running scripts is disabled on this system`). Equivalents: `npm.cmd run stack:up`, or `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` and then `npm run stack:*`.

Setup deploys the protocol on Anvil (CreativeRegistry, AdSlot, Marketplace, MockUSDC) and applies Alembic migrations. The manual equivalent of these scripts is in `docs/ARCHITECTURE.md` §7.

After `stack:up`: API health at `http://localhost:8000/v1/health`, web at `http://localhost:5173`.

## License

TBD.
