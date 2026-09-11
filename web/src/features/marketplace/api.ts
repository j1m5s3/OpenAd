import { useQuery } from '@tanstack/react-query';

import { api } from '../../lib/api';

export const slotKeys = {
  all: ['slots'] as const,
  list: (params: { domain?: string; kind?: number } = {}) => ['slots', 'list', params] as const,
  detail: (slotId: string) => ['slots', 'detail', slotId] as const,
  periods: (slotId: string) => ['slots', 'periods', slotId] as const,
};

export function useSlots(params: { domain?: string; kind?: number } = {}) {
  return useQuery({ queryKey: slotKeys.list(params), queryFn: () => api.listSlots(params) });
}

export function useSlot(slotId: string) {
  return useQuery({
    queryKey: slotKeys.detail(slotId),
    queryFn: () => api.getSlot(slotId),
    enabled: slotId.length > 0,
  });
}

export function usePeriods(slotId: string) {
  return useQuery({
    queryKey: slotKeys.periods(slotId),
    queryFn: () => api.listPeriods(slotId),
    enabled: slotId.length > 0,
  });
}
