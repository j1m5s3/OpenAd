# ADR-0006: Advertiser-hosted media with on-chain hash and verified serving cache

- **Status:** Accepted
- **Date:** 2026-09-08
- **Scope:** contracts, api, embed

## Context

Advertisers should be able to host their own media (no platform upload pipeline in v1), but a
URL's content can change after a publisher approves it. Publishers must be protected from
post-approval swaps, visitors must not be exposed to advertiser servers, and the serving path
must be fast.

## Decision

1. A `MEDIA` creative stores `uri` (`https://` or `ipfs://`) and `content_hash =
keccak256(bytes)` on-chain, plus `mime`, `width`, `height`, `click_url`. These are immutable.
2. The off-chain verifier fetches the bytes, checks hash, MIME, and dimensions, and stores the
   verified bytes in the platform's cache. Verification is repeated periodically.
3. **The serving edge only ever serves verified cached bytes** (`/v1/serve/{slot}/media`).
   It never redirects or proxies to the advertiser URL. A creative that fails verification is
   not served regardless of on-chain approval.
4. `NFT_REF` creatives resolve metadata and image through the platform's RPCs and are cached the
   same way; advertiser ownership of the token is re-verified periodically.
5. v1 creatives are raster images only (`image/png|jpeg|webp|gif`). No HTML, SVG, video, or
   scripts run on publisher pages.
6. The embed makes exactly one kind of request (`/v1/serve`), sets no cookies, and stores nothing.

## Alternatives considered

- **Platform-hosted uploads only** — simpler integrity story but makes the platform a content
  host from day one (storage cost, takedown liability, upload UX). Can be added later as a
  convenience that produces the same `uri + hash`.
- **Serve advertiser URL directly** — fast to build, but leaks visitor IPs/referrers to
  advertisers and allows content swaps after approval. Rejected.
- **IPFS-only** — content-addressed by nature, but forces every advertiser onto IPFS. Supported
  as an option, not required.

## Consequences

- The platform stores copies of verified creatives (small: ≤ 2 MiB each).
- Publisher takedown is honoured even if the advertiser's origin is still up, and content swaps
  are detected on the next verification run.
- `serve_events` provides honest delivery counts without any tracking of visitors.

## References

- `PROTOCOL.md` §3.3, §7. `ARCHITECTURE.md` §3.4, §3.5, §6, §8.
