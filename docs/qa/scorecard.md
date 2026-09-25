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

| Round | P0   | P1   | P2   | P3   | P4                 | P5                 | P6   | P7                   | Open table-stakes                     |
| ----- | ---- | ---- | ---- | ---- | ------------------ | ------------------ | ---- | -------------------- | ------------------------------------- |
| 1     | open | open | open | open | open               | open               | open | open                 | connect, fees, picker, live inventory |
| 2     | pass | pass | pass | pass | sandbox-acceptable | sandbox-acceptable | pass | blocked-by-invariant | none                                  |
| 3     | pass | pass | pass | pass | sandbox-acceptable | sandbox-acceptable | pass | blocked-by-invariant | none                                  |

P0 setup / injector · P1 Discover (LEASE + CPC) · P2 mint · P3 calendar/terms
(sale mode + floor CPC) · P4 approvals inbox · P5 house/domain forms · P6 earnings
(LEASE instant USDC; CPC settler-timed, sandbox) · P7 brand safety (raster only).

## UX SME (`sandbox-ux-critique`)

| Round | P0   | P1   | P2   | P3   | P4   | P5   | P6                 | P7                 | Open table-stakes                        |
| ----- | ---- | ---- | ---- | ---- | ---- | ---- | ------------------ | ------------------ | ---------------------------------------- |
| 1     | open | open | open | open | open | open | open               | open               | auto-connect, Unix enums, rail, buy copy |
| 2     | pass | pass | pass | pass | pass | pass | sandbox-acceptable | pass               | none                                     |
| 3     | pass | pass | pass | pass | pass | pass | sandbox-acceptable | sandbox-acceptable | none                                     |

P0 setup · P1 IA (CPC vs lease) · P2 empty/error/SIWE · P3 forms/time · P4 buy +
Open campaign dialogs · P5 mobile search + rail · P6 a11y (dialog semantics; not a
full audit) · P7 embed demo at `/demo/` (house fallback when serve URL misses).

No dual-persona `required-for-professional-use` protocol ADR. Identity fence intact.
Round-3 `implement-now` items (Anvil ghost creatives; CPC slot CTA) shipped in the
same session.

## Automated demo checks (2026-09-25)

Not a persona critique round — no headed SME/UX session was run for this entry. This records
what the demo-mode Playwright suite (`e2e/demo/*.spec.ts`) covers as of ROADMAP 6.2/6.3/6.7,
run with `npm run test:demo -w e2e`:

- 14 tests total, covering both personas (advertiser and publisher), LEASE and CPC flows,
  approvals, house ads, domain verification, analytics, and the guided tour.
- The network guard itself (`web/src/demo/networkGuard.ts`, ADR-0016) is covered by a unit suite
  (`web/src/demo/networkGuard.test.ts`): a same-origin fetch is let through, and a call to a real
  API/chain origin is blocked with `DemoNetworkError` — a rejected promise for `fetch`, a
  synchronous throw for `XMLHttpRequest.open`, `new WebSocket()`, `new EventSource()` and
  `navigator.sendBeacon()`.
- Separately, each demo spec file (`flows.spec.ts` and `growth.spec.ts`) defines its own
  `auto: true` `guard` fixture that fails the test if, by the time it finishes, the page made any
  off-origin request, opened a WebSocket, or logged a console error (including a
  `DemoNetworkError` message) or an uncaught page error. Only `flows.spec.ts`'s guard also fails
  on an HTTP response ≥400. Together these are the suite's own, end-to-end proof that demo mode
  never reached a real RPC or API, on top of the guard's unit coverage above.
- An exact-balance assertion in the test body of "advertiser: discover → slot → buy a Dutch
  period with permit → lease on dashboard" (`flows.spec.ts`, after calling its `buyFirstPeriod`
  helper): the wallet balance is polled and must equal the pre-buy balance minus the exact quoted
  price. The receipt itself, inside `buyFirstPeriod`, shows "Lease confirmed" with no re-quote to
  "Not sellable" while the dialog is still open (step 35's frozen `Snapshot`).
- The publisher's proceeds land exactly `price − fee`, read fresh after a persona switch, not a
  stale cached balance.
- Step 16's listing flow (Discover category filter, `ListingEditor`, `SlotCard`/`SlotPage`
  badges) is `growth.spec.ts`'s "publisher edits a slot listing…" test, one of the 14 above; it
  was also held at 60/60 runs under `--repeat-each=20` in that step's own review.

This section will be superseded by a real persona round if one is run later; until then it is
the only automated signal recorded here for the demo-mode UI.
