import { useState } from 'react';
import { Link, useParams } from 'react-router';

import { withDevWalletParam } from '../../lib/devWalletQuery';
import { FieldHint, GuideLink } from '../../components/FieldHint';
import { formatDuration, formatUnixSeconds, formatUsdc } from '../../lib/format';
import { SALE_CPC, approvalModeLabel, saleModeLabel } from '../../lib/labels';
import { BuyDialog } from './components/BuyDialog';
import { usePeriods, useSlot } from './api';

export function SlotPage() {
  const { slotId = '' } = useParams();
  const slot = useSlot(slotId);
  const periods = usePeriods(slotId);
  const [buy, setBuy] = useState<{ periodIndex: string; remainder: boolean } | null>(null);

  if (slot.isPending) return <p className="text-muted">Loading slot…</p>;
  if (slot.isError || !slot.data) {
    return <p className="text-muted">Slot not found.</p>;
  }

  const s = slot.data;
  const cpc = s.terms?.saleMode === SALE_CPC;

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
