# Engineering Conventions

These rules apply to every contributor, human or AI. They are mirrored, abbreviated, in
`.cursor/rules/*.mdc` so they load automatically in Cursor. If you change a rule here, update
the matching `.mdc` file.

---

## 1. Universal rules

1. **Docs first.** Behaviour is specified in `docs/` before it is implemented. If the spec is
   wrong, fix the spec in the same PR. Never let code and docs disagree.
2. **Vocabulary.** Use `GLOSSARY.md` terms exactly, in identifiers and copy.
3. **Small, complete changes.** A PR does one thing, includes tests, and updates docs. No
   drive-by refactors; suggest them in the PR description instead.
4. **No secrets in the repo.** `.env` files are ignored; `.env.example` documents every variable.
   Deploy keys live in Moccasin encrypted wallets, never in env vars or code.
5. **No custodial paths.** Nothing in `api` or `web` signs chain transactions for users or holds
   keys that can move funds or write leases. If a feature seems to need that, stop and write an ADR.
   The opt-in `sim/` daemon may hold public Foundry Anvil keys for chain 31337 only (ADR-0012).
   The CPC settler process (ADR-0014) may hold `OPENAD_SETTLER_KEY` and may only
   `settle_batch`; it is not the HTTP API.
6. **Serving never touches the chain.** `api/src/openad/serve/` must not import `openad.chain`.
7. **Money is integers.** USDC base units as `uint256` / Python `int` / TS `bigint` until the
   formatting layer. Never floats.
8. **Time is Unix seconds** on-chain and in the API; ISO-8601 strings only at the HTTP boundary.
9. **Idempotent indexer handlers.** Every handler is an upsert keyed by on-chain identifiers.
10. **Ask via ADR, not via code.** A non-obvious decision (new dependency, new service, changed
    invariant) gets a file in `docs/adr/` before or with the code.

## 2. Repository layout rules

- Package roots are fixed: `contracts/`, `api/`, `web/`, `embed/`, `e2e/`, `sim/`, `workers/`, `docs/`. Do not add
  top-level packages without an ADR.
- Generated artefacts are git-ignored (`contracts/out`, `contracts/deployments/31337.json`,
  `web/src/generated`, `dist`, `.venv`, `node_modules`).
- Each package has a `README.md` with: purpose, how to run, how to test, and links to the docs.

## 3. Vyper (`contracts/`)

- `# pragma version ~=0.4.0` at the top of every `.vy`/`.vyi`. One contract per file, file
  named after the contract (`AdSlot.vy`).
- Compose with snekmate modules (`initializes:` / `exports:`); no copy-pasted library code.
- **Interfaces are canonical.** Implementations `implements:` their `.vyi`. Changing a signature
  means changing the `.vyi`, `PROTOCOL.md`, the ABI consumers, and tests, in one commit.
- Naming: ERC-standard functions keep standard camelCase (`ownerOf`, `userOf`); OpenAd functions,
  variables, and events' parameters are `snake_case`; events and structs are `PascalCase`;
  constants are `UPPER_SNAKE`.
- Every state change emits exactly one event listed in `PROTOCOL.md` § 6.
- Access checks first, then input validation, then effects, then external calls
  (checks-effects-interactions). `@nonreentrant` on any function that transfers tokens.
- Revert strings: short, lowercase, exactly as listed in `PROTOCOL.md`; tests assert on them.
- External token calls use `extcall` with `default_return_value=True` for ERC-20 compatibility.
- No `selfdestruct`, no `raw_call` except the documented non-reverting `permit` pattern, no
  proxies in v1, no `payable` functions (USDC only).
- NatSpec docstrings (`@notice`, `@param`, `@return`, `@dev`) on every external function.
- Storage types: fixed-length `String[N]` with the exact `N` from `PROTOCOL.md` § 3; `uint64` for
  timestamps; `uint16` for pixels and basis points.
- Tests (titanoboa, pytest): one file per contract (`test_ad_slot.py`…), plus
  `test_invariants.py` with hypothesis property tests covering `PROTOCOL.md` § 8. Use
  `boa.env.time_travel` for time; never sleep. Fork tests are marked `@pytest.mark.fork`.
- Deploy scripts are idempotent per network and always regenerate the deployments artifact.

## 4. Python (`api/`)

- Python 3.12, `uv` for everything (`uv sync`, `uv run …`). No `pip`, no `requirements.txt`.
- `ruff` (format + lint, config in `pyproject.toml`) and `mypy --strict` must pass. No `# type: ignore`
  without a reason comment.
- Layering: `routers/` (HTTP only) → `services/` (logic) → `models/` (persistence). Routers never
  touch sessions directly beyond passing them to services; services never import FastAPI.
- Pydantic v2 for all request/response schemas (`schemas/`); never return ORM objects.
- SQLAlchemy 2.0 typed declarative models (`Mapped[...]`, `mapped_column`). Async sessions.
  Alembic migration for every model change; migration files are reviewed, not auto-trusted.
- Migrations are frozen DDL: a revision never imports `openad.models` or `Base` and never calls
  `create_all`/`drop_all`; write explicit `op.create_table`/`op.add_column` calls (custom types as
  their `impl`, e.g. `Uint256` → `String(78)`). `tests/test_migrations.py` is the guard: a fresh
  database must `upgrade head`, head must match `Base.metadata` (`compare_metadata`), and
  `downgrade base` → `upgrade head` must round-trip. `openad.db.bootstrap` stays a test/dev helper.
- Config only via `openad.config.Settings` (pydantic-settings, prefix `OPENAD_`).
- Logging via `structlog` (`openad.logging.get_logger`). No `print`.
- Errors: raise domain exceptions in services; translate to HTTP in one exception handler
  (`main.py`). No bare `except`.
- Tests: `pytest` + `pytest-asyncio`, SQLite in-memory via `aiosqlite`. Every service function has
  a unit test; every router has at least one HTTP test using `httpx.AsyncClient`. Indexer handlers
  are tested with synthetic decoded events.
- Naming: modules and functions `snake_case`; classes `PascalCase`; constants `UPPER_SNAKE`.
  Table names plural `snake_case`; primary keys mirror on-chain identifiers.

## 5. TypeScript (`web/`, `embed/`, `sim/`)

- `strict: true`, `noUncheckedIndexedAccess: true`. ESLint (flat config, typescript-eslint) and
  Prettier must pass. No `any`; use `unknown` and narrow.
- Named exports only (no default exports) except where a framework requires one.
- **web**: function components; hooks for logic; feature folders under `src/features/<feature>/`
  with `components/`, `hooks/`, `api.ts` inside; shared UI in `src/components/`. Server state via
  TanStack Query (`queryKey` factories in the feature's `api.ts`). Chain writes via wagmi hooks
  only, with ABIs from `src/lib/deployments.ts`. Money as `bigint`; format in `src/lib/format.ts`.
  Tailwind tokens live in `src/styles/`. Do not use ad-hoc hex colours that a token could express.
  Nav labels: Discover, Supply, Campaigns; optional external Guide when `VITE_GUIDE_URL` is set
  (ADR-0015). In-app how-to copy lives in `src/lib/copy.ts`; shared `FieldHint` / `Wizard` in
  `src/components/`.
- **embed**: zero runtime dependencies; no framework; ES2020; shadow DOM; must pass
  `scripts/check-size.mjs` (≤ 5 KB gzipped). Only network target is `/v1/serve`. The serve JSON
  type in `embed/src/types.ts` must match `api/src/openad/schemas/serve.py`.
- Tests: Vitest. Embed tests run in jsdom. Browser journeys: Playwright in `e2e/` (ADR-0010).
  Headed industry/UX critique is not CI: `.cursor/skills/sandbox-sme-critique/` and
  `sandbox-ux-critique/` drive Playwright MCP, file `docs/qa/critique/` and
  `docs/qa/findings/`, and update `docs/qa/scorecard.md`. Dispositions:
  `implement-now` (in-protocol UI), `adr-then-implement` (both skills independently
  tag `required-for-professional-use`), `record-only`, `blocked-by-invariant`, `keep`.
  Regression-worthy `broken` rows promote to `e2e/scenarios/*.yaml`. Local MCP signing
  uses the ADR-0013 injector (`?devwallet=`), never keys in `web/`.

## 6. Git and PRs

- Conventional commits: `feat(contracts): …`, `fix(api): …`, `docs: …`, `chore(web): …`.
  Scope = package name.
- Branch names: `<type>/<short-description>`.
- A PR is complete when: tests pass in every touched package, docs updated per
  `docs/README.md` "Which document to update when", `ROADMAP.md` task status updated, and the
  PR description lists any out-of-scope observations rather than fixing them.
- Never commit `.env`, deployment keys, or `31337.json`.

## 7. Definition of done for a roadmap task

1. Acceptance criteria in `ROADMAP.md` are met and demonstrated by tests.
2. Docs updated; `.vyi` ↔ `PROTOCOL.md` ↔ ABI consumers consistent.
3. `uv run ruff check && uv run ruff format --check && uv run mypy` (api), `uv run mox test`
   (contracts), `npm run typecheck && npm run lint && npm run test && npm run build` (web/embed)
   all pass.
4. Task marked `[x]` in `ROADMAP.md` with a one-line note of anything deferred.

## 8. Things to actively avoid (learned from the prototype)

- Compiling contracts at request time or string-substituting Solidity/Vyper source.
- Deploying a contract per user, per slot, or per auction.
- Storing a single "platform wallet" private key that performs user actions.
- Reading the chain in the ad-serving path.
- Plaintext passwords, credentials in URLs, hard-coded JWT secrets.
- Directory or file names with trailing whitespace (the prototype lost its components folder this way).
