# Persona QA findings

Dated defect notes from critique sessions. Industry/UX critique files to
[`docs/qa/critique/`](../critique/README.md). Not legal evidence and not a
substitute for `e2e/`.

## Taxonomy

| Category | Meaning | What to do |
| --- | --- | --- |
| `broken` | A shipped control fails or contradicts a locked ADR | Fix same round; promote to Playwright YAML when regression-worthy |
| `unfinished` | Stub, silent fail-closed, or copy that looks finished but is not | Fix if code-only; else record |
| `missing` | No surface for a job a seat reasonably attempts | Backlog note unless disposition is `implement-now` on the critique side |
| `gated` | Counsel, provider, mainnet, or live-money evidence | Record only |

## File name

`docs/qa/findings/YYYY-MM-DD-<sme|ux>-round-N.md`

## Session header

```markdown
# Findings — YYYY-MM-DD — <sme|ux> round N

- stack: local web :5173 / API :8000 after one dev-up + sim-up
- journeys: docs/qa/journeys/advertiser-arc.md
- seats: adv-6
```

## Finding template

```markdown
### F-001 Short title

- date: YYYY-MM-DD
- skill: sandbox-ux-critique
- seat(s): adv-6
- journey: docs/qa/journeys/advertiser-arc.md
- route: /slots/1
- surface: Period table Buy button
- category: broken
- severity: high
- expected: Buy is disabled when the period is not sellable.
- actual: Buy stays enabled; the dialog then says not sellable.
- repro: 1. Open a leased or upcoming period. 2. Click Buy.
- evidence: (screenshot or console; no keys)
- promotion: e2e scenario | record-only
```

Do not copy Anvil keys into findings. Do not auto-open GitHub issues.
