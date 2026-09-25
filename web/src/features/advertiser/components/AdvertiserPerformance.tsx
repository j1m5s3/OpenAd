import { useState } from 'react';
import { Link } from 'react-router';

import type { AdvertiserAnalyticsOut } from '../../../lib/api';
import { Sparkline } from '../../../components/Sparkline';
import { StatTile } from '../../../components/StatTile';
import {
  combinedSpendSeries,
  ctrDisplay,
  ecpmUsd,
  sumBig,
  type WindowPreset,
} from '../../../lib/analytics';
import { formatUsdc } from '../../../lib/format';
import { useAdvertiserAnalytics } from '../api';

const PRESETS: WindowPreset[] = ['7d', '30d', '90d'];

/** Advertiser performance across every slot (PLAN 21+22). Spend (LEASE + CPC settled) and
 * "Accrued CPC" are kept separate everywhere except the daily spend sparkline, which is labelled
 * "incl. unsettled" — the one place the two meet. */
export function AdvertiserPerformance({ address }: { address: string | undefined }) {
  const [preset, setPreset] = useState<WindowPreset>('30d');
  const q = useAdvertiserAnalytics(address, preset);

  if (!address) return null;

  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-medium">Performance</h2>
        <WindowToggle preset={preset} onChange={setPreset} />
      </div>
      {q.isLoading && <p className="mt-3 text-sm text-muted">Loading performance…</p>}
      {q.isError && (
        <p className="mt-3 text-sm text-muted">
          Could not load performance: {q.error instanceof Error ? q.error.message : 'unknown error'}
        </p>
      )}
      {q.data && <Body data={q.data} />}
    </section>
  );
}

function WindowToggle({
  preset,
  onChange,
}: {
  preset: WindowPreset;
  onChange: (p: WindowPreset) => void;
}) {
  return (
    <div className="flex gap-1 text-xs">
      {PRESETS.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          aria-pressed={preset === p}
          className={`rounded-full px-2 py-1 ${
            preset === p ? 'bg-accent text-accent-ink' : 'border border-line text-muted'
          }`}
        >
          {p}
        </button>
      ))}
    </div>
  );
}

function Body({ data }: { data: AdvertiserAnalyticsOut }) {
  const { totals, daily, bySlot } = data;
  const spend = sumBig(totals.leaseSpend, totals.cpcSettledSpend);
  const topSlots = [...bySlot]
    .sort((a, b) => Number(BigInt(b.spend) - BigInt(a.spend)))
    .slice(0, 5);
  const ctr = ctrDisplay(totals);

  return (
    <div className="mt-4 space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Impressions" value={totals.impressions.toLocaleString('en-US')} />
        <StatTile label="Payable clicks" value={totals.clicksPayable.toLocaleString('en-US')} />
        <StatTile label="CTR" value={ctr.value} hint={ctr.hint} />
        <StatTile label="eCPM paid" value={ecpmUsd(totals.ecpm)} />
        <StatTile
          label="Spend"
          value={formatUsdc(spend)}
          hint="lease (window) + CPC settled (all-time)"
        />
        <StatTile
          label="Accrued CPC"
          value={formatUsdc(BigInt(totals.accruedCpcSpend))}
          hint="unsettled — not yet spend"
        />
      </div>
      <div>
        <p className="text-xs text-muted">Daily spend (incl. unsettled)</p>
        <Sparkline values={combinedSpendSeries(daily)} label="daily spend including unsettled" />
      </div>
      <div>
        <p className="text-xs text-muted">Top slots by spend</p>
        {topSlots.length === 0 ? (
          <p className="mt-1 text-sm text-muted">No spend yet.</p>
        ) : (
          <table className="mt-1 w-full text-sm">
            <tbody>
              {topSlots.map((row) => (
                <tr key={row.slotId} className="border-t border-line">
                  <td className="py-1">
                    <Link to={`/slots/${row.slotId}`} className="text-accent underline">
                      Slot {row.slotId}
                    </Link>
                  </td>
                  <td className="py-1 text-right">{formatUsdc(BigInt(row.spend))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
