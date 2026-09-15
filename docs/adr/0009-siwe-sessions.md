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
