# Embed code

Supply has an **Embed code** panel for each of your slots: pick a slot and a
size, and copy the ready-made snippet.

```html
<script type="module" src="https://your-openad-web-origin/embed/open-ad.v1.js"></script>
<open-ad slot-id="42" api="https://your-api-origin" width="300" height="250"></open-ad>
```

The `<script>` tag loads the **embed** once; `<open-ad>` is the element that
renders. It talks only to the **serve** API — never the chain, and it never
proxies the advertiser's media file.

## Where to paste it

- **Any HTML site** — paste both lines wherever the ad should appear.
- **WordPress** — add a **Custom HTML** block and paste the snippet into it.
- **Ghost** — add an **HTML card** and paste the snippet into it.
- **Notion / Substack** — these don't allow custom scripts, so the snippet
  above won't run. Use the **badge** instead (below), or link a banner image
  you host yourself to your slot page.

## The "Advertise here" badge

For places that don't allow scripts, the Badge tab gives you a plain link and
image:

```html
<a href="https://your-openad-web-origin/slots/42"
  ><img
    src="https://your-openad-web-origin/badge/advertise-here.svg"
    alt="Advertise here via OpenAd"
    width="120"
    height="24"
/></a>
```

This works anywhere a link and an image work — Substack, a GitHub README, a
podcast show-notes page.

## Sharing your slot page

Every slot has its own page (`/slots/{id}`) with a **Share** row: a copyable
link and prefilled X/Farcaster posts, so you can post it directly to
prospective advertisers.

## Troubleshooting

- **The house ad shows instead of a paid creative.** Either the slot has no
  active lease or winning CPC campaign right now, or the page isn't on the
  slot's registered domain. OpenAd's hosted API (staging and production)
  shows paid creatives only on pages whose host is that domain or a subdomain
  of it: `blog.example.com` counts for `example.com`, `example.net` doesn't.
  A page the browser won't name, such as one inside a sandboxed iframe that
  sends no referrer, gets the house ad too. This check is separate from the
  [verified domain](../marketplace/faq.md) badge, which never changes what
  serves.
- **Nothing shows at all.** Check that the script URL in your snippet loads
  (open it directly in a new tab — it should return JavaScript, not a 404),
  and check your site's Content-Security-Policy: it must allow
  `script-src` and `connect-src`/`img-src` for the API origin.
- **The script URL 404s while running `npm run dev -w web` locally.** `vite dev`
  never serves `embed/open-ad.v1.js` — that file only exists after a real
  build (`npm run build -w web` or `npm run build:demo`), which runs the
  `embed` package's own build first and copies its output in. Build once, or
  point `VITE_EMBED_SCRIPT_URL` at an already-built copy, to test the exact
  snippet against a dev server.
