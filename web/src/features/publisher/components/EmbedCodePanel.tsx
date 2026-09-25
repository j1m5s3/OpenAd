import { useMemo, useRef, useState } from 'react';
import { Link, useHref } from 'react-router';

import { routes } from '../../../app/paths';
import { API_URL } from '../../../lib/api';
import {
  EMBED_SIZE_PRESETS,
  buildSnippet,
  defaultEmbedScriptUrl,
  escapeHtmlAttr,
  type EmbedSizePreset,
} from '../../../lib/embedSnippet';
import { useSlot } from '../../marketplace/api';

const BADGE_PATH = 'badge/advertise-here.svg';
const BADGE_WIDTH = 120;
const BADGE_HEIGHT = 24;
const FALLBACK_SIZE: EmbedSizePreset = {
  label: 'Medium rectangle 300×250',
  width: 300,
  height: 250,
};

type Tab = 'html' | 'wordpress' | 'ghost' | 'notion' | 'badge';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'html', label: 'Any HTML site' },
  { id: 'wordpress', label: 'WordPress' },
  { id: 'ghost', label: 'Ghost' },
  { id: 'notion', label: 'Notion / Substack' },
  { id: 'badge', label: 'Badge' },
];

/** Copies `text` to the clipboard; on failure (e.g. an insecure context, or a permissions
 * policy denying clipboard access) falls back to selecting the visible `pre` so the publisher
 * can still copy it with Ctrl/Cmd+C. Returns which happened, for the button's label. */
function copyText(text: string, pre: HTMLElement | null): Promise<'copied' | 'selected'> {
  return navigator.clipboard.writeText(text).then(
    () => 'copied' as const,
    () => {
      if (pre) {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(pre);
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
      return 'selected' as const;
    },
  );
}

function slotSizePreset(slot: { width: number; height: number } | undefined): EmbedSizePreset[] {
  if (!slot) return [];
  return [
    {
      label: `This slot's size ${slot.width}×${slot.height}`,
      width: slot.width,
      height: slot.height,
    },
  ];
}

export function EmbedCodePanel({ slotIds }: { slotIds: string[] }) {
  const [slotId, setSlotId] = useState(slotIds[0] ?? '');
  const slot = useSlot(slotId);
  const presets = useMemo(() => [...slotSizePreset(slot.data), ...EMBED_SIZE_PRESETS], [slot.data]);
  const [sizeIndex, setSizeIndex] = useState(0);
  const [tab, setTab] = useState<Tab>('html');
  const [status, setStatus] = useState<'idle' | 'copied' | 'selected'>('idle');
  const preRef = useRef<HTMLPreElement>(null);
  const badgeRef = useRef<HTMLPreElement>(null);

  const size = presets[Math.min(sizeIndex, presets.length - 1)] ?? FALLBACK_SIZE;
  const scriptUrl = useMemo(() => defaultEmbedScriptUrl(), []);
  const snippet = buildSnippet({
    slotId: slotId || '1',
    apiUrl: API_URL,
    scriptUrl,
    width: size.width,
    height: size.height,
  });

  // `useHref` + `document.baseURI` resolves correctly under both the browser router and the
  // hash router (ADR-0016 hosting amendment), and under any sub-path — see SlotPage.tsx's
  // `useSlotShareUrl`, which this mirrors.
  const slotHref = useHref(routes.slot(slotId || '1'));
  const slotUrl = new URL(slotHref, document.baseURI).href;
  const badgeUrl = new URL(BADGE_PATH, document.baseURI).href;
  const badgeSnippet = `<a href="${escapeHtmlAttr(slotUrl)}"><img src="${escapeHtmlAttr(badgeUrl)}" alt="Advertise here via OpenAd" width="${BADGE_WIDTH}" height="${BADGE_HEIGHT}"></a>`;

  async function copy() {
    setStatus(await copyText(snippet, preRef.current));
    setTimeout(() => setStatus('idle'), 2000);
  }

  async function copyBadge() {
    setStatus(await copyText(badgeSnippet, badgeRef.current));
    setTimeout(() => setStatus('idle'), 2000);
  }

  const buttonLabel = status === 'copied' ? 'Copied' : status === 'selected' ? 'Selected' : 'Copy';

  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="font-medium">Embed code</h2>
      <p className="mt-2 text-sm text-muted">
        Place this on the publisher page. The embed talks only to the serve API — it never reads the
        chain.
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        <label className="text-sm">
          {/* "Slot to embed", not just "Slot": Supply also has slice D's SlotPerformance panel,
              whose own slot picker is also labelled "Slot" — a shared label would resolve to two
              comboboxes for any accessible-name query on this page. */}
          <span className="block text-muted">Slot to embed</span>
          <select
            value={slotId}
            onChange={(e) => setSlotId(e.target.value)}
            className="mt-1 rounded-lg border border-line bg-canvas px-3 py-1.5 text-ink outline-none"
          >
            {slotIds.map((id) => (
              <option key={id} value={id}>
                Slot #{id}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-muted">Size</span>
          <select
            value={sizeIndex}
            onChange={(e) => setSizeIndex(Number(e.target.value))}
            className="mt-1 rounded-lg border border-line bg-canvas px-3 py-1.5 text-ink outline-none"
          >
            {presets.map((p, i) => (
              <option key={p.label} value={i}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-t-lg px-3 py-1.5 text-sm ${
              tab === t.id ? 'border-b-2 border-accent text-ink' : 'text-muted'
            }`}
            aria-current={tab === t.id}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-3">
        {tab === 'html' && (
          <p className="text-sm text-muted">Paste this anywhere in your page's HTML.</p>
        )}
        {tab === 'wordpress' && (
          <p className="text-sm text-muted">
            Add a <strong>Custom HTML</strong> block wherever you want the ad, and paste the snippet
            below into it.
          </p>
        )}
        {tab === 'ghost' && (
          <p className="text-sm text-muted">
            Add an <strong>HTML card</strong> to your post or page, and paste the snippet below into
            it.
          </p>
        )}
        {tab === 'notion' && (
          <p className="text-sm text-muted">
            Notion and Substack don&apos;t allow custom scripts, so the snippet below won&apos;t run
            there. Use the <strong>Badge</strong> tab instead — a plain link and image work anywhere
            — or link a banner image to your slot page.
          </p>
        )}
        {tab === 'badge' && (
          <p className="text-sm text-muted">
            A plain link and image, no script required. Works on Substack, GitHub READMEs, and
            anywhere else scripts can&apos;t run.
          </p>
        )}

        {tab !== 'badge' && tab !== 'notion' && (
          <div className="mt-3 flex items-start gap-2">
            <pre
              ref={preRef}
              className="flex-1 overflow-x-auto rounded-xl bg-canvas p-3 text-xs text-muted"
            >
              {snippet}
            </pre>
            <button
              type="button"
              onClick={() => void copy()}
              className="shrink-0 rounded-full border border-line px-3 py-1 text-sm text-ink"
            >
              {buttonLabel}
            </button>
          </div>
        )}

        {tab === 'badge' && (
          <div className="mt-3 flex items-start gap-2">
            <pre
              ref={badgeRef}
              className="flex-1 overflow-x-auto rounded-xl bg-canvas p-3 text-xs text-muted"
            >
              {badgeSnippet}
            </pre>
            <button
              type="button"
              onClick={() => void copyBadge()}
              className="shrink-0 rounded-full border border-line px-3 py-1 text-sm text-ink"
            >
              {buttonLabel}
            </button>
          </div>
        )}
      </div>

      <p className="mt-3 text-sm">
        <Link
          to={{ pathname: routes.embedDemo, search: `?slot=${encodeURIComponent(slotId || '1')}` }}
          className="text-accent underline-offset-2 hover:underline"
        >
          Preview this slot →
        </Link>
      </p>
    </section>
  );
}
