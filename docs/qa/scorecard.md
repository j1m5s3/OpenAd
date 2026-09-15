# Dual-persona scorecard

Living status for ROADMAP 4.8. Phase values: `pass` / `sandbox-acceptable` /
`blocked-by-invariant` / `open`.

Satisfied when every phase is in {pass, sandbox-acceptable, blocked-by-invariant}
**and** open table-stakes with disposition `implement-now` or `adr-then-implement`
is zero.

## Smoke (ADR-0013)

- stack: API :8001 this round (host :8000 was already bound), web :5173, embed
  :5174/demo/, Anvil :8545, sim :8610 paused after persona funding
- `?devwallet=pub-3` SIWE: **pass** (verify 200, rail 0x90F7…)
- `?devwallet=adv-6` buy_with_permit: **pass** (slot 6 period 0 leased to adv-6)
- CPC: Discover filter + slot 3 Buy hidden; Open campaign dialog; serve slot 3
  `status: empty` with no campaigns
- notes: Playwright MCP namespace was **not** connected; Edge scripts
  `e2e/scripts/smoke-devwallet.mjs` and `critique-pass.mjs` plus cursor-ide-browser
  were the headed fallback. Wear `#3–#9` only. Anvil `safe` tag is ignored on 31337.

## Business SME (`sandbox-sme-critique`)

| Round | P0 | P1 | P2 | P3 | P4 | P5 | P6 | P7 | Open table-stakes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | open | open | open | open | open | open | open | open | connect, fees, picker, live inventory |
| 2 | pass | pass | pass | pass | sandbox-acceptable | sandbox-acceptable | pass | blocked-by-invariant | none |
| 3 | pass | pass | pass | pass | sandbox-acceptable | sandbox-acceptable | pass | blocked-by-invariant | none |

P0 setup / injector · P1 Discover (LEASE + CPC) · P2 mint · P3 calendar/terms
(sale mode + floor CPC) · P4 approvals inbox · P5 house/domain forms · P6 earnings
(LEASE instant USDC; CPC settler-timed, sandbox) · P7 brand safety (raster only).

## UX SME (`sandbox-ux-critique`)

| Round | P0 | P1 | P2 | P3 | P4 | P5 | P6 | P7 | Open table-stakes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | open | open | open | open | open | open | open | open | auto-connect, Unix enums, rail, buy copy |
| 2 | pass | pass | pass | pass | pass | pass | sandbox-acceptable | pass | none |
| 3 | pass | pass | pass | pass | pass | pass | sandbox-acceptable | sandbox-acceptable | none |

P0 setup · P1 IA (CPC vs lease) · P2 empty/error/SIWE · P3 forms/time · P4 buy +
Open campaign dialogs · P5 mobile search + rail · P6 a11y (dialog semantics; not a
full audit) · P7 embed demo at `/demo/` (house fallback when serve URL misses).

No dual-persona `required-for-professional-use` protocol ADR. Identity fence intact.
Round-3 `implement-now` items (Anvil ghost creatives; CPC slot CTA) shipped in the
same session.
