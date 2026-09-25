/** Publisher-facing `<open-ad>` snippet builder (ROADMAP 6.3). Pure and framework-free so it
 * can be unit tested and reused by `EmbedCodePanel.tsx` (Supply) and `EmbedDemoPage.tsx`
 * (marketing) without duplicating the markup. */

export interface EmbedSnippetOptions {
  slotId: string;
  apiUrl: string;
  scriptUrl: string;
  width: number;
  height: number;
  houseSrc?: string;
  houseHref?: string;
}

/** HTML-attribute escaping — the values here are addresses, URLs and slot ids a publisher
 * pastes verbatim into their page, so they must never be able to break out of the `"..."`. */
export function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** `<script type="module" src="…"></script>` plus the `<open-ad>` element with the given
 * attributes, matching `embed/src/open-ad.ts`'s contract exactly (`slot-id`, `api`, `width`,
 * `height`, and the optional `house-src`/`house-href`). */
export function buildSnippet(opts: EmbedSnippetOptions): string {
  const attrs: Array<[string, string]> = [
    ['slot-id', opts.slotId],
    ['api', opts.apiUrl],
    ['width', String(opts.width)],
    ['height', String(opts.height)],
  ];
  if (opts.houseSrc) attrs.push(['house-src', opts.houseSrc]);
  if (opts.houseHref) attrs.push(['house-href', opts.houseHref]);
  const attrString = attrs.map(([name, value]) => `${name}="${escapeHtmlAttr(value)}"`).join(' ');
  const scriptSrc = escapeHtmlAttr(opts.scriptUrl);
  return `<script type="module" src="${scriptSrc}"></script>\n<open-ad ${attrString}></open-ad>`;
}

export interface EmbedSizePreset {
  label: string;
  width: number;
  height: number;
}

/** Standard IAB-ish placement sizes, in the order shown in the panel. A slot's own size (when
 * known) is prepended to this list by the caller — it is not baked in here since it is per-slot
 * data, not a constant. */
export const EMBED_SIZE_PRESETS: readonly EmbedSizePreset[] = [
  { label: 'Medium rectangle 300×250', width: 300, height: 250 },
  { label: 'Leaderboard 728×90', width: 728, height: 90 },
  { label: 'Mobile banner 320×50', width: 320, height: 50 },
];

/** The versioned embed script `web`'s own build ships (`vite.config.ts`'s `embedScriptCopy`
 * plugin copies `embed/dist/open-ad.js` to `embed/open-ad.v1.js` next to the app). Resolved
 * against `document.baseURI` so it keeps working under a sub-path or the demo build's relative
 * base. `VITE_EMBED_SCRIPT_URL` overrides it, e.g. for a CDN-hosted copy. */
export function defaultEmbedScriptUrl(): string {
  const override = import.meta.env.VITE_EMBED_SCRIPT_URL?.trim();
  if (override) return override;
  return new URL('embed/open-ad.v1.js', document.baseURI).href;
}
