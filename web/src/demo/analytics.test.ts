import { describe, expect, it } from 'vitest';

import { ApiError } from '../lib/api';
import { advertiserAnalytics, slotAnalytics } from './analytics';
import { feeSplit } from '../lib/auction';
import { DEMO_PERSONAS, seedDemoState } from './fixtures';

const NOW = 1_800_000_000; // fixed instant so fixture-derived assertions are stable

describe('slotAnalytics', () => {
  it('is deterministic for a fixed now', () => {
    const state = seedDemoState(NOW);
    const a = slotAnalytics(state, '0', undefined, undefined, NOW);
    const b = slotAnalytics(state, '0', undefined, undefined, NOW);
    expect(a).toEqual(b);
  });

  it('keeps lease earnings + fee == lease spend', () => {
    const state = seedDemoState(NOW);
    const { totals } = slotAnalytics(state, '0', undefined, undefined, NOW);
    expect(BigInt(totals.leaseEarnings) + BigInt(totals.leaseFee)).toBe(BigInt(totals.leaseSpend));
  });

  it('never sums settled and accrued CPC spend into one total', () => {
    const state = seedDemoState(NOW);
    const { totals } = slotAnalytics(state, '1', undefined, undefined, NOW); // CPC slot
    // Both fields exist independently and are never combined into a third total field.
    expect(totals).toHaveProperty('cpcSettledSpend');
    expect(totals).toHaveProperty('accruedCpcSpend');
    expect(Object.keys(totals)).not.toContain('totalCpcSpend');
  });

  it('rejects a window over 90 days, like the API', () => {
    const state = seedDemoState(NOW);
    expect(() => slotAnalytics(state, '0', NOW - 91 * 86_400, NOW, NOW)).toThrow(ApiError);
    try {
      slotAnalytics(state, '0', NOW - 91 * 86_400, NOW, NOW);
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).status).toBe(422);
      expect((e as ApiError).code).toBe('invalid_window');
    }
  });

  it('rejects an inverted window', () => {
    const state = seedDemoState(NOW);
    expect(() => slotAnalytics(state, '0', NOW, NOW - 86_400, NOW)).toThrow(ApiError);
  });

  it('404s for an unknown slot', () => {
    const state = seedDemoState(NOW);
    expect(() => slotAnalytics(state, '999', undefined, undefined, NOW)).toThrow(ApiError);
  });

  it('has zero daily impressions before the slot ever had a lease', () => {
    const state = seedDemoState(NOW);
    // A far-past window entirely before the seeded lease history.
    const { daily } = slotAnalytics(state, '0', NOW - 400 * 86_400, NOW - 370 * 86_400, NOW);
    expect(daily.every((d) => d.impressions === 0)).toBe(true);
  });

  it('never invents clicks on a LEASE slot: a LEASE creative has no click_events', () => {
    const state = seedDemoState(NOW);
    const { totals, daily } = slotAnalytics(state, '0', undefined, undefined, NOW); // LEASE slot
    expect(totals.impressions).toBeGreaterThan(0); // traffic does exist for this slot/window
    expect(totals.clicksPayable).toBe(0);
    expect(totals.clicksInvalid).toBe(0);
    expect(totals.clicksInvalidByReason).toEqual({});
    // ctrBps is 0 (not null): impressions exist, there are just never any payable clicks to
    // count on a LEASE slot — the UI reads this as "—, not tracked for leases" (lib/analytics.ts).
    expect(totals.ctrBps).toBe(0);
    expect(daily.every((d) => d.clicksPayable === 0 && d.clicksInvalid === 0)).toBe(true);
  });
});

describe('advertiserAnalytics', () => {
  it('is deterministic for a fixed now', () => {
    const state = seedDemoState(NOW);
    const addr = DEMO_PERSONAS.advertiserWallet.address;
    const a = advertiserAnalytics(state, addr, undefined, undefined, NOW);
    const b = advertiserAnalytics(state, addr, undefined, undefined, NOW);
    expect(a).toEqual(b);
  });

  it('rejects a window over 90 days, like the API', () => {
    const state = seedDemoState(NOW);
    const addr = DEMO_PERSONAS.advertiserWallet.address;
    expect(() => advertiserAnalytics(state, addr, NOW - 91 * 86_400, NOW, NOW)).toThrow(ApiError);
  });

  it('attributes lease spend from the store, matching feeSplit', () => {
    const state = seedDemoState(NOW);
    const addr = DEMO_PERSONAS.advertiserWallet.address;
    const { totals } = advertiserAnalytics(state, addr, undefined, undefined, NOW);
    const fixture = state.slots.find((s) => s.slot.slotId === '0')!;
    const lease = fixture.leases[3]!; // seeded current lease, lessee = advertiserWallet
    const { fee } = feeSplit(BigInt(lease.price));
    expect(BigInt(totals.leaseFee)).toBeGreaterThanOrEqual(fee); // at least this lease's fee
  });

  it('reports each spend slot once in by_slot, matching leases/campaigns owned by the address', () => {
    const state = seedDemoState(NOW);
    const addr = DEMO_PERSONAS.advertiserWallet.address;
    const { bySlot } = advertiserAnalytics(state, addr, undefined, undefined, NOW);
    const slotIds = bySlot.map((r) => r.slotId);
    expect(new Set(slotIds).size).toBe(slotIds.length);
  });

  it('sums by_slot to exactly leaseSpend + cpcSettledSpend, never including accrued CPC', () => {
    const state = seedDemoState(NOW);
    const addr = DEMO_PERSONAS.advertiserWallet.address; // has a CPC campaign, so accrued > 0
    const { totals, bySlot } = advertiserAnalytics(state, addr, undefined, undefined, NOW);
    expect(BigInt(totals.accruedCpcSpend)).toBeGreaterThan(0n); // the case this test guards against
    const bySlotTotal = bySlot.reduce((sum, r) => sum + BigInt(r.spend), 0n);
    expect(bySlotTotal).toBe(BigInt(totals.leaseSpend) + BigInt(totals.cpcSettledSpend));
  });

  it('sorts by_slot by spend descending and caps it at 10 rows', () => {
    const state = seedDemoState(NOW);
    const addr = DEMO_PERSONAS.advertiserWallet.address;
    const { bySlot } = advertiserAnalytics(state, addr, undefined, undefined, NOW);
    expect(bySlot.length).toBeLessThanOrEqual(10);
    for (let i = 1; i < bySlot.length; i += 1) {
      expect(BigInt(bySlot[i - 1]!.spend)).toBeGreaterThanOrEqual(BigInt(bySlot[i]!.spend));
    }
  });
});
