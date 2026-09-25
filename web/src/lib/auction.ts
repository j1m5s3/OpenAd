import type { SlotOut } from '../lib/api';
import { SALE_CPC } from './labels';

/** Default platform fee, in basis points (PROTOCOL §4.3, §11: `fee_bps` default 250 == 2.5%). */
export const FEE_BPS = 250n;
export const BPS_DENOMINATOR = 10_000n;

/** `open_at = max(0, start - leadSeconds)` (PROTOCOL §4.2), saturating at 0. Shared by
 * `dutchPrice` and `auctionStatus` so they never disagree on where a period's Dutch phase
 * opens. */
function computeOpenAt(start: number, leadSeconds: number): number {
  return Math.max(0, start - leadSeconds);
}

/** Dutch-phase price (PROTOCOL §4.2): `open_at <= now < start`.
 * `price = floor_price + (start_price - floor_price) * (start - now) / duration`, floor division,
 * where `duration = start - open_at`. Clamped so a caller passing `now < open_at` (before the
 * auction actually opens) gets `startPrice` back rather than a value that overshoots it — the
 * Dutch-phase invariant (`floor_price <= price <= start_price`) always holds regardless of what
 * `now` is. */
export function dutchPrice(
  startPrice: bigint,
  floorPrice: bigint,
  leadSeconds: number,
  start: number,
  now: number,
): bigint {
  const openAt = computeOpenAt(start, leadSeconds);
  const duration = Math.max(1, start - openAt);
  const remaining = Math.max(0, Math.min(start - now, duration));
  return floorPrice + ((startPrice - floorPrice) * BigInt(remaining)) / BigInt(duration);
}

/** Remainder-phase price (PROTOCOL §4.2): `start <= now < end`.
 * `price = floor_price * (end - now) / period_seconds`, floor division. */
export function remainderPrice(
  floorPrice: bigint,
  periodSeconds: number,
  end: number,
  now: number,
): bigint {
  const remaining = BigInt(Math.max(0, end - now));
  return (floorPrice * remaining) / BigInt(periodSeconds);
}

/** Fee split (PROTOCOL §4.3): `fee = price * fee_bps / BPS_DENOMINATOR` (floor); the publisher
 * receives the rest. `fee + publisherAmount == price` always. */
export function feeSplit(
  price: bigint,
  feeBps: bigint = FEE_BPS,
): { fee: bigint; publisherAmount: bigint } {
  const fee = (price * feeBps) / BPS_DENOMINATOR;
  return { fee, publisherAmount: price - fee };
}

/** The auction-schedule states a slot can read as. `'no terms'`/`'no calendar'` mean nothing
 * sellable is configured yet; `'cpc'`/`'paused'` mirror `Terms`; the rest describe where `now`
 * falls in the open-ended per-period calendar (PROTOCOL §4.1) — never just the first period. */
export type AuctionStateName =
  'no terms' | 'cpc' | 'paused' | 'no calendar' | 'upcoming' | 'live' | 'remainder' | 'ended';

export interface AuctionStatus {
  state: AuctionStateName;
  /** Index of the period containing `now` (`currentPeriodIndex`, PROTOCOL §4.1). Present only for
   * `'upcoming'`/`'live'`/`'remainder'`/`'ended'`, once the calendar has started — never for
   * `'no terms'`, `'cpc'`, `'paused'` or `'no calendar'`, even when the slot's calendar has in
   * fact started, because those states return before it is checked. Call `currentPeriodIndex`
   * directly when you need the calendar's current index regardless of sale state — as `SlotPage`
   * does to page the period list. */
  current?: number;
  /** Index of the soonest period whose Dutch window can still open before `saleEnd` — `current +
   * 1`, or `0` before the calendar starts. Absent once no such period remains (the schedule is
   * `'ended'`, or `current` is the last period it will ever sell). */
  next?: number;
  /** Open time of `next` (`max(0, start(next) - leadSeconds)`). Set for `'upcoming'` (period 0's
   * open time) and for `'remainder'` when another period will open after this one. */
  opensAt?: number;
  /** Start time of `next`. Set for `'live'`: the moment that period's Dutch phase ends and
   * remainder pricing begins. */
  startsAt?: number;
  /** End time of `current`. Set whenever `current` is, for `'remainder'`'s "this is the last
   * period" copy. */
  endsAt?: number;
}

/** Index of the period containing `now` (PROTOCOL §4.1: `(now - firstPeriodStart) //
 * periodSeconds`) — the calendar's current index regardless of sale state (no terms, paused,
 * cpc, …). Mirrors `models/slot.py`'s `current_period_index`. Unset before the calendar exists
 * or starts (`now < firstPeriodStart`). */
export function currentPeriodIndex(
  slot: SlotOut,
  now = Math.floor(Date.now() / 1000),
): number | undefined {
  const { calendarVersion, firstPeriodStart: s0, periodSeconds: p } = slot;
  if (calendarVersion === 0 || s0 == null || p == null || now < s0) return undefined;
  return Math.floor((now - s0) / p);
}

/** Calendar-aware auction status (PROTOCOL §4.1, §4.2). Period indices are unbounded upward —
 * the sale horizon is bounded only by `leadSeconds` and, if set, `saleEnd` — so, unlike looking
 * only at the first period, a slot never falsely reads `'ended'` just because its first period
 * has passed.
 *
 * `SlotOut` carries no lease data, so this describes the *schedule* (is some period's Dutch or
 * remainder window open right now), not whether that period is still unsold — the slot page's
 * period list (mirroring `services/periods.py` `list_periods`) shows real sellability. */
export function auctionStatus(slot: SlotOut, now = Math.floor(Date.now() / 1000)): AuctionStatus {
  const terms = slot.terms;
  const cpc = terms?.saleMode === SALE_CPC;
  if (!terms || (!cpc && terms.leadSeconds <= 0)) return { state: 'no terms' };
  // Checked before `cpc`: PROTOCOL §11 — `paused` stops CPC serving and reverts
  // `open_campaign`, so a paused CPC slot must read `'paused'`, not `'cpc'`.
  if (terms.paused) return { state: 'paused' };
  if (cpc) return { state: 'cpc' };

  const { calendarVersion, firstPeriodStart: s0, periodSeconds: p } = slot;
  if (calendarVersion === 0 || s0 == null || p == null) return { state: 'no calendar' };

  const lead = terms.leadSeconds;
  const saleEnd = terms.saleEnd;
  // Index of the last period whose end still fits at or before saleEnd (Infinity when unset).
  const kLast = saleEnd === 0 ? Infinity : Math.floor((saleEnd - s0) / p) - 1;
  const cur = currentPeriodIndex(slot, now) ?? -1;
  const next = cur + 1;

  // Adds `current`/`endsAt` to a status when the calendar has started — true regardless of which
  // state below applies, so both `'ended'` and `'remainder'` can report them. Never assigns
  // `undefined` to an optional field (`exactOptionalPropertyTypes`): the key is just left off.
  const withCurrent = (status: AuctionStatus): AuctionStatus =>
    cur < 0 ? status : { ...status, current: cur, endsAt: s0 + (cur + 1) * p };

  if (saleEnd !== 0 && (kLast < 0 || now >= s0 + (kLast + 1) * p)) {
    return withCurrent({ state: 'ended' });
  }

  const hasNext = next <= kLast;
  const nextStart = s0 + next * p;
  const nextOpensAt = computeOpenAt(nextStart, lead);

  if (hasNext && now >= nextOpensAt) {
    return withCurrent({ state: 'live', next, startsAt: nextStart });
  }
  if (cur >= 0) {
    const status = withCurrent({ state: 'remainder' });
    return hasNext ? { ...status, next, opensAt: nextOpensAt } : status;
  }
  // `now < open_0`: before the very first period's Dutch window opens. Reaching this branch
  // guarantees `kLast >= 0` (or Infinity) — the `'ended'` check above already handled `kLast < 0`
  // unconditionally — so `next` (== 0 here) always names a real, sellable first period.
  return { state: 'upcoming', next, opensAt: nextOpensAt };
}

/** Thin wrapper over `auctionStatus` for callers that only need the state name (Discover's
 * filter buttons and its featured-row heuristic). */
export function auctionState(slot: SlotOut, now = Math.floor(Date.now() / 1000)): string {
  return auctionStatus(slot, now).state;
}

/** How many periods `SlotPage` should list starting at the current one (PLAN step 40, L3). Wide
 * enough that open periods past a long `leadSeconds` (periods open for auction long before they
 * start) aren't cut off by a fixed 15-row window, but capped under the `list_periods` API's
 * 60-period range limit (step 41): `min(59, max(14, ceil(leadSeconds / periodSeconds)))`. */
export function periodsWindowSize(leadSeconds: number, periodSeconds: number): number {
  const leadPeriods = Math.ceil(leadSeconds / periodSeconds);
  return Math.min(59, Math.max(14, leadPeriods));
}
