# JIT_PLAN — Local run scripts for the OpenAd dev stack

Goal: give the developer (Windows 10, PowerShell) one-command setup / start / stop for the local
stack, and align docs so nothing points at commands that do not work yet (`alembic upgrade head`)
or are forbidden (`mox install`). Honest about the partial stack: Phase 1 contracts are not
implemented (`deploy_protocol` raises `NotImplementedError`); deploy writes a MockUSDC-only
`31337.json`; the indexer idles with `indexer.nothing_to_index`. That is expected and must be
surfaced, not hidden.

## 1. Architectural decisions

### Approved (D7/D8 confirmed by the user; no open questions remain)

- **D1 — Location:** new `scripts/` directory at repo root (`scripts/setup.ps1`, `dev-up.ps1`,
  `dev-down.ps1`) plus thin npm wrappers `stack:setup` / `stack:up` / `stack:down` in the root
  `package.json`. Rationale: the repo already treats root npm scripts as the entry point
  (`dev:web`, `dev:embed`, `build`); npm is a documented prerequisite; wrappers keep one
  discoverable surface while the `.ps1` files stay directly runnable.
- **D2 — ROADMAP:** add Phase 0 task **0.5 "Local run scripts"**, marked `[x]` in the same
  change (repo rule: docs + ROADMAP updated with the code).
- **D3 — ADR:** add `docs/adr/0007-local-run-scripts.md` (next free number; 0000–0006 exist)
  recording D1–D8 and the rejected alternatives (repo rule: ADR for non-obvious decisions).
- **D4 — PowerShell 5.1 compatibility:** no `&&`, no ternary/`??`; a small `Invoke-Step` helper
  that checks `$LASTEXITCODE`; wrappers invoke `powershell -ExecutionPolicy Bypass -File`.
- **D5 — No secrets, idempotent:** scripts never print env values; `.env` is copied from
  `.env.example` only when missing; the Moccasin `anvil` wallet import runs only when the
  keystore is absent (interactive prompt — the well-known Anvil account #0 key is already
  public in `docker-compose.yml` comments); every step is safe to re-run.
- **D6 — Honesty:** `setup.ps1` ends with a summary stating the deploy wrote MockUSDC only and
  protocol contracts arrive in ROADMAP 1.1–1.4; `dev-up.ps1` notes the indexer will log
  `nothing_to_index` until then.
- **D7 — Process model (user-approved): new terminals.** `dev-up.ps1` uses `Start-Process` to
  open one **titled** PowerShell window per process (api, indexer, web, optional embed). Logs
  stay visible per process; stopping = close the window or Ctrl+C in it. `dev-down.ps1` stops
  **docker only** (plus optional `-Reset`); it never kills app processes — the script and the
  README state this explicitly. Rejected: background jobs + PID files (hidden logs), a
  `concurrently` dependency (interleaved logs, extra dep), no orchestration (poor UX).
- **D8 — Script language (user-approved): PowerShell only.** `scripts/*.ps1` + root npm
  wrappers; **no bash twins**. ADR-0007 records that bash is deferred until CI or a mac/linux
  contributor exists. Rejected: maintaining untestable `*.sh` pairs from day one.

## 2. Pointers map (verified by reading slices)

- `README.md` L40–62 — quickstart: 6 manual steps; works today; to be replaced by 3 commands.
- `AGENTS.md` L52–76 — canonical commands block; already correct re: bootstrap (L67); add stack scripts.
- `docs/ARCHITECTURE.md` L339–348 — §7 local loop; **L343 leads with `alembic upgrade head`**
  (fails today — no baseline until ROADMAP 2.2); must lead with `openad.db.bootstrap`.
- `docs/CONVENTIONS.md` L96–103 — git/PR rules (never commit `.env`, `31337.json`); L107–115 DoD commands.
- `docs/README.md` L21–30 — "which document to update when" (tooling → CONVENTIONS optional; env/flow → ARCHITECTURE).
- `docs/ROADMAP.md` L14–23 — Phase 0 tasks 0.1–0.4 all `[x]`; insert 0.5 after 0.4.
- `docs/adr/` — 0000-template … 0006 exist; next is **0007**.
- `docker-compose.yml` L12–42 — anvil (:8545, chain 31337) + postgres (:5432), both with healthchecks;
  Anvil account #0 key in comments L8–10; named volume `pgdata`.
- `.env.example` L1–57 — all `OPENAD_*` / `VITE_*` defaults work as-is; no changes needed.
- `package.json` L8–17 — root scripts; add three `stack:*` wrappers; prettier covers `*.md`/`docs/**/*.md`.
- `web/package.json` L7–15 — `dev` runs `sync:deployments` first (L8), so no manual sync before `dev:web`.
- `embed/package.json` L14–21 — `dev` is plain vite; size check runs only in `build`.
- `contracts/README.md` L30–64 — commands; L44–48 wallet import; L60–64 **Windows note: never `mox install`**.
- `contracts/pyproject.toml` L9–18 — snekmate via uv venv, not `mox install`.
- `contracts/moccasin.toml` L18–25 — anvil network, `default_account_name = "anvil"` → deploy needs the imported wallet.
- `contracts/script/deploy.py` L55–64 — MockUSDC deploy+mint; L66–81 `deploy_protocol` stub (raises, caught at L87–89);
  L83–108 artifact writer runs regardless → MockUSDC-only `31337.json` today.
- `contracts/script/artifacts.py` L30–54 — artifact schema/writer (UTF-8+LF; `deployments/<chainId>.json`).
- `api/README.md` L5–10 processes; L34–47 commands (L44 bootstrap note already correct).
- `api/src/openad/main.py` L26–69 — app factory; uvicorn entry `openad.main:app`.
- `api/src/openad/indexer/__main__.py` L16–34 — loads deployment, warns `nothing_to_index`, runs forever.
- `api/src/openad/indexer/runner.py` L157–168 — infinite poll loop; survives iteration errors.
- `api/src/openad/chain/deployments.py` L44–52 — indexer **hard-fails** if `deployments/<chainId>.json` missing
  → `dev-up.ps1` preflight must check the artifact and point at setup.
- `api/src/openad/db/bootstrap.py` L19–32 — dev `create_all`; refuses `OPENAD_ENV=prod`.
- `web/scripts/sync-deployments.mjs` L1–43 — copies artifacts into git-ignored `web/src/generated/`.
- `.gitignore` — already covers `.env`, `contracts/deployments/31337.json`, `web/src/generated/`, `api/.cache/`.
- Repo state: clean except untracked `.cursor/JIT_INDEX.md`; no `scripts/` dir exists yet.

## 3. Micro-steps

### A. Scripts

1. **Create `scripts/setup.ps1`** (new). Idempotent, PS 5.1. Ordered steps, each guarded:
   1. Prereqs: `uv`, `node` (≥ 20 per `package.json` engines), `npm`, `docker` on PATH;
      `docker info` succeeds (Docker Desktop running) — friendly errors otherwise.
   2. Copy `.env.example` → `.env` only if `.env` missing (README L44–45; `.env.example` L1–57).
   3. `docker compose up -d`; poll both healthchecks (`docker compose ps`) up to ~60 s
      (docker-compose.yml L18–23, L34–39).
   4. `uv sync` in `contracts/` then `api/` (contracts/README L33; api/README L38).
   5. Wallet: if `uv run mox wallet list` (in `contracts/`) lacks `anvil`, run interactive
      `uv run mox wallet import anvil`, telling the user to paste the Anvil account #0 key from
      `docker-compose.yml` L8–10 (contracts/README L44–48; required by moccasin.toml L25).
   6. `uv run mox compile` in `contracts/` (sanity; **never** `mox install` — contracts/README L60–64).
   7. `uv run mox run deploy --network anvil` in `contracts/` → writes MockUSDC-only
      `contracts/deployments/31337.json`; the printed `NotImplementedError` note is expected
      (deploy.py L66–81, L87–89, L101–103).
   8. `uv run python -m openad.db.bootstrap` in `api/` (bootstrap.py L19–32).
   9. `npm install` at repo root (workspaces: package.json L5–8).
   10. Verify: `npm run sync:deployments -w web` succeeds (web/scripts/sync-deployments.mjs).
   11. Print honest summary (D6) + next step (`npm run stack:up`).
   Implementation notes: `Invoke-Step <name> <scriptblock>` helper checking `$LASTEXITCODE`;
   `Push-Location`/`Pop-Location` per package; optional `-SkipDocker`, `-SkipWallet` switches.
2. **Create `scripts/dev-up.ps1`** (new). Process model = **new terminals** (D7):
   - Preflight: `.env` exists; anvil + postgres healthy; `contracts/deployments/31337.json`
     exists (else: "run `npm run stack:setup` first" — indexer hard-fails without it,
     deployments.py L44–52). Report port conflicts on 8000/5173/8545/5432 without killing anything.
   - Start: `Start-Process powershell -ArgumentList '-NoExit','-Command',…` once per process,
     each window titled via `$host.UI.RawUI.WindowTitle` (e.g. `openad-api`, `openad-indexer`,
     `openad-web`) running: `uv run uvicorn openad.main:app --reload` (api/),
     `uv run python -m openad.indexer` (api/), `npm run dev:web` (root; auto-syncs deployments,
     web/package.json L8). `-Embed` switch adds a fourth window with `npm run dev:embed`.
   - Print URLs: `http://localhost:8000/v1/health`, `http://localhost:5173`, embed demo page;
     print the stop story ("close each `openad-*` window or Ctrl+C inside it;
     `npm run stack:down` stops docker only"); note the indexer idles until Phase 1 (D6).
3. **Create `scripts/dev-down.ps1`** (new). **Docker only** (D7) — never kills app processes:
   - `docker compose down` (keeps `pgdata` volume; docker-compose.yml L40–42).
   - `-Reset` switch: `docker compose down -v`, delete `contracts/deployments/31337.json` and
     `api/.cache/` (both git-ignored) so the next setup starts clean.
   - Print a reminder: app processes stop by closing their `openad-*` windows / Ctrl+C;
     this script intentionally does not kill them.
4. **Edit `package.json` L8–17**: add
   `"stack:setup": "powershell -ExecutionPolicy Bypass -File scripts/setup.ps1"`,
   `"stack:up": "powershell -ExecutionPolicy Bypass -File scripts/dev-up.ps1"`,
   `"stack:down": "powershell -ExecutionPolicy Bypass -File scripts/dev-down.ps1"`.
   Touch nothing else.

### B. Docs alignment (same change)

5. **`README.md` L40–62**: replace the 6-step quickstart with the three `npm run stack:*`
   commands; keep the prerequisites line (L41); add one honest sentence (MockUSDC-only deploy;
   protocol contracts land in Phase 1); point to `docs/ARCHITECTURE.md` §7 for the manual equivalent.
6. **`AGENTS.md` commands block (L52–76)**: add a `# local stack` entry at the top listing the
   three wrappers; leave per-package commands untouched (L67 bootstrap line is already correct).
7. **`docs/ARCHITECTURE.md` §7 local loop (L339–348)**: lead with the scripts as canonical;
   keep the manual commands as "what the scripts run"; **fix L343** — command becomes
   `uv run python -m openad.db.bootstrap` with the alembic note demoted to "(after ROADMAP 2.2:
   `uv run alembic upgrade head`)", mirroring AGENTS.md L67.
8. **`docs/ROADMAP.md` Phase 0 (after 0.4, L22–23)**: add
   `- [x] **0.5 Local run scripts.** … _Done 2026-09-08._` with a one-line scope note.
9. **Create `docs/adr/0007-local-run-scripts.md`** from `docs/adr/0000-template.md`: record
   D1–D8 — including the new-terminals process model (D7) and PowerShell-only scope with bash
   deferred until CI or a mac/linux contributor exists (D8) — with rejected alternatives.
   Status: Accepted.
10. **Format:** run `npm run format` then `npm run format:check` (package.json L16–17) so edited
    markdown/JSON stays prettier-clean.

### C. Verify + commit

11. Smoke test on this machine: `npm run stack:setup` twice (idempotent), `npm run stack:up`,
    `curl http://localhost:8000/v1/health` → 200, `npm run stack:down`. If Docker Desktop is not
    running in the execution environment, verify scripts statically (parse with
    `powershell -NoProfile -Command "[scriptblock]::Create((Get-Content -Raw …))"`) and note the
    runtime gap in the summary instead of forcing it.
12. Commit everything as `feat(scripts): add local run scripts for the dev stack`
    (Conventional Commits; docs + ROADMAP in the same commit per repo rules).

## 4. Acceptance criteria

- [ ] Fresh checkout → `npm run stack:setup` succeeds on Windows PowerShell 5.1; second run is a
      clean no-op (`.env` not overwritten, wallet not re-imported, no errors).
- [ ] After setup: `contracts/deployments/31337.json` exists (USDC only), DB tables created,
      `node_modules` installed, `web/src/generated/deployments/` populated.
- [ ] `npm run stack:up` starts api (`/v1/health` → 200), indexer (logs `indexer.nothing_to_index`,
      keeps polling), web on :5173; embed optional via `-Embed`.
- [ ] `npm run stack:down` stops the docker services only; the app-process stop story (close the
      titled `openad-*` windows / Ctrl+C) is printed by both scripts and documented in the README.
- [ ] No doc or script tells the user to run `alembic upgrade head` as the current local step,
      and nothing runs `mox install`.
- [ ] README, AGENTS.md, and ARCHITECTURE §7 all point at the scripts; ROADMAP 0.5 is `[x]`;
      ADR-0007 exists.
- [ ] `npm run format:check` passes; no filenames ending in whitespace; `.env` and `31337.json`
      remain untracked; no secrets in any script.
- [ ] Scripts state plainly that the stack is partial (MockUSDC-only deploy; indexer idle until
      ROADMAP 1.1–1.4).

## 5. Risks / notes

- `mox wallet import` is interactive → setup pauses once on first run only; documented in output.
- Docker Desktop must be running; setup checks first and fails with a clear message.
- Port conflicts are reported, never auto-killed.
- Approved shape (D7/D8) adds **zero new dependencies** — pure PowerShell + existing npm.
