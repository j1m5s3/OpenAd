import { useQuery } from '@tanstack/react-query';

import { api } from '../../lib/api';

export const slotKeys = {
  all: ['slots'] as const,
  list: (params: { domain?: string; kind?: number; category?: string } = {}) =>
    ['slots', 'list', params] as const,
  detail: (slotId: string) => ['slots', 'detail', slotId] as const,
  periods: (slotId: string, from: number) => ['slots', 'periods', slotId, from] as const,
};

export function useSlots(params: { domain?: string; kind?: number; category?: string } = {}) {
  return useQuery({ queryKey: slotKeys.list(params), queryFn: () => api.listSlots(params) });
}

export function useSlot(slotId: string) {
  return useQuery({
    queryKey: slotKeys.detail(slotId),
    queryFn: () => api.getSlot(slotId),
    enabled: slotId.length > 0,
  });
}

/** `from` follows the open-ended calendar (PLAN step 40): the caller passes the slot's current
 * period index (`auctionStatus(slot, now).current`, or `0` before the calendar starts), not
 * always 0 — otherwise a calendar older than 15 periods would list nothing buyable. */
export function usePeriods(slotId: string, from = 0) {
  return useQuery({
    queryKey: slotKeys.periods(slotId, from),
    queryFn: () => api.listPeriods(slotId, from, from + 14),
    enabled: slotId.length > 0,
  });
}
