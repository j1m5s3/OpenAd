import { getDefaultConfig, getDefaultWallets } from '@rainbow-me/rainbowkit';
import type { WalletList } from '@rainbow-me/rainbowkit';
import { injectedWallet } from '@rainbow-me/rainbowkit/wallets';
import type { Hex } from 'viem';
import { http } from 'wagmi';
import { base, baseSepolia, foundry } from 'wagmi/chains';

import { DEMO_MODE } from '../demo/flag';

export const supportedChains = [foundry, baseSepolia, base] as const;
export type SupportedChainId = (typeof supportedChains)[number]['id'];

function resolveTargetChainId(): SupportedChainId {
  // Demo mode (ADR-0016) always runs on its synthetic chain-31337 deployment, whatever
  // VITE_CHAIN_ID says, so `getContract(targetChainId, …)` resolves to the demo addresses.
  if (DEMO_MODE) return foundry.id;
  // An unset build arg bakes VITE_CHAIN_ID in as "" (empty string), not undefined — treat blank
  // the same as unset rather than letting `Number("")` silently resolve to 0.
  const raw = import.meta.env.VITE_CHAIN_ID?.trim();
  const requested = Number(raw || foundry.id);
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

/** A block-explorer link for a transaction, or `undefined` when the target chain has none
 * configured (Anvil/31337) or the build is demo mode (ADR-0016: nothing there resolves to a real
 * chain). Used by the buy receipt so it never links out from a chain with nothing to show. */
export function explorerTxUrl(chainId: SupportedChainId, hash: Hex): string | undefined {
  if (DEMO_MODE) return undefined;
  const chain = supportedChains.find((c) => c.id === chainId);
  const base = chain?.blockExplorers?.default?.url;
  return base ? `${base}/tx/${hash}` : undefined;
}

/** The trimmed WalletConnect Cloud project id, or `undefined` when the build set none. An unset
 * `--build-arg`/Cloud Build substitution bakes `VITE_WALLETCONNECT_PROJECT_ID` in as `""`, not
 * `undefined` — Vite always defines the identifier — so a plain `??` fallback never catches it.
 * `undefined` here is what tells `walletGroups` to leave WalletConnect-based wallets out. */
export function walletConnectProjectId(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

const browserWallets = { groupName: 'Browser', wallets: [injectedWallet] };

/** Wallet groups for `getDefaultConfig`: the browser (injected) group only when there is no real
 * WalletConnect project id, or in DEV. RainbowKit's own default wallets (`getDefaultWallets`) —
 * MetaMask, Rainbow, Coinbase and WalletConnect itself — each fall back to a WalletConnect
 * connector when no matching injected provider is found (e.g. a desktop browser with no
 * extension, or CI's headless Chromium), and building that connector throws synchronously, at
 * config-construction time rather than on click, when `projectId` is falsy. So a fake id is not
 * enough to make these safe: only drop them entirely when there is no real id. With a real id,
 * add them alongside the browser group. */
export function walletGroups(projectId: string | undefined, dev: boolean): WalletList {
  if (!projectId || dev) return [browserWallets];
  return [browserWallets, ...getDefaultWallets().wallets];
}

// Never a real WalletConnect id — `getDefaultConfig`'s `projectId` is required even when
// `walletGroups` includes no WalletConnect-based wallet (the no-id/DEV case above), but nothing
// in that case ever constructs a WalletConnect connector, so this value is never used. Do not
// list a WalletConnect-based wallet under this id.
const UNUSED_PLACEHOLDER_PROJECT_ID = '00000000000000000000000000000000';

/** The real wagmi/RainbowKit config (HTTP transports, browser + WalletConnect wallets). A factory,
 * not a module constant, so it is only constructed when `main.tsx` boots a non-demo build (and
 * after the ADR-0013 injector exists); demo mode builds `demo/wagmiDemo.ts` instead. */
export function createRealConfig() {
  const projectId = walletConnectProjectId(import.meta.env.VITE_WALLETCONNECT_PROJECT_ID);
  return getDefaultConfig({
    appName: 'OpenAd',
    projectId: projectId ?? UNUSED_PLACEHOLDER_PROJECT_ID,
    chains: supportedChains,
    ssr: false,
    wallets: walletGroups(projectId, import.meta.env.DEV),
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
