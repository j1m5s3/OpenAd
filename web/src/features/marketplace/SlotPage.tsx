import { useState } from 'react';
import { useParams } from 'react-router';

import { formatUnixSeconds, formatUsdc } from '../../lib/format';
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

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-accent">Slot #{s.slotId}</p>
        <h1 className="mt-1 text-3xl font-semibold">{s.domain}</h1>
        <p className="mt-2 text-muted">
          {s.width}×{s.height} · publisher {s.owner}
        </p>
        {s.terms && (
          <p className="mt-2">
            {formatUsdc(BigInt(s.terms.startPrice))} → {formatUsdc(BigInt(s.terms.floorPrice))} ·
            lead {s.terms.leadSeconds}s
          </p>
        )}
      </div>

      <section className="overflow-hidden rounded-2xl border border-line bg-surface">
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
              return (
                <tr key={p.periodIndex} className="border-t border-line">
                  <td className="px-4 py-3">{p.periodIndex}</td>
                  <td className="px-4 py-3 text-muted">
                    {formatUnixSeconds(p.start)} → {formatUnixSeconds(p.end)}
                  </td>
                  <td className="px-4 py-3">{p.leased ? 'leased' : p.reason || 'open'}</td>
                  <td className="px-4 py-3">
                    {p.indicativePrice === '0' ? '—' : formatUsdc(BigInt(p.indicativePrice))}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      className="rounded-full bg-accent px-3 py-1 text-accent-ink disabled:opacity-40"
                      disabled={p.leased}
                      onClick={() => setBuy({ periodIndex: p.periodIndex, remainder })}
                    >
                      Buy
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

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
