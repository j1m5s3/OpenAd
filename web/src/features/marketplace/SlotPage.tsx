import { useEffect, useRef, useState } from 'react';
import { Link, useHref, useParams } from 'react-router';

import { routes } from '../../app/paths';
import { withDevWalletParam } from '../../lib/devWalletQuery';
import { FieldHint, GuideLink } from '../../components/FieldHint';
import { formatDuration, formatUnixSeconds, formatUsdc } from '../../lib/format';
import { SALE_CPC, approvalModeLabel, saleModeLabel } from '../../lib/labels';
import { categoryLabel } from '../../lib/listingTaxonomy';
import { BuyDialog } from './components/BuyDialog';
import { usePeriods, useSlot } from './api';

/** Absolute page URL for `slotId`. `useHref` resolves it the same way `<Link>` would — `#/…`
 * under the hash router (ADR-0016 hosting amendment), a plain path otherwise — so joining it
 * against `document.baseURI` (which already reflects any sub-path base) gives a correct,
 * shareable absolute URL either way. */
function useSlotShareUrl(slotId: string): string {
  const href = useHref(routes.slot(slotId));
  return new URL(href, document.baseURI).href;
}

export function SlotPage() {
  const { slotId = '' } = useParams();
  const slot = useSlot(slotId);
  const periods = usePeriods(slotId);
  const [buy, setBuy] = useState<{ periodIndex: string; remainder: boolean } | null>(null);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'selected'>('idle');
  const linkInputRef = useRef<HTMLInputElement>(null);
  const slotUrl = useSlotShareUrl(slotId);
  const domain = slot.data?.domain;

  useEffect(() => {
    if (!domain) return;
    const previous = document.title;
    document.title = `${domain} — ad slot on OpenAd`;
    return () => {
      document.title = previous;
    };
  }, [domain]);

  if (slot.isPending) return <p className="text-muted">Loading slot…</p>;
  if (slot.isError || !slot.data) {
    return <p className="text-muted">Slot not found.</p>;
  }

  const s = slot.data;
  const cpc = s.terms?.saleMode === SALE_CPC;
  const nextOpenPeriod = (periods.data?.items ?? []).find((p) => !p.leased && p.sellable);
  const tweetText = `Advertise on ${s.domain} via OpenAd`;
  const xIntentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent(slotUrl)}`;
  const farcasterIntentUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(`${tweetText} ${slotUrl}`)}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(slotUrl);
      setCopyStatus('copied');
    } catch {
      linkInputRef.current?.select();
      setCopyStatus('selected');
    }
    setTimeout(() => setCopyStatus('idle'), 2000);
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-accent">Slot #{s.slotId}</p>
        <h1 className="mt-1 text-3xl font-semibold">{s.domain}</h1>
        <p className="mt-2 text-muted">
          {s.width}×{s.height} · publisher {s.owner}
        </p>
        {s.terms && cpc && (
          <p className="mt-2 inline-flex flex-wrap items-center gap-1">
            {saleModeLabel(SALE_CPC)} · floor {formatUsdc(BigInt(s.terms.floorCpc ?? '0'))}
            {s.terms.approvalMode === 1 ? ' · approval waived' : ' · approval required'}
            <FieldHint hintKey="floorCpc" />
          </p>
        )}
        {s.terms && !cpc && (
          <p className="mt-2 inline-flex flex-wrap items-center gap-1">
            {formatUsdc(BigInt(s.terms.startPrice))} → {formatUsdc(BigInt(s.terms.floorPrice))} ·
            lead {formatDuration(s.terms.leadSeconds)}
            {s.terms.approvalMode === 1
              ? ` · ${approvalModeLabel(1).toLowerCase()}`
              : ` · ${approvalModeLabel(0).toLowerCase()}`}
            <FieldHint hintKey="saleMode" />
          </p>
        )}
      </div>

      {s.listing && (
        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="font-medium">About this audience</h2>
          <p className="mt-1 text-xs uppercase tracking-wide text-muted">Publisher-provided</p>
          {s.listing.summary && <p className="mt-2">{s.listing.summary}</p>}
          {s.listing.audience && <p className="mt-2 text-sm text-muted">{s.listing.audience}</p>}
          {s.listing.categories.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {s.listing.categories.map((c) => (
                <span
                  key={c}
                  className="rounded-full border border-line px-2 py-0.5 text-xs text-muted"
                >
                  {categoryLabel(c)}
                </span>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="font-medium">Share this slot</h2>
        <p className="mt-2 text-sm text-muted">
          {nextOpenPeriod
            ? `Next open period ${formatUnixSeconds(nextOpenPeriod.start)}, from ${formatUsdc(BigInt(nextOpenPeriod.indicativePrice))}.`
            : 'Advertise here — reach this page’s audience directly, non-custodially, in one transaction.'}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            ref={linkInputRef}
            readOnly
            value={slotUrl}
            aria-label="Slot page URL"
            className="min-w-0 flex-1 rounded-lg border border-line bg-canvas px-3 py-1.5 text-xs text-muted"
            onFocus={(e) => e.currentTarget.select()}
          />
          <button
            type="button"
            onClick={() => void copyLink()}
            className="shrink-0 rounded-full border border-line px-3 py-1 text-sm text-ink"
          >
            {copyStatus === 'copied'
              ? 'Copied'
              : copyStatus === 'selected'
                ? 'Selected'
                : 'Copy link'}
          </button>
          <a
            href={xIntentUrl}
            target="_blank"
            rel="noopener"
            className="rounded-full border border-line px-3 py-1 text-sm text-ink"
          >
            Share on X
          </a>
          <a
            href={farcasterIntentUrl}
            target="_blank"
            rel="noopener"
            className="rounded-full border border-line px-3 py-1 text-sm text-ink"
          >
            Share on Farcaster
          </a>
        </div>
      </section>

      {cpc ? (
        <section className="rounded-2xl border border-line bg-surface p-5 text-sm text-muted">
          This slot is CPC. Advertisers fund campaigns from Campaigns — there is no period buy.{' '}
          <Link
            to={withDevWalletParam('/campaigns')}
            className="text-accent underline-offset-2 hover:underline"
          >
            Open a campaign
          </Link>
          . <GuideLink path="advertiser/cpc-campaigns">Learn more</GuideLink>
        </section>
      ) : (
        <section className="overflow-x-auto overflow-hidden rounded-2xl border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Period</th>
                <th className="px-4 py-3 font-medium">Window</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Price</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {(periods.data?.items ?? []).map((p) => {
                const remainder = p.reason === 'remainder';
                const canBuy = !p.leased && p.sellable;
                return (
                  <tr key={p.periodIndex} className="border-t border-line">
                    <td className="px-4 py-3">{p.periodIndex}</td>
                    <td className="px-4 py-3 text-muted">
                      {formatUnixSeconds(p.start)} → {formatUnixSeconds(p.end)}
                    </td>
                    <td className="px-4 py-3">{p.leased ? 'Leased' : p.reason || 'Open'}</td>
                    <td className="px-4 py-3">
                      {p.indicativePrice === '0' ? '—' : formatUsdc(BigInt(p.indicativePrice))}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        className="rounded-full bg-accent px-3 py-1 text-accent-ink disabled:opacity-40"
                        disabled={!canBuy}
                        onClick={() => setBuy({ periodIndex: p.periodIndex, remainder })}
                      >
                        {p.leased ? 'Leased' : canBuy ? 'Buy' : p.reason || 'Closed'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {buy && (
        <BuyDialog
          slotId={slotId}
          periodIndex={buy.periodIndex}
          remainder={buy.remainder}
          onClose={() => setBuy(null)}
        />
      )}
    </div>
  );
}
