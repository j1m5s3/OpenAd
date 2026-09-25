import { useEffect, useState } from 'react';

import { Sparkline } from '../../../components/Sparkline';
import { StatTile } from '../../../components/StatTile';
import { ctrDisplay, ecpmUsd, series, sumBig, type WindowPreset } from '../../../lib/analytics';
import { formatUsdc } from '../../../lib/format';
import { useSlotAnalytics } from '../api';

const PRESETS: WindowPreset[] = ['7d', '30d', '90d'];

/** Publisher performance for one slot at a time (PLAN 21+22). Impressions, CTR, eCPM (earnings-
 * based) and Earnings (LEASE + CPC settled) are real numbers; "Accrued CPC (unsettled)" is kept
 * separate and clearly labelled, never summed into Earnings. */
export function SlotPerformance({ slotIds }: { slotIds: string[] }) {
  const [slotId, setSlotId] = useState<string | undefined>(slotIds[0]);
  const [preset, setPreset] = useState<WindowPreset>('30d');

  useEffect(() => {
    if ((!slotId || !slotIds.includes(slotId)) && slotIds[0]) setSlotId(slotIds[0]);
  }, [slotIds, slotId]);

  if (slotIds.length === 0) {
    return (
      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="font-medium">Performance</h2>
        <p className="mt-2 text-sm text-muted">Mint a slot to see its performance here.</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-medium">Performance</h2>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted">
            Slot
            <select
              value={slotId}
              onChange={(e) => setSlotId(e.target.value)}
              className="rounded-lg border border-line bg-canvas px-2 py-1"
            >
              {slotIds.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
          <WindowToggle preset={preset} onChange={setPreset} />
        </div>
      </div>
      {slotId && <SlotPerformanceBody slotId={slotId} preset={preset} />}
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

function SlotPerformanceBody({ slotId, preset }: { slotId: string; preset: WindowPreset }) {
  const q = useSlotAnalytics(slotId, preset);

  if (q.isLoading) return <p className="mt-3 text-sm text-muted">Loading performance…</p>;
  if (q.isError)
    return (
      <p className="mt-3 text-sm text-muted">
        Could not load performance: {q.error instanceof Error ? q.error.message : 'unknown error'}
      </p>
    );
  const data = q.data;
  if (!data) return null;
  const { totals, daily } = data;
  const earnings = sumBig(totals.leaseEarnings, totals.cpcSettledEarnings);
  const invalidReasons = Object.entries(totals.clicksInvalidByReason);
  const ctr = ctrDisplay(totals);

  return (
    <div className="mt-4 space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Impressions" value={totals.impressions.toLocaleString('en-US')} />
        <StatTile label="CTR" value={ctr.value} hint={ctr.hint} />
        <StatTile label="eCPM" value={ecpmUsd(totals.ecpm)} hint="earnings-based" />
        <StatTile
          label="Earnings"
          value={formatUsdc(earnings)}
          hint="lease (window) + CPC settled (all-time)"
        />
        <StatTile
          label="Accrued CPC"
          value={formatUsdc(BigInt(totals.accruedCpcSpend))}
          hint="unsettled — not yet earnings"
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs text-muted">Daily impressions</p>
          <Sparkline values={series(daily, 'impressions')} label="daily impressions" />
        </div>
        <div>
          <p className="text-xs text-muted">Daily clicks (payable)</p>
          <Sparkline values={series(daily, 'clicksPayable')} label="daily payable clicks" />
        </div>
      </div>
      <p className="text-xs text-muted">
        House serves {totals.houseServes} · invalid-origin serves {totals.invalidOriginServes} ·
        invalid clicks {totals.clicksInvalid}
        {invalidReasons.length > 0 && (
          <> ({invalidReasons.map(([reason, count]) => `${reason}: ${count}`).join(', ')})</>
        )}
      </p>
    </div>
  );
}
