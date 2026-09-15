# ADR-0015: User guide and in-app guidance

- **Status:** Accepted
- **Date:** 2026-09-14
- **Scope:** web | repo

## Context

Publisher Supply, advertiser Campaigns, and the buy/open-campaign dialogs were
flat protocol forms. UX critique called them a protocol surface, not a campaign
or slot setup. There was no field-level help, no shared tooltip primitive, and
no publisher/advertiser how-to separate from `PROTOCOL.md`.

The product needs a hosted GitBook-style **user guide** plus in-app tips and
multi-stage setup that explains each step and what happens next — without
changing contracts, combining on-chain calls, or making CI depend on a live
book.

## Decision

1. **Guide source of truth is the repo.** Long-form pages live in `docs/guide/`
   and publish to hosted GitBook via Git Sync (`.gitbook.yaml`). `PROTOCOL.md`
   remains the on-chain spec; the guide uses `GLOSSARY.md` terms and never dumps
   revert strings, signatures, or storage layouts. Connecting the GitBook space
   is an operator step; CI does not fetch GitBook.

2. **In-app copy is a typed TypeScript registry** (`web/src/lib/copy.ts`):
   `FIELD_HINTS`, `WIZARD_COPY`, `GUIDE_PATHS`, `guideUrl()`. Tips work with no
   network and with `VITE_GUIDE_URL` unset. GitBook is the long-form expansion
   of the same facts.

3. **`VITE_GUIDE_URL` is optional.** When unset, the Layout Guide link and every
   “Learn more” link are omitted; hints still render. Documented in
   `.env.example` and `ARCHITECTURE.md` §5.

4. **Two shared primitives, no new runtime dependencies.** `FieldHint` (click
   toggle, not hover; Escape / outside click; optional Learn more) and `Wizard`
   (presentational stepper: title, meaning, “What happens next”). Features own
   wagmi handlers. Each wizard stage still submits its own transaction
   (`mint` → `set_calendar` → `set_terms` stay three calls).

5. **Hybrid containers.** In-page steppers on Supply and Campaigns; stepped
   existing modals for Open campaign and Buy. Secondary forms (pause, allowlist,
   house ad, domain, pricing, top-up) stay flat and may take `FieldHint`s.

6. **CPC copy never calls occupancy an auction** (ADR-0014).

## Alternatives considered

- **GitBook-native editing only** — fastest for non-dev editors; copy drifts
  from code and is not CI-checkable. Rejected as source of truth.
- **Docusaurus / Mintlify instead of GitBook** — versioned with code, but a
  second docs-site build. Rejected while GitBook is the chosen reader surface.
- **Tooltip library (Floating UI, Radix)** — extra dependency for ~100 LOC.
  Rejected (CONVENTIONS §1.10).
- **Dedicated `/setup` routes** — deep-linkable, duplicates dashboard entry
  points. Rejected.
- **Markdown fragments for in-app tips** — no type safety. Rejected.
- **Hover-only tooltips** — fail on mobile. Rejected.

## Consequences

- Editors change `docs/guide/` in PRs; operators paste the GitBook space URL
  into `VITE_GUIDE_URL` when the space exists.
- e2e YAML and smoke scripts click wizard stages; headings `Mint slot`,
  `Calendar`, `Terms`, `Register media`, `Request approval` stay visible.
- Non-custodial invariant unchanged: web never holds spending keys.

## References

- `docs/GLOSSARY.md`, `docs/PROTOCOL.md` (LEASE Dutch §4; CPC §11), ADR-0014
- `docs/qa/journeys/publisher-arc.md`, `advertiser-arc.md`
- `docs/qa/critique/2026-09-12-ux-round-1.md` (flat forms)
- `web/src/lib/copy.ts`, `web/src/components/FieldHint.tsx`, `Wizard.tsx`
