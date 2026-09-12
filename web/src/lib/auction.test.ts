import { describe, expect, it } from 'vitest';

import type { SlotOut } from './api';
import { auctionOpenAt, auctionState } from './auction';

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
});
