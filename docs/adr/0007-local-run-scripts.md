# ADR-0007: Local run scripts

- **Status:** Accepted
- **Date:** 2026-09-08
- **Scope:** repo

## Context

Phase 0 left a working but manual local loop (docker, two `uv sync`s, a Moccasin wallet import,
MockUSDC deploy, `openad.db.bootstrap`, `npm install`, then three long-running processes). A
developer on Windows 10 / PowerShell 5.1 needs one-command setup, start, and stop. The stack is
intentionally partial until ROADMAP 1.1–1.4: `deploy_protocol` raises `NotImplementedError`,
deploy writes a MockUSDC-only `31337.json`, and the indexer idles with `indexer.nothing_to_index`.
Those facts must be surfaced, not hidden. Docs must not present `alembic upgrade head` as the
current local step (baseline is ROADMAP 2.2) and must never recommend `mox install`.

## Decision

- **D1 — Location.** Repo-root `scripts/setup.ps1`, `scripts/dev-up.ps1`, `scripts/dev-down.ps1`,
  matching `.cmd` shims that call `powershell -File` with Bypass, plus npm wrappers
  `stack:setup` / `stack:up` / `stack:down`. Child processes spawned by `dev-up.ps1` use
  `cmd.exe` so Restricted execution policy cannot block `npm.ps1`. The `.cmd` files are the
  documented Windows entry point.
- **D2 — ROADMAP.** Phase 0 task **0.5 Local run scripts** is added and marked done in the same
  change as the scripts and this ADR.
- **D3 — Record.** This ADR is the decision log for D1–D8.
- **D4 — PowerShell 5.1.** Scripts use no `&&`, no `??`, and no ternary. A small `Invoke-Step`
  helper checks `$LASTEXITCODE`. Wrappers invoke
  `powershell -ExecutionPolicy Bypass -File scripts/<name>.ps1`.
- **D5 — No secrets, idempotent.** Scripts never print env values. `.env` is copied from
  `.env.example` only when missing. Local Anvil deploy uses `mox run deploy --private-key`
  with Foundry account #0, read from the comments in `docker-compose.yml` (never printed).
  That avoids `mox wallet import`, which is interactive and cannot be completed in a
  Cursor agent terminal. Every step is safe to re-run.
- **D6 — Honesty.** `setup.ps1` states that deploy wrote MockUSDC only and that protocol contracts
  arrive in ROADMAP 1.1–1.4. `dev-up.ps1` states that the indexer will log `nothing_to_index`
  until then.
- **D7 — Process model: new terminals.** `dev-up.ps1` opens one titled `cmd.exe` window per
  process (`openad-api`, `openad-indexer`, `openad-web`, optional `openad-embed` via `-Embed`)
  so Restricted PowerShell policy cannot block `npm.ps1`. Stopping an app is close-the-window
  or Ctrl+C inside it. `dev-down.ps1` stops **docker only** (plus optional `-Reset` to drop
  `pgdata`, `contracts/deployments/31337.json`, and `api/.cache/`). It never kills app processes.
- **D8 — PowerShell only.** No bash twins. Bash is deferred until CI or a macOS/Linux contributor
  exists.

## Alternatives considered

- **Background jobs + PID files** — logs hidden in files; stop/kill is easy to get wrong on
  Windows; rejected in favor of titled windows (D7).
- **`concurrently` (or similar) as an npm dependency** — interleaved logs and an extra runtime
  dependency; rejected (D7).
- **No orchestration (document the six manual steps only)** — poor UX on a two-language stack;
  rejected (D1).
- **Bash twins (`*.sh`) from day one** — untestable on this Windows machine and likely to drift;
  rejected until CI or a non-Windows contributor exists (D8).

## Consequences

- Documented Windows surface is `.\scripts\*.cmd` (avoids Restricted policy blocking `npm.ps1`).
  `npm run stack:*` still works after `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` or via
  `npm.cmd`.
- Developers must close the titled `openad-*` windows themselves; `stack:down` will not do that.
- Local Anvil setup never prompts for a key or password. Testnet/mainnet deploys still use
  `mox wallet import` in a real terminal (see `contracts/README.md`).
- A macOS/Linux or CI port will need a follow-up ADR or a bash/Make sibling; until then the
  scripts are Windows PowerShell only.

## References

- `docs/ARCHITECTURE.md` §7
- `docs/ROADMAP.md` task 0.5
- `docker-compose.yml` (Anvil account #0 comments; `pgdata` volume)
- `contracts/README.md` (never `mox install`; wallet import)
- `api/src/openad/chain/deployments.py` (indexer hard-fails without `31337.json`)
