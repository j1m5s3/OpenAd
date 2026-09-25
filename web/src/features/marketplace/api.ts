import { useQuery } from '@tanstack/react-query';

import { api } from '../../lib/api';

export const slotKeys = {
  all: ['slots'] as const,
  list: (params: { domain?: string; kind?: number; category?: string } = {}) =>
    ['slots', 'list', params] as const,
  detail: (slotId: string) => ['slots', 'detail', slotId] as const,
  periods: (slotId: string, from: number, windowSize: number) =>
    ['slots', 'periods', slotId, from, windowSize] as const,
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

/** `from`/`windowSize` follow the open-ended calendar (PLAN step 40): the caller passes the
 * slot's current period index (`currentPeriodIndex(slot, now)`, or `0` before the calendar
 * starts) and a window sized to the slot's `leadSeconds` (`periodsWindowSize`) — a fixed
 * `from=0, to=14` window would list nothing buyable once the calendar is older than 15 periods,
 * or cut off open periods past a longer lead. `enabled` additionally gates the request on the
 * slot itself having loaded, so the page never fires a wasted `from=0` request first. */
export function usePeriods(
  slotId: string,
  options: { from?: number; windowSize?: number; enabled?: boolean } = {},
) {
  const { from = 0, windowSize = 14, enabled = true } = options;
  return useQuery({
    queryKey: slotKeys.periods(slotId, from, windowSize),
    queryFn: () => api.listPeriods(slotId, from, from + windowSize),
    enabled: enabled && slotId.length > 0,
  });
}
