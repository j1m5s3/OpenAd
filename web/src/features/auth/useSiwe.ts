import { useCallback, useEffect, useRef, useState } from 'react';
import type { Address } from 'viem';
import { useAccount, useSignMessage } from 'wagmi';

import { api } from '../../lib/api';
import { buildSiweMessage } from '../../lib/permit';
import { targetChainId } from '../../lib/wagmi';

function injectedSelected(): string | null {
  if (typeof window === 'undefined') return null;
  const eth = (window as Window & { ethereum?: { selectedAddress?: string } }).ethereum;
  return eth?.selectedAddress?.toLowerCase() ?? null;
}

export function useSiwe() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [sessionAddress, setSessionAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inflight = useRef(false);
  const generation = useRef(0);

  const signIn = useCallback(
    async (next: Address) => {
      if (inflight.current) return;
      inflight.current = true;
      const mine = ++generation.current;
      setError(null);
      try {
        const { nonce } = await api.authNonce();
        // EIP-4361 `domain` is the RFC 3986 authority: host *and* port. The API only accepts a
        // message whose domain and URI match one of its allowed web origins (ADR-0009
        // amendment), so `hostname` (no port) would be rejected on any non-default port.
        const message = buildSiweMessage({
          domain: window.location.host,
          address: next,
          uri: window.location.origin,
          chainId: targetChainId,
          nonce,
        });
        const signature = await signMessageAsync({ account: next, message });
        if (mine !== generation.current) return;
        const rec = await api.authVerify(message, signature);
        if (mine !== generation.current) return;
        setSessionAddress(rec.address);
      } catch (err) {
        if (mine !== generation.current) return;
        setError(err instanceof Error ? err.message : 'SIWE failed');
      } finally {
        inflight.current = false;
      }
    },
    [signMessageAsync],
  );

  useEffect(() => {
    if (!isConnected || !address) {
      setSessionAddress(null);
      return;
    }
    const injected = injectedSelected();
    if (injected && injected !== address.toLowerCase()) return;
    if (sessionAddress === address.toLowerCase()) return;
    if (sessionAddress && sessionAddress !== address.toLowerCase()) {
      void api.authLogout();
      setSessionAddress(null);
    }
    void signIn(address);
  }, [address, isConnected, sessionAddress, signIn]);

  return { sessionAddress, error, signIn };
}
