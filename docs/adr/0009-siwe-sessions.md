# ADR-0009: SIWE sessions for off-chain writes

- **Status:** Accepted
- **Date:** 2026-09-11
- **Scope:** api, web

## Context

House ads, domain verification, and "request re-verify" are off-chain writes that must be
scoped to a wallet. The API must never see a private key or sign a chain transaction.
ROADMAP 3.1 requires `/v1/auth/*` plus a web auth feature.

## Decision

1. **EIP-4361 SIWE** (Sign-In with Ethereum). The browser signs a SIWE message with the
   connected wallet; the API verifies the signature with `siwe` (Python) and the chain id
   in `OPENAD_CHAIN_ID`.
2. **Nonce:** `POST /v1/auth/nonce` inserts a single-use nonce in `auth_nonces` (TTL 10
   minutes). The SIWE message must include that nonce.
3. **Session:** `POST /v1/auth/verify` sets an HTTP-only, `SameSite=Lax`, `Secure` in
   staging/prod (not required on localhost) cookie. Payload is a signed timestamp +
   address (HMAC with `OPENAD_SESSION_SECRET`). Row also stored in `sessions` with
   `OPENAD_SESSION_TTL_SECONDS` expiry so logout can revoke.
4. **Logout:** `POST /v1/auth/logout` deletes the session row and clears the cookie.
5. **Authorization:** authenticated routes require the session address to equal the
   acting address (slot owner for house-ad / domain verification; creative advertiser
   for re-verify). Mismatch → 403.
6. RainbowKit `signMessage` is the only signing surface. The API still never holds keys
   that can move funds or write leases.

## Alternatives considered

- **JWT in localStorage** — XSS-exfiltratable. Rejected.
- **EIP-1271 smart-account SIWE only** — needed on Base later; v1 verifies EOA signatures
  and documents EIP-1271 as a follow-up.
- **Wallet signature per request** — poor UX for dashboard forms.

## Consequences

- CORS must allow credentials from `OPENAD_CORS_ORIGINS`.
- Playwright uses a mock EIP-1193 provider that can `personal_sign` SIWE (ADR-0010).

## References

- EIP-4361. `docs/ARCHITECTURE.md` §3.2, §3.3.

## Amendment (2026-09-25): strict parsing, origin binding, nonce and session hygiene

The decision above stands. This amendment records what the implementation actually does,
and the hardening added by ROADMAP 6.8 (threat model T15 and T16).

**Implementation as built** (the text above predates the code):

- Messages are parsed by an in-house strict EIP-4361 parser (`api/src/openad/siwe.py`: pure
  functions, no new runtime dependency), not by the Python `siwe` package.
- The cookie holds a random 256-bit server-side session id (`secrets.token_hex(32)`). It is
  not an HMAC-signed timestamp and address. The `sessions` row is the only session state.
- `OPENAD_SESSION_SECRET` is not read by any code today. The setting and its Secret Manager
  binding remain.

**Why it changed.** The first parser regex-searched the whole message for the first `0x…`
address, `Nonce:` and `Chain ID:`. It never read the domain line, `URI`, `Version` or
timestamps. So a phishing page could get our nonce server-side and have the victim sign a
well-formed message for the phishing page's **own** domain; the wallet shows no mismatch,
because the domain matches that page. The page could then post the message to
`/v1/auth/verify` and receive a session for the victim's address. Also, the nonce was
consumed read-then-write (two concurrent verifies could both pass), and used or expired
`auth_nonces` and expired `sessions` rows were never deleted.

**Rules now enforced**, in this order: parse → bind → chain → time → signature → consume
nonce → create session.

1. **Strict parse.** Only the EIP-4361 layout, `address LF LF [statement LF] LF "URI: "…`:
   - the `<domain> wants you to sign in with your Ethereum account:` line, with no
     `scheme://` prefix;
   - the address, EIP-55 checksummed, as EIP-4361 requires (an all-lower-case address is
     rejected; the API stores it lower-cased);
   - an empty line;
   - without a statement, a second empty line; with one, the statement (one line of
     EIP-4361's statement characters) and then an empty line. A single empty line between
     the address and `URI` is rejected;
   - then `URI` (RFC 3986 characters), `Version: 1`, `Chain ID`, `Nonce` (8 to 64
     alphanumerics) and `Issued At` (RFC 3339), each exactly once and in that order;
   - then, optionally and in order, `Expiration Time`, `Not Before`, `Request ID` and
     `Resources` with its `- <uri>` lines.

   Unknown, duplicate or reordered lines, CR characters and anything after the last field
   are rejected with the generic "malformed SIWE message". The web app and the sim build
   the message with viem's `createSiweMessage`, which writes exactly this layout. The request
   body's `message` is capped at 4096 characters: a longer one, like any body that fails
   validation on `/v1/auth/*`, gets a house-style 422 `invalid_request` before parsing.

2. **Bind to an allowed origin.** The `domain` must equal the authority (`host:port`) of an
   allowed origin, and the `URI`'s origin (scheme, host and port) must be that same origin.
   Otherwise the API answers 401 "domain not allowed".
   - Allowed origins come from `OPENAD_SIWE_ALLOWED_ORIGINS`, falling back to
     `OPENAD_CORS_ORIGINS`. Only `http(s)` origins count, so `*` allows nothing.
   - Clients sign as the **web app's** origin, never the API's: the web app uses
     `window.location.host` and `window.location.origin`, and the sim uses
     `OPENAD_SIM_WEB_ORIGIN` (default `http://localhost:5173`).
   - With the binding, the wallet's own EIP-4361 domain check protects users. A message
     for a foreign domain is refused here. A message naming our domain, but requested from
     a foreign page, is flagged by any wallet that implements that check. A wallet can only
     apply it to a message it parses as EIP-4361, which is one more reason the clients emit
     the exact layout (rule 1).
3. **Chain and time.** `Chain ID` must equal `OPENAD_CHAIN_ID`. `Issued At` must lie within
   `[now − 10 min − 5 min, now + 5 min]`: the nonce lifetime plus 5 minutes of clock skew
   either way. `Expiration Time`, if present, must be after now; `Not Before`, if present,
   at most now + 5 min.
4. **Atomic, single-use nonce.** Only after the signature checks out does the API run one
   conditional update:
   `UPDATE auth_nonces SET used = true WHERE nonce = :n AND used = false AND created_at >= :now − 600`.
   It must affect exactly one row, and the session is inserted in the same transaction.
   Every earlier rejection leaves the nonce unused, so a relayed message never burns it.
   Two concurrent verifies of one nonce cannot both succeed.
5. **Pruning.** `POST /v1/auth/nonce` deletes used or expired nonces and expired sessions,
   at most once every 60 s per process. The prune is best-effort: if it fails, the nonce is
   still issued. Migration `0005` indexes `auth_nonces.created_at` and
   `sessions.expires_at` for the expiry DELETEs. Used nonces go in a separate DELETE (`used`
   has no index) that runs after the expired ones are gone, so it only looks at nonces
   issued within the last 10 minutes.
6. **Opt-in auth rate limit** (`api/src/openad/ratelimit.py`).
   - `OPENAD_AUTH_RATE_LIMIT_PER_MINUTE` (default `0`, off) enables a token bucket per
     client on `POST /v1/auth/nonce` and `/verify` only. Both routes share one bucket.
     Over the limit, the API answers 429 `rate_limited` with `Retry-After`.
   - Memory is bounded by an LRU of at most 10 000 keys.
   - The limit is **per process**, so the real limit is the setting times the number of
     instances. A global limit belongs on a load balancer (Cloud Armor).
   - **Proxy-hops rule.** With `OPENAD_TRUSTED_PROXY_HOPS=0` (the default), the key is the
     TCP peer. With `N > 0`, the key is the N-th `X-Forwarded-For` entry counted from the
     right, falling back to the peer when the chain is shorter. Entries further left are
     client-supplied and never read.
   - "TCP peer" means `request.client.host` as uvicorn reports it (uvicorn 0.52,
     `uvicorn/middleware/proxy_headers.py`). By default uvicorn trusts `X-Forwarded-For` only
     from a peer at `127.0.0.1`, and then reports the right-most entry that is not
     `127.0.0.1`. Leave `FORWARDED_ALLOW_IPS` at that default: set to `*`, uvicorn reports the
     **left-most** entry, which the client controls.
   - Cloud Run keeps it off until the proxy chain is verified in staging
     (`docs/deploy-gcp.md`).

**Unchanged:** `SameSite=Lax`; `Secure` outside dev and test; `OPENAD_SESSION_TTL_SECONDS`;
logout; the authorization rules; no key ever held by the API.

**Alternatives considered.**

- **Adopt the `siwe` package.** Rejected: a new runtime dependency for one small module
  (`siwe.py`, about 250 lines with docstrings) whose behaviour the tests pin down exactly.
- **Bind to the API origin (`OPENAD_PUBLIC_URL`).** Rejected: the wallet compares the domain
  with the page that asks for the signature, which is the web app.
- **Rate limit in Redis or Postgres.** Rejected for now: new infrastructure. A global limit
  belongs at the edge.
