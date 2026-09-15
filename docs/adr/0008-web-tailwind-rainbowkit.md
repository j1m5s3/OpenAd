# ADR-0008: Vite + Tailwind + RainbowKit for the web app

- **Status:** Accepted
- **Date:** 2026-09-11
- **Scope:** web, repo

## Context

ADR-0005 chose Vite + React 19 + MUI and rejected Next.js (SSR is not useful for a
wallet app) and Tailwind/shadcn (MUI was requested for speed). The product now needs a
Discover-style marketplace whose visual language matches a dark, card-based Web3
discovery app (sticky glass nav, filter chips, image cards, top-right wallet connect)
without becoming a quest/XP clone. MUI's light, dense-admin look cannot carry that
without fighting the library. Next.js is still unnecessary.

## Decision

1. Keep the **Vite SPA** (no SSR). Continue to reject Next.js for the reasons in ADR-0005.
2. Replace MUI with **Tailwind CSS** and a small OpenAd design system (near-black canvas,
   elevated surfaces, lime accent, `rounded-2xl` cards, Geist or equivalent). No `sx`.
3. Add **RainbowKit** (dark theme) on top of wagmi + viem for wallet connection: injected,
   Coinbase Wallet, and WalletConnect (project id from `VITE_WALLETCONNECT_PROJECT_ID`).
4. Information architecture uses OpenAd vocabulary: Discover (slots), Supply (publisher),
   Campaigns (advertiser). No quests, XP, CUBEs, or streaks.
5. This ADR supersedes the **web app** row of ADR-0005 only. Contracts, API, embed, and
   package-manager choices are unchanged.

## Alternatives considered

- **Next.js App Router + Tailwind** — closest public stack to the reference app, but SSR
  duplicates the FastAPI server and complicates wagmi. Rejected.
- **Keep MUI, dark theme only** — fastest, weakest visual match. Rejected.
- **shadcn/ui** — acceptable later; not required to ship the design system.

## Consequences

- `web/` drops `@mui/material` / `@emotion/*`. Feature folders stay.
- `.cursor/rules/web-react.mdc` and `CONVENTIONS.md` §5 follow Tailwind tokens, not MUI.
- RainbowKit CSS is imported once in the app shell.

## References

- ADR-0005 (partially superseded).
- `docs/ARCHITECTURE.md` §5.
