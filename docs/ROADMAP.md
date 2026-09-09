# Roadmap

Work is organised in phases; each phase has numbered tasks. Pick the first unchecked task in
the lowest incomplete phase unless the user says otherwise. Each task lists **Pointers** (the
exact places to read before starting) and **Acceptance** (what "done" means). Update the
checkbox and add a one-line note when you finish. Do not start a later phase's task if it
depends on an unchecked earlier one.

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[-]` dropped (say why).

---

## Phase 0 — Foundation

- [x] **0.1 Repository scaffold and documentation.** Monorepo layout, package manifests, docs set,
      Cursor rules, docker-compose, `.env.example`. _Done 2026-09-08._
- [x] **0.2 Contracts package skeleton.** Moccasin project, canonical `.vyi` interfaces,
      `MockUSDC`, deploy script with artifact writer, test fixtures. _Done 2026-09-08._
- [x] **0.3 API package skeleton.** FastAPI app factory, settings, DB session, initial models,
      serve endpoint with house-ad fallback, indexer runner + handler registry, tests. _Done 2026-09-08._
- [x] **0.4 Web and embed skeletons.** Vite/React/MUI/wagmi shell with routes; `<open-ad>` element
      with demo page and size check. _Done 2026-09-08._

## Phase 1 — Protocol contracts (Base Sepolia)

- [ ] **1.1 `CreativeRegistry.vy`.**
      Pointers: `PROTOCOL.md` §3.3, §5.3, §6, §8 (7, 8) · `contracts/src/interfaces/ICreativeRegistry.vyi` · `contracts/tests/conftest.py`.
      Acceptance: implements the interface; all revert strings match; `tests/test_creative_registry.py` covers every function, both approval paths, moderator revoke, same-chain NFT ownership check (use a snekmate ERC-721 mock); property tests for invariants 7 and 8.
- [ ] **1.2 `AdSlot.vy`.**
      Pointers: `PROTOCOL.md` §3.1, §4.1, §5.1, §6, §8 (1, 2, 3, 9) · `contracts/src/interfaces/IAdSlot.vyi` · snekmate `tokens/erc721.vy` (do not export `safe_mint`).
      Acceptance: `tests/test_ad_slot.py` covers mint validation, calendar rules incl. `"leases outstanding"`, lease writing only by market, `userOf/userExpires` across period boundaries via `boa.env.time_travel`; hypothesis test that leases never overlap.
- [ ] **1.3 `Marketplace.vy`.**
      Pointers: `PROTOCOL.md` §3.2, §4.2, §4.3, §5.2 (check order!), §6, §8 (4, 5, 6, 10) · `contracts/src/interfaces/IMarketplace.vyi` · `contracts/src/mocks/MockUSDC.vy` · ADR-0004 (permit).
      Acceptance: `tests/test_marketplace.py` covers price curve at open/mid/just-before-start, `"not open"`/`"closed"`, fixed-price case, each revert in `buy` order, fee split exactness, pass-through invariant, `buy_with_permit` incl. a pre-consumed permit still succeeding when allowance exists; property test: `floor <= price <= start` and monotonic.
- [ ] **1.4 Deploy script end-to-end.**
      Pointers: `PROTOCOL.md` §10 · `ARCHITECTURE.md` §4.1 · `contracts/script/deploy.py`.
      Acceptance: `uv run mox run deploy --network anvil` deploys all four contracts in order, wires market/treasury/fee/moderator, mints two demo slots + terms + one approved creative + one purchased period, and writes a valid `deployments/31337.json`.
- [ ] **1.5 Base Sepolia deployment.**
      Acceptance: `deployments/84532.json` committed; contracts verified on the explorer; `PROTOCOL.md` §10 table updated with real addresses.

## Phase 2 — Indexer, serving edge, embed (end-to-end on Anvil)

- [ ] **2.1 Indexer handlers for all events.**
      Pointers: `PROTOCOL.md` §6 · `ARCHITECTURE.md` §3.2, §3.7 · `api/src/openad/indexer/handlers.py` · `api/src/openad/models/`.
      Acceptance: every event has a handler and a test with a synthetic decoded log; replay from block 0 on Anvil after 1.4 produces expected rows; reorg rewind test.
- [ ] **2.2 Alembic baseline migration** for all tables in `ARCHITECTURE.md` §3.2.
- [ ] **2.3 Creative verification + media cache.**
      Pointers: `ARCHITECTURE.md` §3.5 · `api/src/openad/serve/`.
      Acceptance: hash mismatch, MIME mismatch, dimension mismatch, oversize, timeout each produce the documented failure; verified bytes served from `/v1/serve/{slot}/media` with `ETag`.
- [ ] **2.4 Serve endpoint complete.**
      Pointers: `PROTOCOL.md` §7 · `ARCHITECTURE.md` §3.4 · `api/src/openad/services/serve.py` · `embed/src/types.ts`.
      Acceptance: lease → house → empty precedence tested; blocked/revoked/unverified creatives fall back; origin enforcement toggle tested; response cache headers correct; p95 < 50 ms against local Postgres.
- [ ] **2.5 Embed against a real slot.**
      Acceptance: demo page renders a purchased period's creative from Anvil end-to-end; falls back to house ad after `revoke_approval`; bundle ≤ 5 KB gzipped.
- [ ] **2.6 Public read endpoints** (`/v1/slots`, `/v1/slots/{id}`, `/periods`, `/creatives/{id}`) with tests.

## Phase 3 — Web app

- [ ] **3.1 SIWE auth** (API `/v1/auth/*` + web `features/auth`). ADR for session strategy.
- [ ] **3.2 Marketplace browse + buy dialog** (quote via wagmi `Marketplace.quote`, buy via `buy_with_permit`, USDC permit signing).
- [ ] **3.3 Publisher dashboard**: mint slot, set calendar, set terms, approvals inbox, allowlist, house ad, domain verification, earnings.
- [ ] **3.4 Advertiser dashboard**: register media/NFT creative (client-side keccak of bytes), request approvals, leases calendar, delivery report from `serve_events`.
- [ ] **3.5 Generated API client** from FastAPI OpenAPI (`openapi-typescript`), replacing hand-written `lib/api.ts` types.

## Phase 4 — Hardening and v1.1 features

- [ ] **4.1 Late buy** (`PROTOCOL.md` §9) — spec first, then contracts, indexer, UI.
- [ ] **4.2 Pricing autopilot** (publisher-side suggestion engine; no protocol change).
- [ ] **4.3 Contract review/audit prep**: threat model doc, slither-vyper run, invariant fuzz campaign.
- [ ] **4.4 CDN worker for `/v1/serve`** (move serving edge out of the API process).
- [ ] **4.5 Embedded wallets / gas sponsorship** for web2 publishers (ADR first).
- [ ] **4.6 Base mainnet deployment** with multisig owner and timelock on `set_market`.

---

## Out of scope (do not build without a new ADR)

English or sealed-bid auctions · impression/click attribution on-chain · advertiser HTML/JS
creatives · custodial onboarding · multi-currency settlement · sublease market.
