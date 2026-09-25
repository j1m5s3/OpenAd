/** `/embed-demo`: the real `<open-ad>` embed, fed in-process in demo mode (ROADMAP 6.2 step
 * 10+11, ADR-0016). Loads `@openad/embed` (the unedited package — never re-implemented here) only
 * on this route, and points it at `location.origin` in demo mode, where the network guard's
 * serve responder (`demo/networkGuard.ts` + `demo/demoServe.ts`) answers `GET /v1/serve/{id}`
 * in-process. In a normal build it points at the real `API_URL` and talks to the real API. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';

import { routes } from '../../app/paths';
import { DEMO_MODE } from '../../demo/flag';
import { API_URL } from '../../lib/api';
import { withDevWalletParam } from '../../lib/devWalletQuery';
import { useSlots } from '../marketplace/api';

/** Standard placement sizes shown side by side, all serving the same selected slot. */
const STANDARD_SIZES = [
  { width: 728, height: 90, label: 'Leaderboard 728×90' },
  { width: 300, height: 250, label: 'Medium rectangle 300×250' },
  { width: 320, height: 50, label: 'Mobile banner 320×50' },
] as const;

function embedApiBase(): string {
  return DEMO_MODE ? window.location.origin : API_URL;
}

/** Matches `SupplyPage.tsx`'s own embed snippet: just the `<open-ad>` element, plus a placeholder
 * comment for the script tag — there is no hosted, versioned URL for `embed/dist/open-ad.js` to
 * point at yet (it ships from npm and from the repo's own `embed/` package), so the snippet must
 * not invent one. */
function snippet(slotId: string, width: number, height: number): string {
  const api = embedApiBase();
  return [
    '<!-- Host embed/dist/open-ad.js (npm: @openad/embed) yourself, or from your CDN, and load it once: -->',
    '<script type="module" src="/path/to/open-ad.js"></script>',
    `<open-ad slot-id="${slotId}" api="${api}" width="${width}" height="${height}"></open-ad>`,
  ].join('\n');
}

/** Renders `<open-ad>` with its attributes set imperatively via `setAttribute`, not as JSX props.
 * The element exposes `slotId`/`api` as read-only getters backed by the attribute (no setter) —
 * React's custom-element handling assigns a prop as a DOM *property* whenever one of that name
 * already exists on the element, which throws for a getter-only one. Attributes are exactly what
 * the unedited embed contract expects (see `embed/src/open-ad.ts`), so this changes nothing about
 * how a publisher would actually use it. */
function OpenAdEmbed({ slotId, api, width, height }: { slotId: string; api: string; width: number; height: number }) {
  const ref = useCallback(
    (el: HTMLElement | null) => {
      if (!el) return;
      // `api` first: setting `slot-id` (or `api`) triggers the element's own
      // `attributeChangedCallback`, which immediately reads `this.api` to fetch the serve
      // response — setting `slot-id` before `api` would fire that first fetch against the
      // element's `DEFAULT_API` fallback instead of the origin below.
      el.setAttribute('api', api);
      el.setAttribute('width', String(width));
      el.setAttribute('height', String(height));
      el.setAttribute('slot-id', slotId);
    },
    [slotId, api, width, height],
  );
  return <open-ad ref={ref} />;
}

export function EmbedDemoPage() {
  const slots = useSlots();
  const [slotId, setSlotId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Loaded only on this route: `@openad/embed` never ships in the app's main chunk.
    void import('@openad/embed').then((mod) => {
      if (cancelled) return;
      if (typeof customElements !== 'undefined' && !customElements.get('open-ad')) {
        customElements.define('open-ad', mod.OpenAdElement);
      }
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const items = useMemo(() => slots.data?.items ?? [], [slots.data]);
  useEffect(() => {
    if (!slotId && items.length > 0) setSlotId(items[0]?.slotId ?? null);
  }, [items, slotId]);

  const api = embedApiBase();
  const activeSnippet = useMemo(
    () => (slotId ? snippet(slotId, STANDARD_SIZES[0].width, STANDARD_SIZES[0].height) : ''),
    [slotId],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(activeSnippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied (e.g. an insecure context); the snippet is still on-page.
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-accent">Embed</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">See the embed live</h1>
        <p className="mt-2 max-w-2xl text-muted">
          This is the real <code>&lt;open-ad&gt;</code> element — the same 5 KB, zero-dependency
          web component a publisher drops on their page — pointed at a slot below.
          {DEMO_MODE && ' Nothing here is re-implemented for the demo: the fetch it makes is answered in-process, not proxied.'}
        </p>
      </div>

      <label className="block max-w-xs text-sm">
        <span className="block text-muted">Slot</span>
        <select
          value={slotId ?? ''}
          onChange={(e) => setSlotId(e.target.value)}
          className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink outline-none"
        >
          {items.map((s) => (
            <option key={s.slotId} value={s.slotId}>
              Slot #{s.slotId} · {s.domain}
            </option>
          ))}
        </select>
      </label>

      {slotId && ready && (
        <div className="flex flex-wrap items-end gap-6">
          {STANDARD_SIZES.map((size) => (
            <div key={size.label} className="space-y-2">
              <p className="text-xs text-muted">{size.label}</p>
              <div className="inline-block border border-dashed border-line p-1">
                <OpenAdEmbed slotId={slotId} api={api} width={size.width} height={size.height} />
              </div>
            </div>
          ))}
        </div>
      )}

      {slotId && (
        <div className="rounded-2xl border border-line bg-surface p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Copy-paste snippet</h2>
            <button
              type="button"
              onClick={() => void copy()}
              className="rounded-full border border-line px-3 py-1 text-sm text-ink"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-canvas p-3 text-xs text-ink">
            <code>{activeSnippet}</code>
          </pre>
        </div>
      )}

      <div className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="font-semibold">What just happened</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
          <li>
            The element called <code>GET {api}/v1/serve/{'{slotId}'}</code> — the only endpoint it
            ever talks to.
          </li>
          <li>Serving never reads the chain, and never proxies the advertiser&apos;s media URL.</li>
          <li>
            No tracking script, no cookies; the only other request is the creative image itself.
          </li>
          <li>
            If nothing is leased or a campaign isn&apos;t winning, it falls back to the
            publisher&apos;s house ad, or renders nothing at all.
          </li>
        </ul>
      </div>

      {DEMO_MODE && slotId && (
        <p className="text-sm">
          <Link to={withDevWalletParam(routes.slot(slotId))} className="text-accent underline">
            Buy the next period as the advertiser →
          </Link>{' '}
          <span className="text-muted">then come back — the creative above changes.</span>
        </p>
      )}
    </div>
  );
}
