import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { WagmiProvider } from 'wagmi';

import { DevWalletAutoConnect } from '../dev/autoConnect';
import { wagmiConfig } from '../lib/wagmi';
import { router } from './routes';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, retry: 1, refetchOnWindowFocus: false } },
});

const rkTheme = darkTheme({
  accentColor: '#c8f542',
  accentColorForeground: '#0b0b0c',
  borderRadius: 'large',
  overlayBlur: 'small',
});

export function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={rkTheme}>
          <DevWalletAutoConnect />
          <RouterProvider router={router} />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
