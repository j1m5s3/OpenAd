// Chains, connectors, transports. Writes to contracts go through wagmi hooks only.
import { createConfig, http } from 'wagmi';
import { base, baseSepolia, foundry } from 'wagmi/chains';
import { coinbaseWallet, injected } from 'wagmi/connectors';

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

/** The chain this build targets (VITE_CHAIN_ID). Contract writes and the deployments artifact use it. */
export const targetChainId: SupportedChainId = resolveTargetChainId();

export const wagmiConfig = createConfig({
  chains: supportedChains,
  connectors: [injected(), coinbaseWallet({ appName: 'OpenAd', preference: 'all' })],
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
