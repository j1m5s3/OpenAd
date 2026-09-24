import { getDefaultConfig, getDefaultWallets } from '@rainbow-me/rainbowkit';
import { injectedWallet } from '@rainbow-me/rainbowkit/wallets';
import { http } from 'wagmi';
import { base, baseSepolia, foundry } from 'wagmi/chains';

import { DEMO_MODE } from '../demo/flag';

export const supportedChains = [foundry, baseSepolia, base] as const;
export type SupportedChainId = (typeof supportedChains)[number]['id'];

function resolveTargetChainId(): SupportedChainId {
  // Demo mode (ADR-0016) always runs on its synthetic chain-31337 deployment, whatever
  // VITE_CHAIN_ID says, so `getContract(targetChainId, …)` resolves to the demo addresses.
  if (DEMO_MODE) return foundry.id;
  const requested = Number(import.meta.env.VITE_CHAIN_ID ?? foundry.id);
  const match = supportedChains.find((c) => c.id === requested);
  if (!match) {
    console.warn(
      `VITE_CHAIN_ID=${requested} is not supported; falling back to Anvil (${foundry.id}).`,
    );
    return foundry.id;
  }
  return match.id;
}

export const targetChainId: SupportedChainId = resolveTargetChainId();

const walletConnectProjectId =
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? '00000000000000000000000000000000';

const browserWallets = { groupName: 'Browser', wallets: [injectedWallet] };

/** The real wagmi/RainbowKit config (HTTP transports, browser + WalletConnect wallets). A factory,
 * not a module constant, so it is only constructed when `main.tsx` boots a non-demo build (and
 * after the ADR-0013 injector exists); demo mode builds `demo/wagmiDemo.ts` instead. */
export function createRealConfig() {
  return getDefaultConfig({
    appName: 'OpenAd',
    projectId: walletConnectProjectId,
    chains: supportedChains,
    ssr: false,
    wallets: import.meta.env.DEV
      ? [browserWallets]
      : [browserWallets, ...getDefaultWallets().wallets],
    transports: {
      [foundry.id]: http('http://127.0.0.1:8545'),
      [baseSepolia.id]: http(),
      [base.id]: http(),
    },
  });
}

export type OpenAdWagmiConfig = ReturnType<typeof createRealConfig>;

declare module 'wagmi' {
  interface Register {
    config: OpenAdWagmiConfig;
  }
}
