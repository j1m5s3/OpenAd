import { describe, expect, it } from 'vitest';

import type { SlotOut } from './api';
import { auctionOpenAt, auctionState, dutchPrice, feeSplit, remainderPrice } from './auction';

function slot(over: Partial<SlotOut> = {}): SlotOut {
  return {
    slotId: '1',
    owner: '0x' + '11'.repeat(20),
    width: 300,
    height: 250,
    kind: 0,
    domain: 'example.com',
    calendarVersion: 1,
    periodSeconds: 3600,
    firstPeriodStart: 1_000_000,
    terms: {
      startPrice: '10000000',
      floorPrice: '1000000',
      leadSeconds: 3600,
      saleEnd: 0,
      approvalMode: 0,
      saleMode: 0,
      floorCpc: '0',
      paused: false,
    },
    ...over,
  };
}

describe('auctionState', () => {
  it('returns paused when terms are paused', () => {
    expect(
      auctionState(
        slot({
          terms: {
            startPrice: '1',
            floorPrice: '1',
            leadSeconds: 1,
            saleEnd: 0,
            approvalMode: 0,
            saleMode: 0,
            floorCpc: '0',
            paused: true,
          },
        }),
        1_000_000,
      ),
    ).toBe('paused');
  });

  it('classifies upcoming, live, remainder, and ended', () => {
    const s = slot();
    expect(auctionState(s, 1_000_000 - 4000)).toBe('upcoming');
    expect(auctionState(s, 1_000_000 - 10)).toBe('live');
    expect(auctionState(s, 1_000_000 + 10)).toBe('remainder');
    expect(auctionState(s, 1_000_000 + 4000)).toBe('ended');
    expect(auctionOpenAt(s)).toBe(1_000_000 - 3600);
  });

  it('classifies CPC slots without Dutch auction states', () => {
    expect(
      auctionState(
        slot({
          terms: {
            startPrice: '0',
            floorPrice: '0',
            leadSeconds: 0,
            saleEnd: 0,
            approvalMode: 0,
            saleMode: 1,
            floorCpc: '100000',
            paused: false,
          },
        }),
        1_000_000,
      ),
    ).toBe('cpc');
  });
});

describe('dutchPrice', () => {
  it('equals startPrice at openAt and floorPrice at start (PROTOCOL §4.2)', () => {
    const start = 1_000_000;
    const lead = 3600;
    const floor = 1_000_000n;
    const startPrice = 10_000_000n;
    expect(dutchPrice(startPrice, floor, lead, start, start - lead)).toBe(startPrice);
    expect(dutchPrice(startPrice, floor, lead, start, start)).toBe(floor);
  });

  it('clamps to startPrice when now is before openAt (never overshoots)', () => {
    const start = 1_000_000;
    const lead = 3600;
    const openAt = start - lead;
    const startPrice = 10_000_000n;
    const floor = 1_000_000n;
    expect(dutchPrice(startPrice, floor, lead, start, openAt - 100)).toBe(startPrice);
    expect(dutchPrice(startPrice, floor, lead, start, openAt - 10_000)).toBe(startPrice);
  });

  it('is non-increasing as now approaches start', () => {
    const start = 1_000_000;
    const lead = 3600;
    const prices = [start - lead, start - 2700, start - 1800, start - 900, start].map((now) =>
      dutchPrice(10_000_000n, 1_000_000n, lead, start, now),
    );
    for (let i = 1; i < prices.length; i += 1) {
      expect(prices[i]).toBeLessThanOrEqual(prices[i - 1] as bigint);
    }
  });
});

describe('remainderPrice', () => {
  it('equals floorPrice at start and 0 at end (PROTOCOL §4.2)', () => {
    const start = 1_000_000;
    const period = 3600;
    const end = start + period;
    const floor = 400_000n;
    expect(remainderPrice(floor, period, end, start)).toBe(floor);
    expect(remainderPrice(floor, period, end, end)).toBe(0n);
  });
});

describe('feeSplit', () => {
  it('applies the 250 bps default fee and always sums back to price (PROTOCOL §4.3, §11)', () => {
    const price = 3_000_000n;
    const { fee, publisherAmount } = feeSplit(price);
    expect(fee).toBe(75_000n); // 3,000,000 * 250 / 10,000
    expect(fee + publisherAmount).toBe(price);
  });

  it('floors the fee (never rounds up)', () => {
    const { fee, publisherAmount } = feeSplit(3n); // 3 * 250 / 10000 = 0.075 -> 0
    expect(fee).toBe(0n);
    expect(publisherAmount).toBe(3n);
  });
});
