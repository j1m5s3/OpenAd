// Pure helpers for the analytics read model (ROADMAP 6.4, PLAN D4). Money in and out is a
// decimal string of integer USDC base units — parsed with `BigInt`, never `Number` — except for
// chart y-scaling, which only needs relative magnitude and converts through cents at the end.
import { formatUsdc } from './format';
import type { AnalyticsTotals, DailyBucket } from './api';

/** `ctr_bps` → "1.23%", or "—" when the API returned `null` (zero impressions). */
export function ctrPercent(bps: number | null): string {
  if (bps === null) return '—';
  return `${(bps / 100).toFixed(2)}%`;
}

/** Whether `totals` shows any CPC activity: settled spend, accrued spend, or a payable click.
 * A LEASE creative's click goes straight to the advertiser's own URL — there is no click event
 * to track — so `clicksPayable` (and therefore `ctrBps`) is genuinely always 0 for a slot with
 * no CPC activity, not merely absent. `ctrDisplay` uses this to read "—" rather than a
 * misleading "0.00%" in that case. */
export function hasCpcActivity(totals: AnalyticsTotals): boolean {
  return (
    totals.cpcSettledSpend !== '0' || totals.accruedCpcSpend !== '0' || totals.clicksPayable > 0
  );
}

/** CTR for display: "—" with a "not tracked for leases" hint when there is no CPC activity to
 * measure a click-through rate from, otherwise `ctrPercent(totals.ctrBps)`. `hint` is `''`
 * (never `undefined`) when there is none, so callers can pass it straight to `StatTile`, whose
 * `{hint && ...}` treats an empty string the same as absent. */
export function ctrDisplay(totals: AnalyticsTotals): { value: string; hint: string } {
  if (!hasCpcActivity(totals)) return { value: '—', hint: 'not tracked for leases' };
  return { value: ctrPercent(totals.ctrBps), hint: '' };
}

/** `ecpm` (integer USDC base units per 1000 impressions) → a formatted USDC string, or "—". */
export function ecpmUsd(ecpm: number | null): string {
  if (ecpm === null) return '—';
  return formatUsdc(BigInt(Math.trunc(ecpm)));
}

/** Sums decimal-string base-unit amounts without ever going through `Number`. */
export function sumBig(...values: (string | null | undefined)[]): bigint {
  return values.reduce<bigint>((total, v) => total + (v ? BigInt(v) : 0n), 0n);
}

/** Extracts one count field of `daily` as a plain number series for the sparkline. */
export function series(
  daily: readonly DailyBucket[],
  key: 'impressions' | 'houseServes' | 'clicksPayable' | 'clicksInvalid',
): number[] {
  return daily.map((d) => d[key]);
}

/** A day's combined "spend incl. unsettled" (lease + accrued CPC), in whole cents — the one
 * place settled and accrued CPC spend meet, and only for a per-day chart series (PLAN D4: never
 * summed in totals). */
export function combinedSpendSeries(daily: readonly DailyBucket[]): number[] {
  return daily.map((d) => Number((BigInt(d.leaseSpend) + BigInt(d.accruedCpcSpend)) / 10_000n));
}

export type WindowPreset = '7d' | '30d' | '90d';

const DAY_SECONDS = 86_400;
const PRESET_DAYS: Record<WindowPreset, number> = { '7d': 7, '30d': 30, '90d': 90 };

/** `{from, to}` for a preset window ending "now" (Unix seconds), matching the API's own
 * defaulting/rejection rules (`resolve_window`, PLAN D4: max 90 days). */
export function windowPreset(preset: WindowPreset, now: number): { from: number; to: number } {
  return { from: now - PRESET_DAYS[preset] * DAY_SECONDS, to: now };
}
