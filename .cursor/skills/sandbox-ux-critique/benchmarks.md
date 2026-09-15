# UI/UX benchmark rubric

Evaluation aid, **not authorized scope**. Compare OpenAd to ads-ops tools and
crypto wallets without cloning either poorly.

| Phase | UX problem | Norm to probe | OpenAd surface |
| --- | --- | --- | --- |
| IA | Protocol jargon vs operator jobs | Glossary-honest labels; next action obvious (GAM left nav vs Rainbow home) | Layout, Discover/Supply/Campaigns |
| Empty / error | Developer console copy | Human empty states, SIWE errors not muted-only | Layout banner, dashboards |
| Time / money | Unix + raw uints | Local dates; USDC formatted until submit | Calendar, terms, quote |
| Enums | Numeric kind / approval / NFT standard | Selects with glossary labels | Supply, Campaigns |
| Buy | Raw creative id; fee hidden | Picker of owned creatives; itemized price + fee | BuyDialog, SlotPage |
| Tx status | "Submitted" | Pending → chain hash → indexer-confirmed (Rainbow activity) | Buy / mint / register |
| Wallet | Rail hidden on mobile | Balance + slot/lease counts at all breakpoints | WalletRail, Connect |
| Search | Desktop-only domain field | Search on mobile; kind filter vs domain | Layout, Discover |
| Calendar | Period table of indexes | Human windows + disable unsellable Buy | SlotPage |
| A11y | Dialogs without trap/labels | Focus, headings, contrast, keyboard Buy | All |
| Embed | Demo orphaned | Publisher-facing snippet + live preview | Supply, :5174 |

## Wishlist-adjacent (cross-ref only)

Same ROADMAP out-of-scope list as the SME skill. Do not invent impression
dashboards or custodial email login as UX "fixes" without dual-tag + ADR.
