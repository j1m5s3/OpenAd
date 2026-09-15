# ADR-0010: Playwright E2E with mock wallets and scenario YAML

- **Status:** Accepted
- **Date:** 2026-09-11
- **Scope:** repo, web, e2e

## Context

Prod-readiness needs browser coverage of publisher (space provider) and advertiser
journeys. Real MetaMask in CI is flaky. Anvil keys must never be committed as interactive
secrets; they are public Foundry demo keys and may appear only in test fixtures.

## Decision

1. Add an `e2e/` npm workspace: Playwright against the local stack (Anvil, API, web).
2. Inject an **in-page mock EIP-1193 provider** (Anvil account #1 = publisher, #2 =
   advertiser) so tests never drive a wallet extension.
3. Scenarios live as YAML under `e2e/scenarios/`. Specs consume them. Subagents (or
   Playwright MCP later) generate new YAML; they do not invent a second test runner.
4. Personas: publisher (Supply) and advertiser (Campaigns), plus cross-cutting serve/embed
   cases. Loop: generate → run → fix → generate edges until two consecutive green
   generation passes add no failing cases.

## Alternatives considered

- **Synpress / real MetaMask** — closer to production connect, too brittle for CI.
- **wagmi mock connector only** — insufficient to test RainbowKit modal copy; we still
  mock `window.ethereum` so RainbowKit sees an injected wallet.

## Consequences

- Root `package.json` workspaces include `e2e`.
- CI runs Playwright after api/web unit tests, with Anvil + Postgres from compose.

## References

- `docker-compose.yml` Anvil accounts. ROADMAP Phase 3 acceptance.
