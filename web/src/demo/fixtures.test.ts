import { describe, expect, it } from 'vitest';

import { feeSplit } from '../lib/auction';
import { SALE_CPC } from '../lib/labels';
import { computePeriod, seedDemoState } from './fixtures';

const NOW = 1_800_000_000;

describe('seedDemoState', () => {
  it('is deterministic for a fixed now', () => {
    const a = seedDemoState(NOW);
    const b = seedDemoState(NOW);
    expect(a).toEqual(b);
  });

  it('gives every money field as a decimal string of an integer', () => {
    const state = seedDemoState(NOW);
    const moneyPattern = /^\d+$/;
    for (const { slot, leases } of state.slots) {
      if (slot.terms) {
        expect(slot.terms.startPrice).toMatch(moneyPattern);
        expect(slot.terms.floorPrice).toMatch(moneyPattern);
        expect(slot.terms.floorCpc).toMatch(moneyPattern);
      }
      for (const lease of Object.values(leases)) {
        expect(lease.price).toMatch(moneyPattern);
      }
    }
    for (const campaign of Object.values(state.campaigns)) {
      expect(campaign.maxCpc).toMatch(moneyPattern);
      expect(campaign.remaining).toMatch(moneyPattern);
      expect(campaign.budget).toMatch(moneyPattern);
      for (const settlement of campaign.settlements) {
        expect(settlement.charged).toMatch(moneyPattern);
        expect(settlement.fee).toMatch(moneyPattern);
      }
    }
  });

  it('has at least two CPC slots, each with a floorCpc', () => {
    const state = seedDemoState(NOW);
    const cpcSlots = state.slots.filter((s) => s.slot.terms?.saleMode === SALE_CPC);
    expect(cpcSlots.length).toBeGreaterThanOrEqual(2);
    for (const s of cpcSlots) {
      expect(BigInt(s.slot.terms?.floorCpc ?? '0')).toBeGreaterThan(0n);
    }
  });

  it("every LEASE slot's periods (0..14, the widest range the UI queries) are ordered and non-overlapping", () => {
    const state = seedDemoState(NOW);
    for (const { slot, leases } of state.slots) {
      if (slot.calendarVersion === 0) continue;
      const periods = Array.from({ length: 15 }, (_, idx) => computePeriod(slot, leases, idx, NOW));
      for (let i = 1; i < periods.length; i += 1) {
        const prev = periods[i - 1];
        const curr = periods[i];
        if (!prev || !curr) throw new Error('unreachable: index within bounds');
        expect(curr.start).toBeGreaterThanOrEqual(prev.end);
        expect(curr.start).toBeGreaterThan(prev.start);
      }
      for (const p of periods) expect(p.end).toBeGreaterThan(p.start);
    }
  });

  it('demonstrates every period state the demo promises: past leased, current leased, currently auctioning, upcoming, unsold remainder', () => {
    const state = seedDemoState(NOW);
    const all = state.slots
      .filter((s) => s.slot.calendarVersion !== 0)
      .flatMap(({ slot, leases }) =>
        Array.from({ length: 15 }, (_, idx) => computePeriod(slot, leases, idx, NOW)),
      );
    expect(all.some((p) => p.leased && p.end <= NOW)).toBe(true); // past leased
    expect(all.some((p) => p.leased && p.start <= NOW && NOW < p.end)).toBe(true); // current leased
    expect(all.some((p) => p.sellable && p.reason === '')).toBe(true); // currently auctioning (Dutch)
    expect(all.some((p) => !p.leased && p.reason === 'not open')).toBe(true); // upcoming
    expect(all.some((p) => p.sellable && p.reason === 'remainder')).toBe(true); // unsold remainder
  });

  it("publisher payout plus fee equals the sale price for every leased period", () => {
    const state = seedDemoState(NOW);
    for (const { leases } of state.slots) {
      for (const lease of Object.values(leases)) {
        const price = BigInt(lease.price);
        const { fee, publisherAmount } = feeSplit(price);
        expect(fee + publisherAmount).toBe(price);
      }
    }
  });

  it('every creative URI is same-origin under /demo/', () => {
    const state = seedDemoState(NOW);
    for (const creative of Object.values(state.creatives)) {
      expect(creative.uri.startsWith('/demo/')).toBe(true);
    }
  });

  it('includes approved, pending and revoked approval states', () => {
    const state = seedDemoState(NOW);
    const statuses = new Set(state.approvals.map((a) => a.status));
    expect(statuses.has(2)).toBe(true); // approved
    expect(statuses.has(1)).toBe(true); // requested (pending)
    expect(statuses.has(4)).toBe(true); // revoked
  });

  it('has at least one Dutch-phase period genuinely mid-decay (strictly between floor and start)', () => {
    const state = seedDemoState(NOW);
    const midDecay = state.slots
      .filter((s) => s.slot.calendarVersion !== 0)
      .flatMap(({ slot, leases }) =>
        Array.from({ length: 15 }, (_, idx) => computePeriod(slot, leases, idx, NOW)).map((p) => ({
          p,
          slot,
        })),
      )
      .some(({ p, slot }) => {
        if (!p.sellable || p.reason !== '' || !slot.terms) return false;
        const price = BigInt(p.indicativePrice);
        return price > BigInt(slot.terms.floorPrice) && price < BigInt(slot.terms.startPrice);
      });
    expect(midDecay).toBe(true);
  });

  it('has at least one remainder-phase period genuinely mid-decay (strictly between 0 and floor)', () => {
    const state = seedDemoState(NOW);
    const midDecay = state.slots
      .filter((s) => s.slot.calendarVersion !== 0)
      .flatMap(({ slot, leases }) =>
        Array.from({ length: 15 }, (_, idx) => computePeriod(slot, leases, idx, NOW)).map((p) => ({
          p,
          slot,
        })),
      )
      .some(({ p, slot }) => {
        if (!p.sellable || p.reason !== 'remainder' || !slot.terms) return false;
        const price = BigInt(p.indicativePrice);
        return price > 0n && price < BigInt(slot.terms.floorPrice);
      });
    expect(midDecay).toBe(true);
  });

  it('every campaign satisfies budget == remaining + sum(settlements.charged)', () => {
    const state = seedDemoState(NOW);
    for (const campaign of Object.values(state.campaigns)) {
      const chargedTotal = campaign.settlements.reduce((sum, s) => sum + BigInt(s.charged), 0n);
      expect(BigInt(campaign.remaining) + chargedTotal).toBe(BigInt(campaign.budget));
    }
  });

  it('every settlement charges at or below maxCpc per payable click, with fee from feeSplit', () => {
    const state = seedDemoState(NOW);
    for (const campaign of Object.values(state.campaigns)) {
      const maxCpc = BigInt(campaign.maxCpc);
      for (const settlement of campaign.settlements) {
        const charged = BigInt(settlement.charged);
        expect(charged / BigInt(settlement.payableClicks)).toBeLessThanOrEqual(maxCpc);
        expect(settlement.fee).toBe(feeSplit(charged).fee.toString());
      }
    }
  });
});
