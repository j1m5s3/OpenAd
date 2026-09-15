# JIT_PLAN — Dual-persona SME and UX critique loop (archived)

Approved: `.cursor/plans/sme_ux_critique_loop_cc584949.plan.md` (not edited).
Done 2026-09-12. ROADMAP 4.8.

## Decisions

- ADR-0013: DEV-only keyless Anvil EIP-1193 forwarder (`?devwallet=`), addresses only.
- Two repo skills: `sandbox-sme-critique` (AdTech + crypto business) and
  `sandbox-ux-critique` (ads + crypto UI). Lenses, not logins; wear sim `#3–#9`.
- Identity fence; dual-persona `required-for-professional-use` before a protocol ADR.
- Playwright MCP in `.cursor/mcp.json`. This session’s fallback: Edge scripts
  `e2e/scripts/smoke-devwallet.mjs` and `e2e/scripts/critique-pass.mjs`.

## Outcome

- Smoke: pub-3 SIWE 200; adv-6 `buy_with_permit` leased slot 9 period 0.
- Scorecard round 2: both personas satisfied (pass / sandbox-acceptable /
  blocked-by-invariant); zero open table-stakes implement-now / adr-then-implement.
- No dual-tag protocol ADR. HTML/JS creatives stay blocked-by-invariant.
- Shipped with the loop: RainbowKit `injectedWallet` + delayed App import, EIP-6963
  announce, Buy CTA receipt `isPending` guard, indexer 31337 latest head, SlotMinted
  replay refresh, duration formatting, glossary-facing forms from round 1.

## Identity fence

Non-custodial api/web; slots leased not sold; one-tx Dutch; Marketplace empty after tx;
serve never reads chain / never proxies advertiser URLs; integer USDC; Unix seconds;
glossary copy.
