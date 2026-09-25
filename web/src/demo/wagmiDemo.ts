/** Demo wagmi/RainbowKit config (ADR-0016). One chain (foundry/31337, the synthetic demo
 * deployment), one transport — `custom()` over the in-memory simulator — and one wallet, "OpenAd
 * Demo Wallet", an `injected` connector whose target is that same simulator. There is no `http()`
 * transport, no WalletConnect, and EIP-6963 discovery is off, so a visitor's real browser wallet
 * is never offered, never connected, and never asked to sign. */
import { connectorsForWallets, type Wallet } from '@rainbow-me/rainbowkit';
import type { QueryClient } from '@tanstack/react-query';
import type { EIP1193Provider } from 'viem';
import { createConfig, createConnector, custom } from 'wagmi';
import { foundry } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

import type { OpenAdWagmiConfig } from '../lib/wagmi';
import type { DemoProvider } from './demoChain';
import { getDemoProvider } from './install';
import { demoStore } from './store';

export const DEMO_WALLET_ID = 'openad-demo';
export const DEMO_WALLET_NAME = 'OpenAd Demo Wallet';

/** Inline icon (a data URI, so RainbowKit never fetches one). */
const DEMO_WALLET_ICON =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28"><rect width="28" height="28" rx="6" fill="#c8f542"/><text x="14" y="19" font-family="sans-serif" font-size="12" font-weight="700" text-anchor="middle" fill="#0b0b0c">D</text></svg>',
  );

function demoWallet(provider: DemoProvider): () => Wallet {
  return () => ({
    id: DEMO_WALLET_ID,
    name: DEMO_WALLET_NAME,
    iconUrl: DEMO_WALLET_ICON,
    iconBackground: '#c8f542',
    installed: true,
    createConnector: (walletDetails) =>
      createConnector((config) => ({
        ...injected({
          target: {
            id: DEMO_WALLET_ID,
            name: DEMO_WALLET_NAME,
            provider: provider as unknown as EIP1193Provider,
          },
        })(config),
        ...walletDetails,
      })),
  });
}

/** Builds the demo config over `provider` (defaults to the one `installDemo()` created). */
export function createDemoWagmiConfig(
  provider: DemoProvider = getDemoProvider(),
): OpenAdWagmiConfig {
  const connectors = connectorsForWallets(
    [{ groupName: 'Demo', wallets: [demoWallet(provider)] }],
    {
      appName: 'OpenAd (demo)',
      projectId: 'openad-demo-no-walletconnect',
    },
  );
  const config = createConfig({
    chains: [foundry],
    connectors,
    transports: { [foundry.id]: custom(provider as unknown as EIP1193Provider, { retryCount: 0 }) },
    multiInjectedProviderDiscovery: false,
    ssr: false,
    pollingInterval: 1_000,
  });
  // Same runtime shape as the real config; only the chain tuple differs (31337 alone), and every
  // feature call targets `targetChainId`, which is 31337 in demo mode.
  return config as unknown as OpenAdWagmiConfig;
}

/** After every simulated write (and any other demo store change) re-read everything, so pages
 * reflect the new state from `demoApi` and wagmi reads the way they would after the indexer
 * catches up. Returns the unsubscribe function. */
export function syncDemoQueries(queryClient: QueryClient): () => void {
  return demoStore.subscribe(() => {
    void queryClient.invalidateQueries();
  });
}
