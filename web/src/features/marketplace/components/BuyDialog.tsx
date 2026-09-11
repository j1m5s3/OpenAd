import { useState } from 'react';
import type { Hex } from 'viem';
import { useAccount, useReadContract, useSignTypedData, useWriteContract } from 'wagmi';

import { formatUsdc } from '../../../lib/format';
import { getContract, hasProtocol } from '../../../lib/deployments';
import { buyCtaLabel, permitDeadline, splitSignature, usdcPermitTypes } from '../../../lib/permit';
import { targetChainId } from '../../../lib/wagmi';

type Quote = {
  sellable: boolean;
  reason: string;
  price: bigint;
  fee: bigint;
  open_at?: bigint;
  start?: bigint;
  end?: bigint;
};

export function BuyDialog({
  slotId,
  periodIndex,
  remainder = false,
  onClose,
}: {
  slotId: string;
  periodIndex: string;
  remainder?: boolean;
  onClose: () => void;
}) {
  const { address, isConnected } = useAccount();
  const [creativeId, setCreativeId] = useState('1');
  const [status, setStatus] = useState<string | null>(null);
  const deployed = hasProtocol(targetChainId);
  const market = deployed ? getContract(targetChainId, 'Marketplace') : null;
  const usdc = deployed ? getContract(targetChainId, 'USDC') : null;
  const { signTypedDataAsync } = useSignTypedData();
  const { writeContractAsync, isPending } = useWriteContract();

  const quote = useReadContract({
    address: market?.address,
    abi: market?.abi,
    functionName: 'quote',
    args: [BigInt(slotId), BigInt(periodIndex)],
    query: { enabled: Boolean(market), refetchInterval: 4_000 },
  });

  const tokenName = useReadContract({
    address: usdc?.address,
    abi: usdc?.abi,
    functionName: 'name',
    query: { enabled: Boolean(usdc) },
  });

  const nonce = useReadContract({
    address: usdc?.address,
    abi: usdc?.abi,
    functionName: 'nonces',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    query: { enabled: Boolean(usdc && address) },
  });

  const q = quote.data as Quote | undefined;
  const price = q?.price ?? 0n;

  async function onBuy() {
    if (!market || !usdc || !address || !q) return;
    setStatus(null);
    const deadline = permitDeadline();
    const typedName = typeof tokenName.data === 'string' ? tokenName.data : 'USD Coin';
    const signature = await signTypedDataAsync({
      domain: {
        name: typedName,
        version: '1',
        chainId: targetChainId,
        verifyingContract: usdc.address,
      },
      types: usdcPermitTypes,
      primaryType: 'Permit',
      message: {
        owner: address,
        spender: market.address,
        value: price,
        nonce: typeof nonce.data === 'bigint' ? nonce.data : 0n,
        deadline,
      },
    });
    const { v, r, s } = splitSignature(signature as Hex);
    await writeContractAsync({
      address: market.address,
      abi: market.abi,
      functionName: 'buy_with_permit',
      args: [BigInt(slotId), BigInt(periodIndex), BigInt(creativeId), price, deadline, v, r, s],
    });
    setStatus('Submitted');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold">Buy period {periodIndex}</h2>
          <button type="button" className="text-muted" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="mt-2 text-sm text-muted">
          Live quote from Marketplace. One transaction via USDC permit.
        </p>
        <p className="mt-4 text-2xl font-semibold">
          {quote.isFetching ? '…' : formatUsdc(price)}
        </p>
        {q && !q.sellable && (
          <p className="mt-2 text-sm text-muted">{q.reason || 'not sellable'}</p>
        )}
        <label className="mt-4 block text-sm text-muted">
          Creative id
          <input
            value={creativeId}
            onChange={(e) => setCreativeId(e.target.value)}
            className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink"
          />
        </label>
        <button
          type="button"
          disabled={!isConnected || !q?.sellable || isPending}
          onClick={() => void onBuy()}
          className="mt-5 w-full rounded-full bg-accent py-2 font-medium text-accent-ink disabled:opacity-40"
        >
          {buyCtaLabel(Boolean(q?.sellable), remainder)}
        </button>
        {status && <p className="mt-3 text-sm text-muted">{status}</p>}
      </div>
    </div>
  );
}
