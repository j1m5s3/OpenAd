# Business docs

Working documents for market fit, go-to-market, and the pitch deck. These live outside the
GitBook guide (`docs/guide/`) and are not linked from it unless a specific slide or figure is
cited from product docs. Protocol and product behaviour are still specified in
`docs/PROTOCOL.md` / `docs/ARCHITECTURE.md`; these docs never redefine glossary terms.

- **`market-fit.md`** — verdict, beachhead ICP, jobs-to-be-done, adoption blockers mapped to
  ROADMAP Phase 6 tasks, earning model, risks, success metrics.
- **`gtm-marketing.md`** — positioning, messaging per persona, channels, 0–30/30–60/60–90 day
  launch plan, cold-start tactics, funnel metrics.
- **`pitch-deck.md`** — slide-by-slide source content (title, bullets, speaker notes) for a
  hosted pitch deck. The orchestrator builds the hosted deck (a slides Artifact) from this file;
  this file is the source of truth for its content, not the deck itself.
- **`competitive.md`** — category-based comparison (take rate, payout timing, custody, tracking,
  approval gate, pricing mechanism, spend transparency, fiat support, targeting, demand/fill)
  against public ad-network ranges, plus an honest "where OpenAd loses today" section.
- **`demo-script.md`** — 2/5/15-minute live-pitch talk tracks keyed to the hosted demo's real
  tour steps and personas, a Q&A crib, and a follow-up email template.
- **`launch-checklist.md`** — what's done, what only the user can do (GCP project, WIF secrets,
  a Base Sepolia deploy, an audit, legal, mainnet), and what's next.
- **`assets/`** — screenshots used in the top-level `README.md`, generated reproducibly by
  `e2e/demo/capture-screenshots.mjs` (`npm run capture:screenshots -w e2e`).

Live links (private until the owner shares them; if a link asks you to sign in or request
access, ask the OpenAd team for access):

- Demo: https://claude.ai/artifact/AzkEcWfmUT23GCo2qkWxE7
- Pitch deck: https://claude.ai/artifact/Day12XXUFNi7CJdNpa2MUH

All figures in these docs are approximate public ranges or clearly labelled illustrative
examples — never fabricated customer names, quotes, or traction.
