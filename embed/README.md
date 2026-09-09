# @openad/embed

The `<open-ad>` web component a publisher places on a page. Zero runtime dependencies, ≤ 5 KB
gzipped, talks only to the serve endpoint.

Constraints: [`/docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) §6, [`/docs/CONVENTIONS.md`](../docs/CONVENTIONS.md) §5,
`.cursor/rules/embed.mdc`. Serving rule: [`/docs/PROTOCOL.md`](../docs/PROTOCOL.md) §7.

## Usage

```html
<script type="module" src="https://cdn.example/open-ad.js"></script>
<open-ad
  slot-id="42"
  api="https://api.example"
  width="300"
  height="250"
  house-src="/img/house.png"
  house-href="/"
></open-ad>
```

| Attribute                 | Required          | Meaning                                                                     |
| ------------------------- | ----------------- | --------------------------------------------------------------------------- |
| `slot-id`                 | yes               | The slot's token id.                                                        |
| `api`                     | yes in production | Base URL of the OpenAd API (default `http://localhost:8000` for local dev). |
| `width`, `height`         | recommended       | CSS pixel box; should equal the slot's `SlotSpec` dimensions.               |
| `house-src`, `house-href` | optional          | Publisher fallback shown when nothing is serveable or on error.             |

Events (bubble, composed): `openad:render` with `detail: { slotId, status }` where `status` is
`lease | house | empty | unknown | error`; `openad:error` on network/parse failure.

Behaviour: fetches `GET {api}/v1/serve/{slot-id}` when the element becomes visible, renders
`<a target="_blank" rel="noopener noreferrer nofollow sponsored"><img></a>` inside a shadow root,
re-fetches after the response's `ttl` while visible, never sets cookies or storage, never loads
advertiser URLs directly (media is same-origin to the API), rejects non-`http(s)` click URLs.

## Commands

```bash
npm run dev -w embed        # demo page at http://localhost:5174/demo/
npm run test -w embed       # vitest + jsdom
npm run build -w embed      # dist/open-ad.js + dist/open-ad.iife.js, then size check
```

`src/types.ts` must match `api/src/openad/schemas/serve.py` field for field.
