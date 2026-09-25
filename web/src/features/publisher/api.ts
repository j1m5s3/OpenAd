import { useQuery } from '@tanstack/react-query';

import { api } from '../../lib/api';
import type { WindowPreset } from '../../lib/analytics';
import { windowPreset } from '../../lib/analytics';

export const publisherKeys = {
  dashboard: (address: string) => ['publisher', address] as const,
  approvals: (address: string) => ['publisher', address, 'approvals'] as const,
  slotAnalytics: (slotId: string, preset: WindowPreset) =>
    ['analytics', 'slot', slotId, preset] as const,
};

export function usePublisher(address: string | undefined) {
  return useQuery({
    queryKey: publisherKeys.dashboard(address ?? ''),
    queryFn: () => api.publisher(address ?? ''),
    enabled: Boolean(address),
  });
}

export function usePublisherApprovals(address: string | undefined) {
  return useQuery({
    queryKey: publisherKeys.approvals(address ?? ''),
    queryFn: () => api.publisherApprovals(address ?? ''),
    enabled: Boolean(address),
  });
}

export function useSlotAnalytics(slotId: string | undefined, preset: WindowPreset) {
  return useQuery({
    queryKey: publisherKeys.slotAnalytics(slotId ?? '', preset),
    queryFn: () => {
      const now = Math.floor(Date.now() / 1000);
      return api.slotAnalytics(slotId ?? '', windowPreset(preset, now));
    },
    enabled: Boolean(slotId),
  });
}
