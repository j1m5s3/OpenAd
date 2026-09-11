import { useQuery } from '@tanstack/react-query';

import { api } from '../../lib/api';

export const publisherKeys = {
  dashboard: (address: string) => ['publisher', address] as const,
  approvals: (address: string) => ['publisher', address, 'approvals'] as const,
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
