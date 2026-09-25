import { describe, expect, it } from 'vitest';

import {
  combinedSpendSeries,
  ctrDisplay,
  ctrPercent,
  ecpmUsd,
  hasCpcActivity,
  series,
  sumBig,
  windowPreset,
} from './analytics';
import type { AnalyticsTotals, DailyBucket } from './api';

describe('ctrPercent', () => {
  it('formats basis points as a percentage, and null as an em dash', () => {
    expect(ctrPercent(123)).toBe('1.23%');
    expect(ctrPercent(0)).toBe('0.00%');
    expect(ctrPercent(null)).toBe('—');
  });
});

function totals(overrides: Partial<AnalyticsTotals> = {}): AnalyticsTotals {
  return {
    impressions: 0,
    houseServes: 0,
    clicksPayable: 0,
    clicksInvalid: 0,
    ctrBps: null,
    ecpm: null,
    leaseSpend: '0',
    leaseFee: '0',
    leaseEarnings: '0',
    cpcSettledSpend: '0',
    cpcSettledFee: '0',
    cpcSettledEarnings: '0',
    accruedCpcSpend: '0',
    invalidOriginServes: 0,
    clicksInvalidByReason: {},
    ...overrides,
  };
}

describe('hasCpcActivity', () => {
  it('is false for a LEASE-only slot with no CPC settled/accrued/clicks', () => {
    expect(hasCpcActivity(totals({ impressions: 500, ctrBps: 0 }))).toBe(false);
  });

  it('is true when there is settled spend, accrued spend, or a payable click', () => {
    expect(hasCpcActivity(totals({ cpcSettledSpend: '1' }))).toBe(true);
    expect(hasCpcActivity(totals({ accruedCpcSpend: '1' }))).toBe(true);
    expect(hasCpcActivity(totals({ clicksPayable: 1 }))).toBe(true);
  });
});

describe('ctrDisplay', () => {
  it('reads "—" with a not-tracked hint for a LEASE-only slot (real ctrBps 0, not null)', () => {
    expect(ctrDisplay(totals({ impressions: 500, ctrBps: 0 }))).toEqual({
      value: '—',
      hint: 'not tracked for leases',
    });
  });

  it('reads the real percentage once there is CPC activity', () => {
    expect(ctrDisplay(totals({ clicksPayable: 10, ctrBps: 250 }))).toEqual({
      value: '2.50%',
      hint: '',
    });
  });
});

describe('ecpmUsd', () => {
  it('formats an integer eCPM as USDC, and null as an em dash', () => {
    expect(ecpmUsd(5_000_000)).toBe('5.00 USDC');
    expect(ecpmUsd(null)).toBe('—');
  });
});

describe('sumBig', () => {
  it('sums decimal-string base units without Number, treating null/undefined as zero', () => {
    expect(sumBig('1000000', '2000000')).toBe(3_000_000n);
    expect(sumBig('1', null, undefined, '2')).toBe(3n);
    expect(sumBig()).toBe(0n);
  });
});

function bucket(overrides: Partial<DailyBucket> = {}): DailyBucket {
  return {
    dayStart: 0,
    impressions: 0,
    houseServes: 0,
    clicksPayable: 0,
    clicksInvalid: 0,
    leaseSpend: '0',
    accruedCpcSpend: '0',
    ...overrides,
  };
}

describe('series', () => {
  it('extracts a plain-number count field', () => {
    const daily = [bucket({ impressions: 10 }), bucket({ impressions: 20 })];
    expect(series(daily, 'impressions')).toEqual([10, 20]);
  });
});

describe('combinedSpendSeries', () => {
  it('sums lease + accrued per day, in whole cents', () => {
    const daily = [bucket({ leaseSpend: '1000000', accruedCpcSpend: '500000' })];
    expect(combinedSpendSeries(daily)).toEqual([150]);
  });
});

describe('windowPreset', () => {
  it('computes {from,to} for 7d/30d/90d ending now', () => {
    const now = 1_700_000_000;
    expect(windowPreset('7d', now)).toEqual({ from: now - 7 * 86_400, to: now });
    expect(windowPreset('30d', now)).toEqual({ from: now - 30 * 86_400, to: now });
    expect(windowPreset('90d', now)).toEqual({ from: now - 90 * 86_400, to: now });
  });
});
