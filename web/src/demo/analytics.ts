/** Demo analytics read model (ADR-0016, PLAN 21+22). Mirrors
 * `api/src/openad/services/analytics.py`'s definitions exactly for money (LEASE and CPC-settled
 * spend/earnings/fee come straight from the seeded leases and campaign settlements — real
 * fixture data, `feeSplit` from `lib/auction.ts`), while impressions, clicks and accrued CPC
 * spend — which the demo has no real traffic to compute — come from a deterministic seeded
 * generator, zero before a slot's first lease (LEASE) or while no campaign targets it (CPC), so a
 * repeated call with the same `now` always returns the same numbers.
 *
 * These are fixture routes read by `demoApi.ts`, not real requests, so no network-guard change is
 * needed (ADR-0016 D3 only guards fetch/XHR/WS).
 */
import type {
  AdvertiserAnalyticsOut,
  AnalyticsTotals,
  BySlotOut,
  DailyBucket,
  SlotAnalyticsOut,
} from '../lib/api';
import { ApiError } from '../lib/api';
import { feeSplit } from '../lib/auction';
import type { DemoState, DemoSlotFixture } from './fixtures';
import { topCampaign } from './demoServe';

const DAY = 86_400;
const DEFAULT_WINDOW_DAYS = 30;
const MAX_WINDOW_DAYS = 90;

/** Same defaulting/rejection rules as `services/analytics.py:resolve_window` (PLAN D4). */
export function resolveWindow(
  fromParam: number | undefined,
  toParam: number | undefined,
  now: number,
): [number, number] {
  const to = toParam ?? now;
  const from = fromParam ?? to - DEFAULT_WINDOW_DAYS * DAY;
  if (to < from) throw new ApiError(422, 'invalid_window', 'window `to` is before `from`');
  if (to - from > MAX_WINDOW_DAYS * DAY)
    throw new ApiError(422, 'invalid_window', `window exceeds ${MAX_WINDOW_DAYS} days`);
  return [from, to];
}

function dayRange(from: number, to: number): number[] {
  const start = Math.floor(from / DAY) * DAY;
  const end = Math.floor(to / DAY) * DAY;
  const days: number[] = [];
  for (let d = start; d <= end; d += DAY) days.push(d);
  return days;
}

function dayStart(at: number): number {
  return Math.floor(at / DAY) * DAY;
}

/** FNV-1a-ish, deterministic for a given string; only used for cosmetic demo traffic, never for
 * anything security-sensitive. */
function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const INVALID_REASONS = ['closed', 'budget', 'burst', 'rate'] as const;

interface DayAcc {
  impressions: number;
  houseServes: number;
  clicksPayable: number;
  clicksInvalid: number;
  clicksInvalidByReason: Record<string, number>;
  accruedCpcSpend: bigint;
  leaseSpend: bigint;
  leaseFee: bigint;
}

function emptyDayAcc(): DayAcc {
  return {
    impressions: 0,
    houseServes: 0,
    clicksPayable: 0,
    clicksInvalid: 0,
    clicksInvalidByReason: {},
    accruedCpcSpend: 0n,
    leaseSpend: 0n,
    leaseFee: 0n,
  };
}

/** The day a LEASE slot's synthetic traffic starts: its earliest leased period's start, or
 * `null` if the slot has never had a lease (no traffic to show yet). */
function leaseActiveSince(fixture: DemoSlotFixture): number | null {
  const { slot, leases } = fixture;
  if (slot.periodSeconds == null || slot.firstPeriodStart == null) return null;
  const starts = Object.keys(leases).map(
    (idx) => slot.firstPeriodStart! + Number(idx) * slot.periodSeconds!,
  );
  return starts.length === 0 ? null : Math.min(...starts);
}

/** The lease (if any) covering `day` on a LEASE slot, by period index. */
function leaseCoveringDay(fixture: DemoSlotFixture, day: number): string | null {
  const { slot, leases } = fixture;
  if (slot.periodSeconds == null || slot.firstPeriodStart == null) return null;
  if (day < slot.firstPeriodStart) return null;
  const idx = Math.floor((day - slot.firstPeriodStart) / slot.periodSeconds);
  return leases[idx] ? leases[idx].lessee.toLowerCase() : null;
}

/** The day a CPC slot's synthetic traffic starts: deterministic per slot, 30-90 days before
 * `now`, but only if some campaign (open or closed) has ever targeted it — otherwise `null`. */
function cpcActiveSince(state: DemoState, slotId: string, now: number): number | null {
  const hasCampaign = Object.values(state.campaigns).some((c) => c.slotId === slotId);
  if (!hasCampaign) return null;
  const lookbackDays = 30 + (hash(`${slotId}:cpc-since`) % 60);
  return now - lookbackDays * DAY;
}

/** One day's synthetic traffic for a slot, and (for a CPC slot) which campaign it is attributed
 * to. Deterministic in `slotId` and `day` only, so the same window always returns the same
 * numbers regardless of when it is requested.
 *
 * `withClicks` must be `false` for a LEASE day: a LEASE creative's `click_url` points straight at
 * the advertiser's own landing page (`routers/serve.py` only rewrites `click_url` to the tracked
 * `/v1/c/{token}` redirect for a CPC `campaign` serve), so there are no `click_events` — and
 * therefore no clicks, invalid clicks, or CTR — to synthesize for a LEASE-only slot or day. */
function syntheticDay(
  slotId: string,
  day: number,
  width: number,
  height: number,
  withClicks: boolean,
): {
  impressions: number;
  houseServes: number;
  clicksPayable: number;
  clicksInvalid: number;
  reason: string;
} {
  const size = Math.max(1, Math.round((width * height) / 30_000));
  const impressions = (100 + (hash(`${slotId}:${day}:imp`) % 900)) * size;
  const houseServes = hash(`${slotId}:${day}:house`) % 15;
  if (!withClicks) {
    return { impressions, houseServes, clicksPayable: 0, clicksInvalid: 0, reason: '' };
  }
  const ctrBps = 50 + (hash(`${slotId}:${day}:ctr`) % 350); // 0.5%–4.0%
  const clicksPayable = Math.floor((impressions * ctrBps) / 10_000);
  const invalidBps = 200 + (hash(`${slotId}:${day}:invalid`) % 800); // 2%–10% of payable
  const clicksInvalid = Math.floor((clicksPayable * invalidBps) / 10_000);
  const reason = INVALID_REASONS[hash(`${slotId}:${day}:reason`) % INVALID_REASONS.length]!;
  return { impressions, houseServes, clicksPayable, clicksInvalid, reason };
}

/** Merges a synthetic day's invalid-click reason into `acc`, skipping the placeholder `''`
 * reason a LEASE (`withClicks: false`) day returns, which always has `clicksInvalid === 0`. */
function mergeInvalidReason(acc: DayAcc, reason: string, count: number): void {
  if (count === 0) return;
  acc.clicksInvalidByReason[reason] = (acc.clicksInvalidByReason[reason] ?? 0) + count;
}

function ctrBps(clicksPayable: number, impressions: number): number | null {
  if (impressions === 0) return null;
  return Math.floor((clicksPayable * 10_000) / impressions);
}

function ecpm(basis: bigint, impressions: number): number | null {
  if (impressions === 0) return null;
  return Number((basis * 1000n) / BigInt(impressions));
}

function buildDaily(days: number[], acc: Map<number, DayAcc>): DailyBucket[] {
  return days.map((day) => {
    const a = acc.get(day) ?? emptyDayAcc();
    return {
      dayStart: day,
      impressions: a.impressions,
      houseServes: a.houseServes,
      clicksPayable: a.clicksPayable,
      clicksInvalid: a.clicksInvalid,
      leaseSpend: a.leaseSpend.toString(),
      accruedCpcSpend: a.accruedCpcSpend.toString(),
    };
  });
}

function mergeReasons(target: Record<string, number>, day: DayAcc): void {
  for (const [reason, count] of Object.entries(day.clicksInvalidByReason)) {
    target[reason] = (target[reason] ?? 0) + count;
  }
}

export function slotAnalytics(
  state: DemoState,
  slotId: string,
  fromParam: number | undefined,
  toParam: number | undefined,
  now: number,
): SlotAnalyticsOut {
  const fixture = state.slots.find((s) => s.slot.slotId === slotId);
  if (!fixture) throw new ApiError(404, 'slot_not_found', `slot ${slotId} not found`);
  const [from, to] = resolveWindow(fromParam, toParam, now);
  const days = dayRange(from, to);
  const acc = new Map<number, DayAcc>();
  const ensure = (day: number): DayAcc => {
    let a = acc.get(day);
    if (!a) {
      a = emptyDayAcc();
      acc.set(day, a);
    }
    return a;
  };

  const isCpc = fixture.slot.calendarVersion === 0;
  const activeSince = isCpc ? cpcActiveSince(state, slotId, now) : leaseActiveSince(fixture);

  if (activeSince !== null) {
    const { width, height } = fixture.slot;
    for (const day of days) {
      if (day < activeSince || day > now) continue;
      const syn = syntheticDay(slotId, day, width, height, isCpc);
      const a = ensure(day);
      a.impressions += syn.impressions;
      a.houseServes += syn.houseServes;
      a.clicksPayable += syn.clicksPayable;
      a.clicksInvalid += syn.clicksInvalid;
      mergeInvalidReason(a, syn.reason, syn.clicksInvalid);
      if (isCpc) {
        // Priced at the winning campaign's current `maxCpc`, a simplified stand-in for the
        // protocol's GSP second-price settlement (matches `demoServe.ts`'s `topCampaign`).
        const winner = topCampaign(state, slotId);
        if (winner) a.accruedCpcSpend += BigInt(syn.clicksPayable) * BigInt(winner.maxCpc);
      }
    }
  }

  // Real LEASE spend/fee, attributed to the day of the leased period's start (PLAN D4).
  if (!isCpc && fixture.slot.firstPeriodStart != null && fixture.slot.periodSeconds != null) {
    for (const [idxStr, record] of Object.entries(fixture.leases)) {
      const start = fixture.slot.firstPeriodStart + Number(idxStr) * fixture.slot.periodSeconds;
      if (start < from || start > to) continue;
      const price = BigInt(record.price);
      const { fee } = feeSplit(price);
      const a = ensure(dayStart(start));
      a.leaseSpend += price;
      a.leaseFee += fee;
    }
  }

  // CPC settled: ALL settlements for this slot, unwindowed (no timestamp on `Settled`, PLAN D4).
  let cpcSettledSpend = 0n;
  let cpcSettledFee = 0n;
  for (const campaign of Object.values(state.campaigns)) {
    if (campaign.slotId !== slotId) continue;
    for (const s of campaign.settlements) {
      cpcSettledSpend += BigInt(s.charged);
      cpcSettledFee += BigInt(s.fee);
    }
  }
  const cpcSettledEarnings = cpcSettledSpend - cpcSettledFee;

  let totalImpressions = 0;
  let totalHouse = 0;
  let totalPayable = 0;
  let totalInvalid = 0;
  let leaseSpendTotal = 0n;
  let leaseFeeTotal = 0n;
  let accruedTotal = 0n;
  const reasons: Record<string, number> = {};
  for (const a of acc.values()) {
    totalImpressions += a.impressions;
    totalHouse += a.houseServes;
    totalPayable += a.clicksPayable;
    totalInvalid += a.clicksInvalid;
    leaseSpendTotal += a.leaseSpend;
    leaseFeeTotal += a.leaseFee;
    accruedTotal += a.accruedCpcSpend;
    mergeReasons(reasons, a);
  }
  const leaseEarningsTotal = leaseSpendTotal - leaseFeeTotal;

  const totals: AnalyticsTotals = {
    impressions: totalImpressions,
    houseServes: totalHouse,
    clicksPayable: totalPayable,
    clicksInvalid: totalInvalid,
    ctrBps: ctrBps(totalPayable, totalImpressions),
    ecpm: ecpm(leaseEarningsTotal + cpcSettledEarnings, totalImpressions),
    leaseSpend: leaseSpendTotal.toString(),
    leaseFee: leaseFeeTotal.toString(),
    leaseEarnings: leaseEarningsTotal.toString(),
    cpcSettledSpend: cpcSettledSpend.toString(),
    cpcSettledFee: cpcSettledFee.toString(),
    cpcSettledEarnings: cpcSettledEarnings.toString(),
    accruedCpcSpend: accruedTotal.toString(),
    invalidOriginServes: 0,
    clicksInvalidByReason: reasons,
  };

  return {
    slotId,
    window: { from, to },
    totals,
    daily: buildDaily(days, acc),
  };
}

export function advertiserAnalytics(
  state: DemoState,
  address: string,
  fromParam: number | undefined,
  toParam: number | undefined,
  now: number,
): AdvertiserAnalyticsOut {
  const addr = address.toLowerCase();
  const [from, to] = resolveWindow(fromParam, toParam, now);
  const days = dayRange(from, to);
  const acc = new Map<number, DayAcc>();
  const ensure = (day: number): DayAcc => {
    let a = acc.get(day);
    if (!a) {
      a = emptyDayAcc();
      acc.set(day, a);
    }
    return a;
  };
  const bySlotSpend = new Map<string, bigint>();
  const addSpend = (slotId: string, amount: bigint) => {
    bySlotSpend.set(slotId, (bySlotSpend.get(slotId) ?? 0n) + amount);
  };

  let leaseSpendTotal = 0n;
  let leaseFeeTotal = 0n;
  let cpcSettledSpend = 0n;
  let cpcSettledFee = 0n;

  for (const fixture of state.slots) {
    const isCpc = fixture.slot.calendarVersion === 0;
    const slotId = fixture.slot.slotId;

    if (!isCpc && fixture.slot.firstPeriodStart != null && fixture.slot.periodSeconds != null) {
      const activeSince = leaseActiveSince(fixture);
      for (const [idxStr, record] of Object.entries(fixture.leases)) {
        const start = fixture.slot.firstPeriodStart + Number(idxStr) * fixture.slot.periodSeconds;
        const isMine = record.lessee.toLowerCase() === addr;
        if (isMine && start >= from && start <= to) {
          const price = BigInt(record.price);
          const { fee } = feeSplit(price);
          leaseSpendTotal += price;
          leaseFeeTotal += fee;
          addSpend(slotId, price);
        }
      }
      if (activeSince !== null) {
        for (const day of days) {
          if (day < activeSince || day > now) continue;
          const lessee = leaseCoveringDay(fixture, day);
          if (lessee !== addr) continue;
          // No clicks on a LEASE day (`withClicks: false`) — see `syntheticDay`.
          const syn = syntheticDay(slotId, day, fixture.slot.width, fixture.slot.height, false);
          const a = ensure(day);
          a.impressions += syn.impressions;
          a.houseServes += 0; // house serves never belong to an advertiser
          a.clicksPayable += syn.clicksPayable;
          a.clicksInvalid += syn.clicksInvalid;
          mergeInvalidReason(a, syn.reason, syn.clicksInvalid);
        }
      }
    }

    const winner = isCpc ? topCampaign(state, slotId) : null;
    const winnerIsMine = winner !== null && winner.advertiser.toLowerCase() === addr;
    if (isCpc && winnerIsMine) {
      const activeSince = cpcActiveSince(state, slotId, now);
      if (activeSince !== null) {
        for (const day of days) {
          if (day < activeSince || day > now) continue;
          const syn = syntheticDay(slotId, day, fixture.slot.width, fixture.slot.height, true);
          const a = ensure(day);
          a.impressions += syn.impressions;
          a.clicksPayable += syn.clicksPayable;
          a.clicksInvalid += syn.clicksInvalid;
          mergeInvalidReason(a, syn.reason, syn.clicksInvalid);
          // Priced at the winning campaign's current `maxCpc` (see `slotAnalytics` above).
          // Never added to `bySlot`: like the API, `by_slot` is lease spend + settled CPC only,
          // never accrued (unsettled) CPC.
          a.accruedCpcSpend += BigInt(syn.clicksPayable) * BigInt(winner.maxCpc);
        }
      }
    }

    for (const campaign of Object.values(state.campaigns)) {
      if (campaign.slotId !== slotId || campaign.advertiser.toLowerCase() !== addr) continue;
      for (const s of campaign.settlements) {
        cpcSettledSpend += BigInt(s.charged);
        cpcSettledFee += BigInt(s.fee);
        addSpend(slotId, BigInt(s.charged));
      }
    }
  }

  const cpcSettledEarnings = cpcSettledSpend - cpcSettledFee;
  let totalImpressions = 0;
  let totalHouse = 0;
  let totalPayable = 0;
  let totalInvalid = 0;
  let accruedTotal = 0n;
  const reasons: Record<string, number> = {};
  for (const a of acc.values()) {
    totalImpressions += a.impressions;
    totalHouse += a.houseServes;
    totalPayable += a.clicksPayable;
    totalInvalid += a.clicksInvalid;
    accruedTotal += a.accruedCpcSpend;
    mergeReasons(reasons, a);
  }
  const leaseEarningsTotal = leaseSpendTotal - leaseFeeTotal;

  const totals: AnalyticsTotals = {
    impressions: totalImpressions,
    houseServes: totalHouse,
    clicksPayable: totalPayable,
    clicksInvalid: totalInvalid,
    ctrBps: ctrBps(totalPayable, totalImpressions),
    ecpm: ecpm(leaseSpendTotal + cpcSettledSpend, totalImpressions),
    leaseSpend: leaseSpendTotal.toString(),
    leaseFee: leaseFeeTotal.toString(),
    leaseEarnings: leaseEarningsTotal.toString(),
    cpcSettledSpend: cpcSettledSpend.toString(),
    cpcSettledFee: cpcSettledFee.toString(),
    cpcSettledEarnings: cpcSettledEarnings.toString(),
    accruedCpcSpend: accruedTotal.toString(),
    invalidOriginServes: 0,
    clicksInvalidByReason: reasons,
  };

  // Top 10 by spend, descending — matches `services/analytics.py:advertiser_analytics`.
  const bySlot: BySlotOut[] = Array.from(bySlotSpend.entries())
    .sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0))
    .slice(0, 10)
    .map(([slotId, spend]) => ({
      slotId,
      spend: spend.toString(),
    }));

  return {
    address: addr,
    window: { from, to },
    totals,
    daily: buildDaily(days, acc),
    bySlot,
  };
}
