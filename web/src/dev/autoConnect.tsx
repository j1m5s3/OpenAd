import { useEffect } from 'react';
import { useAccount, useConnect, useDisconnect } from 'wagmi';

import { targetChainId } from '../lib/wagmi';
import { isOpenAdDevWallet, pickDevWalletConnector } from './pickConnector';

type InjectedEth = {
  isOpenAdDevWallet?: boolean;
  selectedAddress?: string;
};

/** DEV + ADR-0013 injector only: connect RainbowKit to the Anvil forwarder. */
export function DevWalletAutoConnect() {
  const { connectAsync, connectors } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const { address, isConnected } = useAccount();

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (typeof window === 'undefined') return;
    const eth = (window as Window & { ethereum?: InjectedEth }).ethereum;
    if (!isOpenAdDevWallet(eth)) return;

    const want = eth.selectedAddress?.toLowerCase();
    if (isConnected && address && want && address.toLowerCase() !== want) {
      void disconnectAsync();
      return;
    }
    if (isConnected) return;

    const injected = pickDevWalletConnector(connectors);
    if (!injected) return;

    let cancelled = false;
    void connectAsync({ connector: injected, chainId: targetChainId }).catch((err: unknown) => {
      if (!cancelled) {
        console.warn('devwallet connect', err instanceof Error ? err.message : err);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [address, connectAsync, connectors, disconnectAsync, isConnected]);

  return null;
}
