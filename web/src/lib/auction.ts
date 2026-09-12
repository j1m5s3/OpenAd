import type { SlotOut } from '../lib/api';

export function auctionState(slot: SlotOut, now = Math.floor(Date.now() / 1000)): string {
  if (!slot.terms || slot.terms.paused) return 'paused';
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
  return slot.firstPeriodStart - slot.terms.leadSeconds;
}
