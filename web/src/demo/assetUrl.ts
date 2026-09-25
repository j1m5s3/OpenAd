/** Resolves a demo fixture's base-relative asset path (e.g. `demo/creatives/x.svg`) to an
 * absolute URL under the page's actual base, so it works from any sub-path with a relative
 * `<base>` (`npm run build:demo`, ADR-0016 hosting amendment): `dist-demo` sets `base: './'`, so
 * a leading-slash URL would resolve to the host's root instead of the deployed sub-path.
 *
 * `document.baseURI` reflects a `<base href>` tag if present and otherwise the document's own
 * URL, which is exactly what a relative asset should resolve against — the same rule the browser
 * already applies to a relative `<img src>` or stylesheet, made explicit here so it also works
 * for a URL handed to `fetch`, stored as plain data, or passed to the shadow-DOM embed. */
export function assetUrl(uri: string): string {
  return new URL(uri, document.baseURI).href;
}
