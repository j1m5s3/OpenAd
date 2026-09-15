# Industry and UX critique

Dated session notes from `.cursor/skills/sandbox-sme-critique/` and
`.cursor/skills/sandbox-ux-critique/`. Not a defect log (see
[`findings/`](../findings/README.md)), not legal evidence, not production-readiness.

## File name

`docs/qa/critique/YYYY-MM-DD-<sme|ux>-round-N.md`

## Session header

```markdown
# Critique — YYYY-MM-DD — <sme|ux> round N

- stack: local web :5173 / API :8000 / embed :5174 after one dev-up -Embed + sim-up
- journeys: docs/qa/journeys/publisher-arc.md, advertiser-arc.md, ux-walkthrough.md
- seats: pub-3, adv-6
- skill: sandbox-sme-critique | sandbox-ux-critique
```

## Taxonomy

| Category | Meaning |
| --- | --- |
| `friction` | The path works, but it is clumsy versus the named industry or UX norm |
| `gap` | A table-stakes capability a publisher or advertiser would expect is absent |
| `blind-spot` | Settlement, audit, brand-safety, or reporting visibility is missing |
| `sandbox-acceptable` | Divergence is fine for this local Anvil envelope |
| `praise` | Keep this; it matches or beats the norm for the envelope |

## Expectation

| Value | Meaning |
| --- | --- |
| `table-stakes` | Most incumbents expose this before a buy or a go-live |
| `differentiator` | Nice-to-have vs GAM / Meta / TTD / Rainbow |
| `minor` | Copy, density, or polish |

## Critique template

`benchmark` and `disposition` are **mandatory**.

```markdown
### C-001 Short title

- date: YYYY-MM-DD
- skill: sandbox-sme-critique
- seat(s): adv-6
- journey: docs/qa/journeys/advertiser-arc.md
- route: /slots/1
- surface: Buy dialog
- category: friction
- expectation: table-stakes
- observation: (what the expert saw; no keys)
- benchmark: Google Ads / creative picker — select an approved creative, not a raw id
- evidence: (screenshot or console note; no .env)
- required-for-professional-use: no
- disposition: implement-now
```

### Disposition

| Value | Meaning |
| --- | --- |
| `implement-now` | In-protocol UI/UX/copy; ship in the same round |
| `adr-then-implement` | Only if **both** skills independently set `required-for-professional-use: yes` on the same item |
| `record-only` | Differentiator, minor polish, or ROADMAP out-of-scope without dual tag |
| `blocked-by-invariant` | Conflicts with the identity fence; record with rationale; do not code |
| `keep` | Use with `praise`. Do not “fix” it |

Identity fence (non-custodial, slots leased not sold, one-tx Dutch, Marketplace empty,
serve never reads chain / never proxies advertiser URLs, integer USDC, glossary) cannot
be overridden by dual-persona tags.

ROADMAP out-of-scope (English auctions, on-chain impressions, HTML/JS creatives,
custodial onboarding, multi-currency, sublease) stays `record-only` unless both
skills independently tag the identical item `required-for-professional-use`.

Do not copy Anvil keys into critique files. Do not auto-open GitHub issues. Do not
claim mainnet, production ads, or live USDC.
