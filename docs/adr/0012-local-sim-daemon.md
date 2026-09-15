# ADR-0012: Opt-in local sim daemon (Anvil personas)

- **Status:** Accepted
- **Date:** 2026-09-12
- **Scope:** repo, sim

## Context

Local `dev-up` leaves Discover sparse: deploy seeds two slots and one purchase whose
creative hash never matches real bytes. We want a continuously running set of **space
providers** (publishers) and **ad providers** (advertisers) that perform the same on-chain
and off-chain operations a person would, so the app looks live. The default stack must
not start this. `api/` and `web/` must not hold keys.

## Decision

1. **Package.** New top-level `sim/` (`@openad/sim`). TypeScript + viem. Nothing depends on
   `sim`. The sim holds public Foundry Anvil keys for chain **31337 only** and exits if the
   RPC chain id differs.
2. **Opt-in process.** `.\scripts\sim-up.cmd` opens a titled `openad-sim` window. `dev-up`
   never starts it. `sim-down` documents close-the-window (ADR-0007); it does not kill
   processes.
3. **Accounts.** Anvil `--accounts 10` unchanged. `#0` funds USDC only. `#1`/`#2` reserved
   for e2e. Sim personas: publishers `#3–#5`, advertisers `#6–#9`.
4. **Hybrid.** The daemon signs real protocol txs (mint, calendar, terms, pause, register,
   approve, buy / buy_with_permit) and SIWE for house ads. Playwright stays in `e2e/`.
5. **Loop.** One weighted-random action per tick (~20 s, jitter, cooldowns). Skip buys when
   ≥ 70% of open periods are leased. Cap sim-owned slots at 12.
6. **Media.** Deterministic PNGs served on `127.0.0.1:8610` so the host-run API verifier
   can fetch `http://` URLs in `OPENAD_ENV=dev`.
7. **MCP.** Separate stdio process (`npm run mcp -w sim`) adapters four tools onto the
   daemon's localhost control API. Cursor is not required for the daemon to run.

## Alternatives considered

- **Playwright-driven sim** — e2e mock wallet cannot sign (`personal_sign` throws). Rejected.
- **Python inside `api/`** — would put a key-holding process in the non-custodial package. Rejected.
- **MCP owns the engine** — sim would die with Cursor. Rejected.
- **Public placeholder image URLs** — network flakiness. Rejected in favor of hermetic PNGs.
- **`anvil_impersonateAccount`** — extra moving parts vs the public `#0` key already used by setup.

## Consequences

- ROADMAP 4.7. New `OPENAD_SIM_*` vars (commented in `.env.example`).
- Domain verification and NFT creatives are not simulated.
- Deploy seed `DEMO_HASH` still does not match real bytes; the sim is what makes serve
  return `status: "lease"` for verified media.

## References

- ADR-0007 (local scripts), ADR-0009 (SIWE), ADR-0010 (e2e wallets).
- `docs/ARCHITECTURE.md` §1 / §7. `docs/PROTOCOL.md` §5.2 buy checks.
