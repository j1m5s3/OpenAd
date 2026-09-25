# Threat model (ROADMAP 4.3)

Scope: OpenAd v1 protocol (`AdSlot`, `Marketplace`, `CreativeRegistry`), the indexer/API
serve path, and the Vite web app. Specified (not implemented): `CampaignVault` + settler
(ADR-0014). Out of scope: GCP, live Base mainnet ops, English occupancy auctions.

## Assets

- Publisher slot NFTs and calendar/terms configuration
- Advertiser USDC and registered creatives (LEASE `buy` and CPC campaign `remaining`)
- Lease table (who may occupy a period)
- Campaign table and payable click log (Specified ADR-0014)
- Verified media cache (what visitors see)
- SIWE sessions (off-chain house ads / domain verification only)

## Actors

- Honest publisher / advertiser wallets
- Marketplace owner (fee, treasury, `set_market`)
- CreativeRegistry moderator
- CampaignVault settler (ADR-0014)
- Indexer operator
- Unprivileged web visitor (embed)
- Attacker with an EOA, RPC access, and the ability to publish URLs

## Trust boundaries

- Chain is the source of truth for leases, terms, approvals, USDC movement, and campaign
  remaining balances.
- Postgres is a derived cache plus off-chain tables (house ads, verification, sessions,
  payable clicks).
- Serve never reads the chain and never fetches advertiser **media** URLs at request time.
  CPC clicks 302 through `/v1/c` (ADR-0014).
- `api/` HTTP and `web/` never hold keys that move funds or write leases. The settler
  process may hold `OPENAD_SETTLER_KEY` only.

## Threats and mitigations

| ID | Threat | Mitigation |
| --- | --- | --- |
| T1 | Marketplace holds USDC | Fee and publisher `transferFrom` in the same `buy`; tests assert zero leftover |
| T2 | Reentrancy on buy | Vyper `# pragma nonreentrancy on`; checks-effects-interactions (lease write before transfers) |
| T3 | Permit griefing | Non-reverting permit (ADR-0004); `transferFrom` still required |
| T4 | Overlapping leases | Period key uniqueness + `set_calendar` `"leases outstanding"` |
| T5 | Unverified / revoked creative served | Serve rule: verified + active + not blocked; indexer cache bump |
| T6 | Visitor traffic leaked to advertiser | Media only from verified cache; embed does not send cookies |
| T7 | SIWE session used as another wallet | Cookie bound to recovered address; writes check slot/creative owner |
| T8 | Reorg stale serve | Indexer rewinds on hash mismatch; handlers are idempotent upserts |
| T9 | XSS via creative HTML | Raster images only; click URL must be `https://` |
| T10 | Owner keys on mainnet | Runbook: multisig owner + timelock on `set_market` (ROADMAP 4.6) |
| T11 | Settler reports fake payable clicks | Caps (`MAX_BATCH_CHARGE`, clicks/hour); public `click_events`; advertiser pause/close; settler ≠ HTTP API (ADR-0014) |
| T12 | CampaignVault holds USDC | Balance = sum(`remaining`); tests; finalize refunds leftover |
| T13 | Click token replay / publisher self-click | One-time HMAC token; TTL; optional IP+slot burst HMAC; house clicks never payable |
| T14 | Serve CORS wildcard misused | `Access-Control-Allow-Origin: *` on `/v1/serve/*` only, with no `Access-Control-Allow-Credentials`, so a malicious page can read only the same public, cookie-free JSON/media any visitor could fetch directly; every other route keeps the credentialed allowlist |
| T15 | SIWE message relayed from another domain (a phishing page has the victim sign a message for its own domain, then posts it to our `/v1/auth/verify`) | Strict EIP-4361 parser (the exact ABNF layout, EIP-55 address); `domain` and `URI` bound to an allowed web origin (`OPENAD_SIWE_ALLOWED_ORIGINS`, else `OPENAD_CORS_ORIGINS`); single-use nonce with a 10-minute TTL, consumed atomically only after the signature checks out, so a rejected message never burns it; chain id; `Issued At` window with 5 minutes of skew (ADR-0009 amendment) |
| T16 | Auth table growth / nonce flooding | Used or expired nonces and expired sessions pruned from `POST /v1/auth/nonce` at most once a minute per process (the expiry DELETEs use migration `0005`'s indexes; used nonces go in a separate, unindexed DELETE over the nonces younger than the TTL); opt-in per-instance token bucket on nonce and verify (`OPENAD_AUTH_RATE_LIMIT_PER_MINUTE`, keyed by `OPENAD_TRUSTED_PROXY_HOPS`); Cloud Armor rate limiting on a load balancer recommended for a global limit (`docs/deploy-gcp.md`) |

## Residual risk

- Moderator can revoke any creative (intended takedown).
- Settler can over-report payable clicks up to caps (intended residual until Merkle challenge).
- Indexer lag can serve a just-revoked creative for up to `ttl` + poll interval.
- Domain verification is a UI badge, not a protocol rule.
- The SIWE binding (T15) refuses a message signed for another domain. A phishing page can
  still ask the victim to sign a message that names **our** web origin; only the wallet's
  EIP-4361 domain check catches that, and a wallet can only apply it to a message it parses
  as EIP-4361: one outside that grammar may be shown as plain text with no domain check. So
  the web app and the sim emit the exact layout (viem's `createSiweMessage`). A wallet
  without the check, or a user who ignores its warning, remains exposed.
- The auth rate limit is per instance, forgotten on restart, and off on Cloud Run until the
  `X-Forwarded-For` chain is verified in staging (T16).

## Review artifacts

- `uv run pytest` in `contracts/` including hypothesis invariants 1–10
- `python contracts/scripts/slither_vyper.py` (or CI job) when `slither` is installed
