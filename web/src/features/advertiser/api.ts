import { useQuery } from '@tanstack/react-query';

import { api } from '../../lib/api';

export const advertiserKeys = {
  dashboard: (address: string) => ['advertiser', address] as const,
};

export function useAdvertiser(address: string | undefined) {
  return useQuery({
    queryKey: advertiserKeys.dashboard(address ?? ''),
    queryFn: () => api.advertiser(address ?? ''),
    enabled: Boolean(address),
  });
}
