import { getDefaultConfig, getDefaultWallets } from '@rainbow-me/rainbowkit';
import { injectedWallet } from '@rainbow-me/rainbowkit/wallets';
import { http } from 'wagmi';
import { base, baseSepolia, foundry } from 'wagmi/chains';

export const supportedChains = [foundry, baseSepolia, base] as const;
export type SupportedChainId = (typeof supportedChains)[number]['id'];

function resolveTargetChainId(): SupportedChainId {
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

export const wagmiConfig = getDefaultConfig({
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

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig;
  }
}
