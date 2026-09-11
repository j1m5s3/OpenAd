import { useCallback, useEffect, useRef, useState } from 'react';
import type { Address } from 'viem';
import { useAccount, useSignMessage } from 'wagmi';

import { api } from '../../lib/api';
import { buildSiweMessage } from '../../lib/permit';
import { targetChainId } from '../../lib/wagmi';

export function useSiwe() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [sessionAddress, setSessionAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inflight = useRef(false);

  const signIn = useCallback(
    async (next: Address) => {
      if (inflight.current) return;
      inflight.current = true;
      setError(null);
      try {
        const { nonce } = await api.authNonce();
        const message = buildSiweMessage({
          domain: window.location.hostname,
          address: next,
          uri: window.location.origin,
          chainId: targetChainId,
          nonce,
        });
        const signature = await signMessageAsync({ message });
        const rec = await api.authVerify(message, signature);
        setSessionAddress(rec.address);
      } catch (err) {
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
    if (sessionAddress === address.toLowerCase()) return;
    void signIn(address);
  }, [address, isConnected, sessionAddress, signIn]);

  return { sessionAddress, error, signIn };
}
