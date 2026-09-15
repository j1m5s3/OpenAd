# OpenAd documentation

This folder is the source of truth for **what** OpenAd is and **how** it is built. Code that
disagrees with these documents is a bug in one or the other; fix the disagreement, never
let it stand.

## Reading order (for a new engineer or AI agent)

1. [`GLOSSARY.md`](GLOSSARY.md) — the vocabulary. Read first; every other document assumes it.
2. [`PROTOCOL.md`](PROTOCOL.md) — the on-chain protocol: entities, functions, events, pricing
   math, access control, invariants. Function _signatures_ are canonical in
   `contracts/src/interfaces/*.vyi`; _semantics_ are canonical here.
3. [`ARCHITECTURE.md`](ARCHITECTURE.md) — the whole system: packages, data flow, the
   write path vs. read path, the serving edge, environments, the deployments artifact.
4. [`CONVENTIONS.md`](CONVENTIONS.md) — coding standards per language/package, testing rules,
   git/PR rules, documentation maintenance rules.
5. [`ROADMAP.md`](ROADMAP.md) — phased plan with acceptance criteria and pointers. Pick up work here.
6. [`adr/`](adr/) — Architecture Decision Records. Why things are the way they are. Add one
   whenever you make a non-obvious decision.

## Which document to update when

| You changed…                                      | Update…                                                 |
| ------------------------------------------------- | ------------------------------------------------------- |
| A contract function, event, struct, or invariant  | `PROTOCOL.md` **and** the matching `.vyi` interface     |
| A service, data flow, table, endpoint, or env var | `ARCHITECTURE.md` (and the package README)              |
| A coding rule, tool, or testing requirement       | `CONVENTIONS.md` and the matching `.cursor/rules/*.mdc` |
| A term or its meaning                             | `GLOSSARY.md`                                           |
| Task status, scope, or acceptance criteria        | `ROADMAP.md`                                            |
| A decision with alternatives you rejected         | New file in `adr/` (copy `adr/0000-template.md`)        |
| Headed SME/UX critique of the local web app       | `docs/qa/` plus the matching `.cursor/skills/sandbox-*-critique/` |
| User-facing product guide (publisher/advertiser how-tos) | `docs/guide/` (GitBook Git Sync; not protocol spec). Published: [open-ad-docs](https://pam-2.gitbook.io/open-ad-docs/). Site map: `gitbook-docs.yaml`; space config: `docs/guide/.gitbook.yaml`. |

## Status legend used in these docs

- **Implemented** — code exists and is tested.
- **Specified** — designed here, not yet implemented. Implement exactly as specified or
  update the spec first.
- **Deferred (vX.Y)** — intentionally out of scope until the named version.

## Historical context

OpenAd is a redesign of a 2022–2023 prototype (Flask + Solidity on Goerli). That prototype
is **reference only**; do not port its code. Its lessons are captured in
[`adr/0001-lessons-from-the-prototype.md`](adr/0001-lessons-from-the-prototype.md).
