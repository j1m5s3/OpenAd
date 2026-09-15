---
name: sandbox-ux-critique
description: Drives the live local OpenAd web app via Playwright MCP as a veteran UI/UX designer in advertising ops tools and crypto wallets. Critiques information architecture, empty/error/tx states, calendar vs Unix, RainbowKit/SIWE/permit, mobile, and accessibility. Use when the user asks for a UI/UX persona, ads-ops UX teardown, or crypto-wallet UX critique of OpenAd.
disable-model-invocation: true
---

# Sandbox UX critique

Headed MCP loop against the **local** OpenAd web app. The agent is a **UI/UX
subject matter expert** — veteran of Google Ad Manager / Ads Manager operator
surfaces **and** Rainbow / Coinbase / Uniswap wallet flows. This is not CI YAML
in `e2e/` and not the business-ops lens in `sandbox-sme-critique`.

Do not claim production-readiness. Do not treat the session as WCAG certification.

## When to apply

User asks for a UI/UX expert, ads-ops design critique, crypto-wallet UX critique,
or accessibility / mobile pass of OpenAd. Do not apply for pytest, vitest, or
`npm run typecheck`. Industry-economics teardown without a UX lens uses
`.cursor/skills/sandbox-sme-critique/` instead.

## Prerequisites

1. Playwright MCP namespace (`GetDynamicTools` pattern `playwright`). If missing,
   **stop** headed MCP. Tell the user to enable `playwright` from `.cursor/mcp.json`.
2. Stack once, then status: `.cursor/rules/browser-mcp-dev-stack.mdc`.
3. Injector / seats: `docs/qa/journeys/README.md`.
4. Base URL: `http://localhost:5173`. Embed: `http://localhost:5174`.

## Session rules

- Restart **once** at the start. Never mid-session.
- Wear sim ids only (`pub-3`–`pub-5`, `adv-6`–`adv-9`) via `?devwallet=`.
- Pause sim before interactive buys.
- Check desktop (~1280) and mobile (375) for every seat.
- Do not put unbounded AI browsing in CI.
- Do not file GitHub issues automatically.

UX rubric: [benchmarks.md](benchmarks.md) (evaluation aid, not authorized scope).

## Routing

| What you observed | File to |
| --- | --- |
| Control fails, stub, or gated evidence | `docs/qa/findings/YYYY-MM-DD-ux-round-N.md` |
| Friction, gap, blind-spot, sandbox-acceptable, praise | `docs/qa/critique/YYYY-MM-DD-ux-round-N.md` |

`adr-then-implement` only when this skill **and** `sandbox-sme-critique`
independently tag the same item `required-for-professional-use`. Identity fence
items are `blocked-by-invariant`.

## Journey

Read `docs/qa/journeys/ux-walkthrough.md`, then wear
`docs/qa/journeys/publisher-arc.md` and `advertiser-arc.md`. Critique with UX
judgment (IA, copy, density, wallet states, a11y).

## Do not

- Copy Anvil private keys into chat, skills, or critique files.
- Restart between seats.
- Treat ROADMAP out-of-scope or `gated` rows as a build list unless dual-tagged.
- Drop the identity fence listed in `sandbox-sme-critique`.
- Invent a second design system; use existing Tailwind tokens in `web/src/styles/`.
