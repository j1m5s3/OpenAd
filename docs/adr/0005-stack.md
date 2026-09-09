# ADR-0005: Technology stack

- **Status:** Accepted
- **Date:** 2026-09-08
- **Scope:** repo

## Context

The maintainer prefers a Python-first stack; the product needs smart contracts, an indexer, a
serving edge, a wallet-connected web app, and a tiny embeddable component.

## Decision

| Area | Choice | Notes |
| --- | --- | --- |
| Contracts | **Vyper 0.4 + Moccasin** (titanoboa tests), **snekmate** modules | Python-native toolchain; `uv run mox …`. Anvil via Docker for integration; Base fork tests. |
| Off-chain services | **Python 3.12, FastAPI, SQLAlchemy 2 (async), Alembic, Postgres, web3.py**, structlog | One package `openad`, three processes (api, serve, indexer). `uv` for env/deps, `ruff` + `mypy --strict`. |
| Web app | **Vite + React 19 + TypeScript + MUI**, react-router, TanStack Query, **wagmi + viem** | SPA, no SSR. Injected + Coinbase Wallet connectors; RainbowKit/AppKit optional later. |
| Embed | **Vanilla TypeScript web component**, Vite library build | Zero runtime deps, ≤ 5 KB gzipped. |
| Package management | `uv` (Python), **npm workspaces** (TypeScript) | npm chosen over pnpm because it is already present on the maintainer's machine; no functional difference for two packages. |
| Local infra | `docker compose`: `ghcr.io/foundry-rs/foundry` (Anvil), `postgres:16` | No Foundry install required on the host. |
| Type sharing Python ↔ TS | OpenAPI → `openapi-typescript` (ROADMAP 3.5); ABIs via deployments artifact + `abitype` | |

## Alternatives considered

- **Solidity + Foundry** — larger ecosystem and audit tooling, but the maintainer's expressed
  preference is Vyper/Moccasin and the contract surface is small (three contracts). Accepted
  trade-off: thinner static-analysis tooling; mitigated by property tests and a review before
  mainnet (ROADMAP 4.3).
- **Next.js** — SSR is not useful for a wallet app and duplicates the API server; a Vite SPA is
  simpler. Prerender public slot pages later if SEO matters.
- **TypeScript indexer (Ponder/Subsquid)** — good tools, but a Python indexer keeps one language
  for all off-chain code and shares the ORM models with the API.
- **Tailwind/shadcn** — fine, but MUI was requested and gives complete components quickly.

## Consequences

- Vyper constraints shape the data model: fixed-length strings, no inheritance (module
  composition), `.vyi` interfaces as the contract of record.
- web3.py major versions move quickly; `api/chain/` isolates the dependency.
- Two toolchains (uv, npm) at the root; the root `README.md` documents both.
