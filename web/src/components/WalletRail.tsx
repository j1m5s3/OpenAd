import { erc20Abi } from 'viem';
import { useAccount, useReadContract } from 'wagmi';

import { useAdvertiser } from '../features/advertiser/api';
import { usePublisher } from '../features/publisher/api';
import { getContract, hasProtocol } from '../lib/deployments';
import { formatUsdc, shortAddress } from '../lib/format';
import { targetChainId } from '../lib/wagmi';

export function WalletRail() {
  const { address, isConnected } = useAccount();
  const deployed = hasProtocol(targetChainId);
  const usdc = deployed ? getContract(targetChainId, 'USDC') : null;
  const pub = usePublisher(address);
  const adv = useAdvertiser(address);
  const bal = useReadContract({
    address: usdc?.address,
    abi: usdc?.abi ?? erc20Abi,
    functionName: 'balanceOf',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    query: { enabled: Boolean(isConnected && usdc && address) },
  });

  if (!isConnected || !address) {
    return (
      <aside className="w-full shrink-0 lg:w-64">
        <div className="rounded-2xl border border-line bg-surface p-4 text-sm text-muted">
          Connect a wallet to see USDC, slots, and leases. Buys are one transaction; this app never
          holds your keys.
        </div>
      </aside>
    );
  }

  const balance =
    typeof bal.data === 'bigint' ? formatUsdc(bal.data) : bal.isLoading ? '…' : '—';

  return (
    <aside className="w-full shrink-0 lg:w-64">
      <div className="space-y-3 rounded-2xl border border-line bg-surface p-4">
        <p className="text-xs uppercase tracking-wide text-muted">Wallet</p>
        <p className="font-medium">{shortAddress(address)}</p>
        <p className="text-sm">{balance}</p>
        <p className="text-sm text-muted">
          Slots {pub.data?.slotIds.length ?? 0} · Leases {adv.data?.leaseCount ?? 0}
        </p>
      </div>
    </aside>
  );
}
