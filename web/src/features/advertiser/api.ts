import { useQueries, useQuery } from '@tanstack/react-query';

import { api } from '../../lib/api';
import type { WindowPreset } from '../../lib/analytics';
import { windowPreset } from '../../lib/analytics';

export const advertiserKeys = {
  dashboard: (address: string) => ['advertiser', address] as const,
  analytics: (address: string, preset: WindowPreset) =>
    ['analytics', 'advertiser', address, preset] as const,
};

export function useAdvertiser(address: string | undefined) {
  return useQuery({
    queryKey: advertiserKeys.dashboard(address ?? ''),
    queryFn: () => api.advertiser(address ?? ''),
    enabled: Boolean(address),
  });
}

export function useAdvertiserCreatives(ids: string[] | undefined) {
  return useQueries({
    queries: (ids ?? []).map((id) => ({
      queryKey: ['creative', id] as const,
      queryFn: () => api.getCreative(id),
    })),
  });
}

export function useAdvertiserAnalytics(address: string | undefined, preset: WindowPreset) {
  return useQuery({
    queryKey: advertiserKeys.analytics(address ?? '', preset),
    queryFn: () => {
      const now = Math.floor(Date.now() / 1000);
      return api.advertiserAnalytics(address ?? '', windowPreset(preset, now));
    },
    enabled: Boolean(address),
  });
}
