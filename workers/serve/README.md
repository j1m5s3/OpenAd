# Serve CDN worker (ROADMAP 4.4)

Source-only Cloudflare Worker prototype for caching `GET /v1/serve/{slot}/media`. **Not
deployed**, and its source still fronts the JSON endpoint too — ROADMAP 7.20 tracks limiting it
to `/media` before that changes, since a campaign response there is `private, no-store` and must
never be cached. The API process remains the origin.

```text
npx wrangler dev   # optional local
# do not wrangler deploy unless ops asks
```
