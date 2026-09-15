import { useQuery } from '@tanstack/react-query';

import { api } from '../lib/api';
import { indexerLagCopy } from '../lib/indexerLag';

export function IndexerLagBanner() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: api.health,
    retry: false,
    refetchInterval: 15_000,
  });
  const copy = indexerLagCopy(health.data?.indexerLag, health.isSuccess);
  return (
    <p className="border-b border-line bg-canvas px-4 py-1.5 text-center text-xs text-muted">
      {copy}
    </p>
  );
}
