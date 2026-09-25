import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { WagmiProvider } from 'wagmi';

import { DevWalletAutoConnect } from '../dev/autoConnect';
import type { OpenAdWagmiConfig } from '../lib/wagmi';
import { queryClient } from './queryClient';
import { router } from './routes';

const rkTheme = darkTheme({
  accentColor: '#c8f542',
  accentColorForeground: '#0b0b0c',
  borderRadius: 'large',
  overlayBlur: 'small',
});

/** `config` is built in `main.tsx`: the real config, or the demo simulator's (ADR-0016). */
export function App({ config }: { config: OpenAdWagmiConfig }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={rkTheme}>
          <DevWalletAutoConnect />
          <RouterProvider router={router} />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
