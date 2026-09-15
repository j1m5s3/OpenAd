# Critique journeys

Session protocol for `.cursor/skills/sandbox-sme-critique/` and
`.cursor/skills/sandbox-ux-critique/`. Scripted YAML in `e2e/` stays CI
regression.

## Stack (once)

1. Confirm Playwright MCP (`GetDynamicTools` pattern `playwright`). If missing,
   stop headed MCP; tell the operator to enable the server in `.cursor/mcp.json`.
2. `.\scripts\dev-up.cmd -Embed` then `.\scripts\sim-up.cmd`. Rule:
   `.cursor/rules/browser-mcp-dev-stack.mdc`.
3. Confirm API 8000, web 5173, embed 5174, Anvil 8545, Postgres 15432, sim 8610.
4. `sim_pause_loop` paused true before interactive wallet steps. Resume when the
   session ends.
5. Never restart mid-session.

Base URL: `http://localhost:5173`. Embed demo: `http://localhost:5174`.

## Persona matrix (wear, do not add)

| Id | Anvil | Seat | Use |
| --- | --- | --- | --- |
| `pub-3` `pub-4` `pub-5` | #3–#5 | publisher | Supply, approvals, house ad |
| `adv-6` `adv-7` `adv-8` `adv-9` | #6–#9 | advertiser | Campaigns, Discover, buy |
| `e2e-publisher` `e2e-advertiser` | #1/#2 | e2e only | **Do not wear** in critique |
| funder #0 | #0 | sim funding | **Do not wear** |

Injector (ADR-0013): `http://localhost:5173/<path>?devwallet=pub-3`. Connect the
injected wallet. SIWE auto-fires (`features/auth/useSiwe`). Switch seat:
RainbowKit disconnect, navigate with a new `devwallet` id, reconnect.

## Seats vs experts

`publisher-arc.md` and `advertiser-arc.md` are **seats** both experts wear.
`ux-walkthrough.md` is extra coverage for the UX skill (viewport, a11y, empty
and error, transaction states).

## File naming

- Critique: `docs/qa/critique/YYYY-MM-DD-<sme|ux>-round-N.md`
- Findings: `docs/qa/findings/YYYY-MM-DD-<sme|ux>-round-N.md`
