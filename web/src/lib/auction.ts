import type { SlotOut } from '../lib/api';
import { SALE_CPC } from './labels';

/** Default platform fee, in basis points (PROTOCOL §4.3, §11: `fee_bps` default 250 == 2.5%). */
export const FEE_BPS = 250n;
export const BPS_DENOMINATOR = 10_000n;

/** `open_at = max(0, start - leadSeconds)` (PROTOCOL §4.2), saturating at 0. Shared by
 * `dutchPrice` and `auctionOpenAt` so the two never disagree on where the Dutch phase opens. */
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
export function remainderPrice(floorPrice: bigint, periodSeconds: number, end: number, now: number): bigint {
  const remaining = BigInt(Math.max(0, end - now));
  return (floorPrice * remaining) / BigInt(periodSeconds);
}

/** Fee split (PROTOCOL §4.3): `fee = price * fee_bps / BPS_DENOMINATOR` (floor); the publisher
 * receives the rest. `fee + publisherAmount == price` always. */
export function feeSplit(price: bigint, feeBps: bigint = FEE_BPS): { fee: bigint; publisherAmount: bigint } {
  const fee = (price * feeBps) / BPS_DENOMINATOR;
  return { fee, publisherAmount: price - fee };
}

export function auctionState(slot: SlotOut, now = Math.floor(Date.now() / 1000)): string {
  if (!slot.terms || slot.terms.paused) return 'paused';
  if (slot.terms.saleMode === SALE_CPC) return 'cpc';
  const start = slot.firstPeriodStart;
  const lead = slot.terms.leadSeconds;
  const period = slot.periodSeconds;
  if (start == null || period == null) return 'no calendar';
  if (now < start - lead) return 'upcoming';
  if (now < start) return 'live';
  if (now < start + period) return 'remainder';
  return 'ended';
}

export function auctionOpenAt(slot: SlotOut): number | null {
  if (slot.firstPeriodStart == null || !slot.terms) return null;
  return computeOpenAt(slot.firstPeriodStart, slot.terms.leadSeconds);
}
