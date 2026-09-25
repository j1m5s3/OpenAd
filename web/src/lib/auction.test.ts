import { describe, expect, it } from 'vitest';

import type { SlotOut } from './api';
import type { AuctionStatus } from './auction';
import {
  auctionState,
  auctionStatus,
  dutchPrice,
  feeSplit,
  periodsWindowSize,
  remainderPrice,
} from './auction';

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

  it('is a thin wrapper over auctionStatus(...).state', () => {
    const s = slot();
    for (const now of [900_000, 996_400, 1_000_000, 1_003_600, 1_010_000]) {
      expect(auctionState(s, now)).toBe(auctionStatus(s, now).state);
    }
  });
});

// -------------------------------------------------------------------------------------------
// auctionStatus: the open-ended calendar (PLAN step 40). Periods are unbounded upward
// (PROTOCOL §4.1); the sale horizon is bounded only by `leadSeconds` and, optionally, `saleEnd`
// — never by the first period alone, which is the bug this replaces (`auctionState` used to read
// 'ended' one period after the first, even when `saleEnd == 0`).
// -------------------------------------------------------------------------------------------

const P = 3600; // periodSeconds
const S0 = 1_000_000; // firstPeriodStart

/** A LEASE slot with a calendar, overridable terms and schedule. */
function calSlot(
  termsOver: Partial<NonNullable<SlotOut['terms']>> = {},
  slotOver: Partial<SlotOut> = {},
): SlotOut {
  return slot({
    periodSeconds: P,
    firstPeriodStart: S0,
    calendarVersion: 1,
    terms: {
      startPrice: '10000000',
      floorPrice: '1000000',
      leadSeconds: P,
      saleEnd: 0,
      approvalMode: 0,
      saleMode: 0,
      floorCpc: '0',
      paused: false,
      ...termsOver,
    },
    ...slotOver,
  });
}

describe('auctionStatus: table', () => {
  it('never reads "ended" when saleEnd is 0, arbitrarily far into the calendar', () => {
    const s = calSlot();
    for (const k of [0, 1, 1000]) {
      expect(auctionStatus(s, S0 + k * P + 1).state).not.toBe('ended');
    }
  });

  it('leadSeconds < periodSeconds: remainder while waiting, live once the next period opens', () => {
    const lead = P / 2;
    const s = calSlot({ leadSeconds: lead });
    const nextOpensAt = S0 + P - lead; // open(1) = start(1) - lead
    expect(auctionStatus(s, nextOpensAt - 1).state).toBe('remainder');
    expect(auctionStatus(s, nextOpensAt).state).toBe('live'); // now == open_next -> live
    expect(auctionStatus(s, nextOpensAt + 1).state).toBe('live');
  });

  it('leadSeconds == periodSeconds (the demo case): live throughout, from open(0) onward', () => {
    const s = calSlot({ leadSeconds: P });
    const open0 = S0 - P;
    expect(auctionStatus(s, open0 - 1).state).toBe('upcoming');
    expect(auctionStatus(s, open0).state).toBe('live');
    expect(auctionStatus(s, S0).state).toBe('live');
    expect(auctionStatus(s, S0 + 500 * P).state).toBe('live');
  });

  it('leadSeconds > periodSeconds (2.5x): overlapping windows read live, current and next both set', () => {
    const lead = Math.floor(2.5 * P);
    const s = calSlot({ leadSeconds: lead });
    const status = auctionStatus(s, S0); // period 0 just started; period 1's lead window is open
    expect(status.state).toBe('live');
    expect(status.current).toBe(0);
    expect(status.next).toBe(1);
  });

  it('saleEnd before the first period even fits (E < S0 + P): always ended', () => {
    const s = calSlot({ saleEnd: S0 + 100 }); // kLast = floor(100 / P) - 1 = -1
    expect(auctionStatus(s, S0 - 10 * P).state).toBe('ended'); // even before the calendar starts
    expect(auctionStatus(s, S0).state).toBe('ended');
  });

  it('saleEnd after 2 periods: the last one reports no next, then ends exactly at its close', () => {
    const saleEnd = S0 + 2 * P; // periods 0 and 1 fit (kLast = 1); period 2 does not
    const s = calSlot({ leadSeconds: P / 2, saleEnd });
    const status = auctionStatus(s, saleEnd - 1); // still inside period 1, the last one
    expect(status.state).toBe('remainder');
    expect(status.current).toBe(1);
    expect(status.next).toBeUndefined();
    expect(status.opensAt).toBeUndefined();
    expect(status.endsAt).toBe(saleEnd);
    expect(auctionStatus(s, saleEnd).state).toBe('ended'); // now == end(kLast) -> ended
  });

  it('now == start(k): the period that just started is current, not the one before it', () => {
    const s = calSlot({ leadSeconds: P / 2 });
    const status = auctionStatus(s, S0 + P); // start(1)
    expect(status.state).toBe('remainder');
    expect(status.current).toBe(1);
  });

  it('open(0) saturates at 0 when leadSeconds exceeds firstPeriodStart', () => {
    const s = calSlot({ leadSeconds: 3600 }, { firstPeriodStart: 100, periodSeconds: P });
    // open_0 = max(0, 100 - 3600) = 0: the live/upcoming boundary sits at now == 0.
    expect(auctionStatus(s, -1).state).toBe('upcoming');
    expect(auctionStatus(s, 0).state).toBe('live');
  });

  it('LEASE with leadSeconds <= 0, or no terms at all, reads "no terms" (not "paused")', () => {
    expect(auctionStatus(calSlot({ leadSeconds: 0 }), S0).state).toBe('no terms');
    expect(auctionStatus(slot({ terms: null }), S0).state).toBe('no terms');
  });

  it('paused is checked before the calendar', () => {
    expect(auctionStatus(calSlot({ paused: true }), S0).state).toBe('paused');
  });

  it('a CPC slot always reads "cpc", with no calendar needed', () => {
    const s = calSlot(
      { saleMode: 1, leadSeconds: 0, floorCpc: '1000' },
      { calendarVersion: 0, periodSeconds: null, firstPeriodStart: null },
    );
    expect(auctionStatus(s, S0).state).toBe('cpc');
  });

  it('a paused CPC slot reads "paused", not "cpc" (round-2 L1: PROTOCOL §11 — paused stops CPC serving and reverts open_campaign)', () => {
    const s = calSlot(
      { saleMode: 1, leadSeconds: 0, floorCpc: '1000', paused: true },
      { calendarVersion: 0, periodSeconds: null, firstPeriodStart: null },
    );
    expect(auctionStatus(s, S0).state).toBe('paused');
  });

  it('no calendar yet, with otherwise-valid LEASE terms', () => {
    expect(auctionStatus(calSlot({}, { calendarVersion: 0 }), S0).state).toBe('no calendar');
    expect(auctionStatus(calSlot({}, { firstPeriodStart: null }), S0).state).toBe('no calendar');
    expect(auctionStatus(calSlot({}, { periodSeconds: null }), S0).state).toBe('no calendar');
  });
});

describe('auctionStatus: brute-force cross-check against a per-period scan', () => {
  // Deterministic PRNG (mulberry32) so this property test is reproducible, never flaky.
  function mulberry32(seed: number): () => number {
    let a = seed;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  interface PeriodFact {
    k: number;
    start: number;
    end: number;
    openAt: number;
    fitsSaleEnd: boolean;
  }

  /** Independent, from-scratch re-derivation of the FULL expected AuctionStatus via a linear scan
   * over periods `0..scanTo`. It never calls `auctionStatus` and never reuses its closed-form
   * `kLast`/`cur`/`next` arithmetic — every fact (which period contains `now`, which period is
   * soonest in its Dutch phase, which still-sellable period follows the current one) is found by
   * scanning independently, so a bug shared between the two would have to be a bug in the
   * period-calendar definition itself (PROTOCOL §4.1), not in either one's traversal of it.
   * Callers must pick `scanTo` generously enough that every period index a trial can ever call
   * "current", "next" or "the last sellable period" falls at or below it (round-2 L2: the old
   * cross-check only checked `anyOpen`/`anyRemainder` booleans with no else-fail branch, so it
   * could not tell "upcoming" from "ended" and checked none of the numeric fields). */
  function expectedStatus(
    s0: number,
    p: number,
    lead: number,
    saleEnd: number,
    now: number,
    scanTo: number,
  ): AuctionStatus {
    const periods: PeriodFact[] = [];
    for (let k = 0; k <= scanTo; k += 1) {
      const start = s0 + k * p;
      const end = start + p;
      const openAt = start > lead ? start - lead : 0; // max(0, start - lead), computed separately
      const fitsSaleEnd = saleEnd === 0 || end <= saleEnd;
      periods.push({ k, start, end, openAt, fitsSaleEnd });
    }
    const sellable = periods.filter((period) => period.fitsSaleEnd);

    // The period whose [start, end) contains `now`, found by scanning — pure calendar position,
    // independent of whether that period is itself still sellable (PROTOCOL: a slot's "current"
    // period is reported even once the sale horizon has passed it, in the 'ended' state).
    let current: number | undefined;
    for (const period of periods) {
      if (now >= period.start && now < period.end) {
        current = period.k;
        break;
      }
    }

    // The sale horizon has fully closed: either no period ever fit it, or the last one that did
    // has itself already ended.
    const ended =
      saleEnd !== 0 && (sellable.length === 0 || now >= sellable[sellable.length - 1]!.end);
    if (ended) {
      return current === undefined
        ? { state: 'ended' }
        : { state: 'ended', current, endsAt: periods[current]!.end };
    }

    // Periods currently inside their own Dutch phase, still sellable, in ascending k order — the
    // first one (if any) is always the soonest, since `openAt` is non-decreasing in k.
    const open = periods.filter(
      (period) => period.fitsSaleEnd && now >= period.openAt && now < period.start,
    );
    if (open.length > 0) {
      const soonest = open[0]!;
      const status: AuctionStatus = { state: 'live', next: soonest.k, startsAt: soonest.start };
      return current === undefined ? status : { ...status, current, endsAt: periods[current]!.end };
    }

    if (current !== undefined) {
      const currentIndex = current;
      const nextPeriod = sellable.find((period) => period.k > currentIndex);
      const status: AuctionStatus = {
        state: 'remainder',
        current: currentIndex,
        endsAt: periods[currentIndex]!.end,
      };
      return nextPeriod === undefined
        ? status
        : { ...status, next: nextPeriod.k, opensAt: nextPeriod.openAt };
    }

    // `now < start(0)`: before the calendar has started at all, and no period is open yet. `ended`
    // already ruled out `sellable` being empty, so period 0 (always the first sellable one, since
    // "fits saleEnd" only gets harder as k grows) is guaranteed to exist.
    const first = sellable[0]!;
    return { state: 'upcoming', next: first.k, opensAt: first.openAt };
  }

  it('agrees with an independent per-period scan across many random calendars, field for field', () => {
    const rand = mulberry32(1337);
    const randInt = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
    // Bounds are expressed as multiples of `p` so `current`/`next`/`kLast` stay well inside the
    // fixed scan window below, however large `p` itself is.
    const SCAN_TO = 40;
    const TRIALS = 5000;

    for (let trial = 0; trial < TRIALS; trial += 1) {
      const p = randInt(1, 100);
      const s0 = randInt(0, 50) * p;
      const lead = randInt(1, 3 * p);
      const saleEnd = rand() < 0.5 ? 0 : s0 + randInt(0, 15) * p + randInt(-p, p);
      const now = s0 + randInt(-3, 20) * p + randInt(0, p - 1);

      const s = calSlot({ leadSeconds: lead, saleEnd }, { firstPeriodStart: s0, periodSeconds: p });
      const actual = auctionStatus(s, now);
      const expected = expectedStatus(s0, p, lead, saleEnd, now, SCAN_TO);

      const label = `p=${p} s0=${s0} lead=${lead} saleEnd=${saleEnd} now=${now}`;
      expect(actual, label).toEqual(expected);
    }
  });
});

describe('periodsWindowSize', () => {
  it('defaults to 14 periods when leadSeconds spans less than 14 periods', () => {
    expect(periodsWindowSize(600, 3600)).toBe(14); // ceil(600 / 3600) = 1 -> max(14, 1) = 14
  });

  it('widens past 14 when leadSeconds spans more periods than that (round-2 L3)', () => {
    // A 1-day lead on an hourly calendar spans 24 periods: open periods up to cur+24 must list.
    expect(periodsWindowSize(86_400, 3600)).toBe(24);
  });

  it('rounds the period count up, not down, when it does not divide evenly', () => {
    // 88,200 / 3,600 = 24.5: ceil is 25, floor is 24. The exact-multiple case above (86,400 /
    // 3,600 = 24.0) can't tell ceil from floor, since both round to the same integer.
    expect(periodsWindowSize(88_200, 3600)).toBe(25);
  });

  it('caps at 59, one under the list_periods API range limit (step 41)', () => {
    expect(periodsWindowSize(1_000_000, 3600)).toBe(59);
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
