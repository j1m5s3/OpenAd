import { QueryClient } from '@tanstack/react-query';

/** The app's single React Query client (API reads + wagmi reads). Its own module so demo mode can
 * invalidate it after a simulated write (`demo/wagmiDemo.ts`) without touching features. */
export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, retry: 1, refetchOnWindowFocus: false } },
});
