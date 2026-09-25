# Threat model (ROADMAP 4.3)

Scope: the v1 protocol including `AdSlot`, `Marketplace`, `CreativeRegistry` and `CampaignVault`,
the indexer and API serve path, the CPC settler process (ADR-0014), the web app, and the GCP
deploy configuration (ADR-0017, `infra/gcp/`). Out of scope: live Base mainnet operations, GCP
organization and account security, and English occupancy auctions.

## Assets

- Publisher slot NFTs and calendar/terms configuration
- Advertiser USDC and registered creatives (LEASE `buy` and CPC campaign `remaining`)
- Lease table (who may occupy a period)
- Campaign table and payable click log (ADR-0014)
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
| T13 | Click token replay / publisher self-click | One-time HMAC token; TTL; tokens are never shared through a cache: a campaign serve response is `Cache-Control: private, no-store`, and a CDN may cache `/v1/serve/*/media` only; 2-second burst rule (`OPENAD_CLICK_IVT`) keyed by an HMAC of the trusted-hop client key (`OPENAD_TRUSTED_PROXY_HOPS`, the same key as T16) and the slot, in a bounded in-memory map (at most 10 000 keys); the rule is skipped, with a warning at startup, while the hops are 0 outside dev/test, so it stays off until the hop count is verified in staging; in staging and prod, best-effort origin enforcement (`OPENAD_SERVE_ENFORCE_ORIGIN=true` in `api.yaml`): a browser request whose `Origin`/`Referer` names another host than the slot's domain or its subdomains, or whose `Origin` is opaque (`null`) with no matching `Referer`, gets the house ad or empty and no click token; a non-browser script can forge those headers, so origin checks don't stop it, and the burst rule and the hourly per-campaign cap are the backstop; house clicks never payable |
| T14 | Serve CORS wildcard misused | `Access-Control-Allow-Origin: *` on `/v1/serve/*` only, with no `Access-Control-Allow-Credentials`, so a malicious page can read only the same public, cookie-free JSON/media any visitor could fetch directly; every other route keeps the credentialed allowlist |
| T15 | SIWE message relayed from another domain (a phishing page has the victim sign a message for its own domain, then posts it to our `/v1/auth/verify`) | Strict EIP-4361 parser (the exact ABNF layout, EIP-55 address); `domain` and `URI` bound to an allowed web origin (`OPENAD_SIWE_ALLOWED_ORIGINS`, else `OPENAD_CORS_ORIGINS`); single-use nonce with a 10-minute TTL, consumed atomically only after the signature checks out, so a rejected message never burns it; chain id; `Issued At` window with 5 minutes of skew (ADR-0009 amendment) |
| T16 | Auth table growth / nonce flooding | Used or expired nonces and expired sessions pruned from `POST /v1/auth/nonce` at most once a minute per process (the expiry DELETEs use migration `0005`'s indexes; used nonces go in a separate, unindexed DELETE over the nonces younger than the TTL); opt-in per-instance token bucket on nonce and verify (`OPENAD_AUTH_RATE_LIMIT_PER_MINUTE`, keyed by `OPENAD_TRUSTED_PROXY_HOPS`); Cloud Armor rate limiting on a load balancer recommended for a global limit (`docs/deploy-gcp.md`) |
| T17 | Media fetch SSRF via redirect | `fetch_media` uses `follow_redirects=False` and re-validates every hop (initial URL and up to 3 manual redirects) before it is fetched: scheme must be `https://` (`http://` allowed, and the host checks below skipped entirely, only when `OPENAD_ENV` is `dev`/`test` — so local Anvil/sim creatives at `http://127.0.0.1:*` still verify, ADR-0012). Outside dev/test, trailing dots are stripped from the host first (`localhost.` is `localhost`, `127.0.0.1.` is `127.0.0.1`), and a hop is refused if the host is then empty or contains whitespace or a control character (a NUL can truncate a name at a C resolver), is `localhost`, `*.localhost` or `*.internal`, or is an IP literal that is not `ipaddress.is_global` (private/loopback/link-local/CGNAT `100.64/10`), is multicast, is reserved (`is_reserved`: IPv4 `240.0.0.0/4`, and IPv6 `::/8`, which covers IPv4-compatible `::a00:1` and NAT64 `64:ff9b::/96` — `is_global` calls those global on Python 3.12), or is IPv6 site-local `fec0::/10`; legacy numeric IPv4 forms (`127.1`, hex, octal, decimal) are normalized via `socket.inet_aton` first, and IPv4-mapped IPv6 is unwrapped first. A malformed hop URL, a 4th redirect, or a blocked hop all fail closed as `VERIFY_FAILED_FETCH` |
| T18 | Outbound fetch stall / decompression bomb / connection-pool exhaustion (slow-drip or gzip-bomb media or verification host, or many concurrent verifies) | `fetch_media` wraps connect, every hop, and the whole body in one `asyncio.timeout(OPENAD_MEDIA_FETCH_DEADLINE_SECONDS)` (default 30s), so a host that sends a few bytes every few seconds — never tripping the per-read `FETCH_TIMEOUT_S` — is still cut off (`failed:timeout`). Both `fetch_media` and `_check_meta` send `Accept-Encoding: identity` and read wire bytes raw (`aiter_raw()`), refusing any response whose `Content-Encoding` is not identity/absent (`VERIFY_FAILED_FETCH` / refused) rather than trusting the client's own request header — a malicious server can ignore it — so `max_media_bytes` and the meta-tag's 256 KiB cap bound bytes actually received, not a much larger size a compressed body could decode to. The indexer's `verify_pending` pass gets its own wall-clock budget (`OPENAD_VERIFY_PASS_BUDGET_SECONDS`, default 20s) and works pending creatives in FIFO (`creative_id`) order; a creative the pass doesn't reach in the budget stays `pending` and is retried next pass, but one it does reach and that fails (any `failed:*`, including `failed:timeout`) is never retried automatically. `verify_creative` (`POST /v1/creatives/{id}/verify`) and `check_domain_verification` (`?check=true`) both read what the fetch needs and commit — releasing the pooled DB connection — before the network call, then write the result in a later transaction, so neither a slow host nor many concurrent verifies of one creative can hold a connection out of the pool for the fetch's duration; `check_domain_verification`'s write-back is additionally guarded by the token read before the fetch, so a check that outlives a token re-issued mid-flight can't mark the slot verified under the new one. A per-slot cooldown is claimed atomically in the database — one conditional `UPDATE ... WHERE last_checked_at IS NULL OR <= now - 30s`, rowcount 0 loses the race — so a `?check=true` call inside another call's cooldown window gets `429 rate_limited` with `Retry-After` (`RateLimitedError`, T16's mechanism) whether or not it is the same api instance or process that holds the window, and ownership is checked before the cooldown, so a non-owner gets `403` even during another caller's active cooldown. `_check_meta` reuses T17's `_hop_allowed`, has its own 10s deadline, and scans for `</head>` incrementally — each chunk is searched with the previous chunk's tail as overlap, not by rescanning the whole body read so far — up to a 256 KiB cap |
| T19 | Unbounded work per request | `GET /v1/slots/{slot_id}/periods` rejects any window wider than 60 periods (`to − from + 1 > 60`) with a house-style 422 `invalid_window`, before building the period list; `from` and `to` are also capped at the max uint256, so a value that width check alone would miss (e.g. `from == to`, both out of range) gets FastAPI's normal 422 rather than a 500 from the Uint256 bind; leases in the window are read with one batched query (`slot_id`, `calendar_version`, `period_index BETWEEN from AND to`) instead of one `session.get` per index, so the request's cost no longer grows unboundedly with the caller-supplied range |
| T20 | Settler key compromise (whoever takes `openad-settler-key-<ENV>` or the running settler container signs as the settler) | A dedicated, gas-only EOA whose only protocol role is `settle_batch`, never the deployer or an owner key: `contracts/script/deploy.py` requires `OPENAD_SETTLER_ADDRESS` off Anvil and pyevm and refuses the deployer; the settler process refuses to start, before its liveness listener, if its key owns `CampaignVault` or is the artifact's deployer off chain 31337 (`settler.key_is_owner`, `settler.key_is_deployer`) or the RPC's chain id isn't `OPENAD_CHAIN_ID` (`settler.chain_mismatch`); Secret Manager IAM binds the secret to the settler's service account only (`docs/deploy-gcp.md` §5); rotation with `set_settler` (`contracts/script/set_settler.py`, which refuses the deployer and the vault's current owner, and goes through the Safe on Base; `docs/deploy-sepolia.md`). Until it is rotated, a stolen key can still over-report payable clicks within T11's caps and spend its own gas |

## Residual risk

- Moderator can revoke any creative (intended takedown).
- Settler, or anyone holding the settler key until `set_settler` rotates it, can over-report
  payable clicks up to caps (intended residual until Merkle challenge).
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
- T17's redirect check validates IP literals and a short hostname denylist (`localhost`,
  `*.localhost`, `*.internal`) in the URL itself, not what an arbitrary hostname resolves to —
  DNS rebinding (a hostname that only resolves to a private/internal address at fetch time) is
  out of scope for this step. The host checks apply only outside `OPENAD_ENV=dev`/`test`.
- T18's verify pass has no concurrency of its own — pending creatives within one pass are
  fetched one at a time, in FIFO order, so a run of slow (but not yet timed-out) `uri`s can make
  a pass take up to its whole budget before later creatives in the same pass are attempted.
  Bounded per-pass concurrency (fetching more than one pending creative at once) is Phase 7.
  There is no per-address or per-session limit on `POST /v1/creatives/{id}/verify` itself (unlike
  the domain check's per-slot cooldown), so one advertiser can still repeatedly trigger fetches
  of any of their own media creatives, whatever its status (`verify_creative` re-fetches a
  verified or failed creative as well as a pending one) — each one bounded and
  connection-releasing, but not rate limited.
- Click URLs are checked for `https://` only, with no phishing or malware blocklist yet
  (ROADMAP 7.19). A publisher that waives approval accepts any landing page a creative's
  `click_url` points to; takedown is after the fact: the publisher's `set_approval(id, False)` or
  `revoke_approval(id)` on its own slots (blocked under WAIVED too — `is_blocked_for` checks
  REJECTED/REVOKED before the waiver), or the moderator's `moderator_revoke` everywhere.

## Review artifacts

- `uv run pytest` in `contracts/` including hypothesis invariants 1–10
- `python contracts/scripts/slither_vyper.py` (or CI job) when `slither` is installed
