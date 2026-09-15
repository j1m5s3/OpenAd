import { useEffect, useState } from 'react';
import type { Hex } from 'viem';
import {
  useAccount,
  useReadContract,
  useSignTypedData,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';

import { FieldLabel } from '../../../components/Field';
import { Wizard } from '../../../components/Wizard';
import { WIZARD_COPY } from '../../../lib/copy';
import { getContract, hasCampaignVault } from '../../../lib/deployments';
import { parseUsdc } from '../../../lib/format';
import { permitDeadline, splitSignature, usdcPermitTypes } from '../../../lib/permit';
import { targetChainId } from '../../../lib/wagmi';
import { useAdvertiser, useAdvertiserCreatives } from '../api';

async function signUsdcPermit(opts: {
  signTypedDataAsync: ReturnType<typeof useSignTypedData>['signTypedDataAsync'];
  tokenName: string;
  usdcAddress: `0x${string}`;
  owner: `0x${string}`;
  spender: `0x${string}`;
  value: bigint;
  nonce: bigint;
}): Promise<{ deadline: bigint; v: number; r: Hex; s: Hex }> {
  const deadline = permitDeadline();
  const signature = await opts.signTypedDataAsync({
    domain: {
      name: opts.tokenName,
      version: '2',
      chainId: targetChainId,
      verifyingContract: opts.usdcAddress,
    },
    types: usdcPermitTypes,
    primaryType: 'Permit',
    message: {
      owner: opts.owner,
      spender: opts.spender,
      value: opts.value,
      nonce: opts.nonce,
      deadline,
    },
  });
  return { deadline, ...splitSignature(signature as Hex) };
}

export function OpenCampaignDialog({ onClose }: { onClose: () => void }) {
  const { address, isConnected } = useAccount();
  const dash = useAdvertiser(address);
  const creativeQueries = useAdvertiserCreatives(dash.data?.creativeIds);
  const owned = creativeQueries
    .map((q) => q.data)
    .filter((c): c is NonNullable<typeof c> => Boolean(c && !c.revoked));
  const [creativeId, setCreativeId] = useState('1');
  const [step, setStep] = useState('slotCreative');
  const [slotId, setSlotId] = useState('3');
  const [maxCpc, setMaxCpc] = useState('0.2');
  const [budget, setBudget] = useState('10');
  const [status, setStatus] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<Hex | undefined>(undefined);
  const deployed = hasCampaignVault(targetChainId);
  const vault = deployed ? getContract(targetChainId, 'CampaignVault') : null;
  const usdc = deployed ? getContract(targetChainId, 'USDC') : null;
  const { signTypedDataAsync } = useSignTypedData();
  const { writeContractAsync, isPending } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: txHash, query: { enabled: Boolean(txHash) } });

  useEffect(() => {
    const first = dash.data?.creativeIds[0];
    if (first) setCreativeId(first);
  }, [dash.data?.creativeIds]);

  useEffect(() => {
    if (receipt.isSuccess) {
      setStatus('Confirmed on chain. The campaign appears after the indexer catches up.');
    }
    if (receipt.isError) {
      setStatus(receipt.error?.message ?? 'Transaction failed');
    }
  }, [receipt.isSuccess, receipt.isError, receipt.error]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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

  const waiting = isPending || (Boolean(txHash) && !receipt.isSuccess && !receipt.isError);
  const oc = WIZARD_COPY.openCampaign;
  const stepIds = ['slotCreative', 'bidBudget', 'fund'] as const;
  const statusOf = (id: string) => {
    const a = stepIds.indexOf(step as (typeof stepIds)[number]);
    const i = stepIds.indexOf(id as (typeof stepIds)[number]);
    if (i < a) return 'done' as const;
    if (i === a) return 'active' as const;
    return 'todo' as const;
  };

  async function onOpen() {
    if (!vault || !usdc || !address) return;
    setStatus(null);
    setTxHash(undefined);
    try {
      const value = parseUsdc(budget);
      const typedName = typeof tokenName.data === 'string' ? tokenName.data : 'USD Coin (Mock)';
      const permit = await signUsdcPermit({
        signTypedDataAsync,
        tokenName: typedName,
        usdcAddress: usdc.address,
        owner: address,
        spender: vault.address,
        value,
        nonce: typeof nonce.data === 'bigint' ? nonce.data : 0n,
      });
      const hash = await writeContractAsync({
        address: vault.address,
        abi: vault.abi,
        functionName: 'open_campaign_with_permit',
        args: [
          BigInt(slotId),
          BigInt(creativeId),
          parseUsdc(maxCpc),
          value,
          0n,
          0n,
          permit.deadline,
          permit.v,
          permit.r,
          permit.s,
        ],
      });
      setTxHash(hash);
      setStatus('Submitted — waiting for confirmation…');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="open-campaign-title"
        className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-line bg-surface p-6 shadow-xl"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="open-campaign-title" className="text-lg font-semibold">
            Open campaign
          </h2>
          <button type="button" className="text-muted" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="mt-2 text-sm text-muted">
          Escrow USDC in CampaignVault for a CPC slot. Matching happens at serve. This is not a
          period buy.
        </p>
        <div className="mt-4">
          <Wizard
            bare
            activeId={step}
            onSelect={setStep}
            steps={[
              {
                id: 'slotCreative',
                title: oc.slotCreative.title,
                description: oc.slotCreative.description,
                whatNext: oc.slotCreative.whatNext,
                status: statusOf('slotCreative'),
                content: (
                  <div className="space-y-3">
                    <FieldLabel label="Slot id" hintKey="campaignSlotId">
                      <input
                        value={slotId}
                        onChange={(e) => setSlotId(e.target.value)}
                        className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink"
                      />
                    </FieldLabel>
                    <FieldLabel label="Creative" hintKey="campaignCreativeId">
                      {owned.length > 0 ? (
                        <select
                          value={creativeId}
                          onChange={(e) => setCreativeId(e.target.value)}
                          className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink"
                        >
                          {owned.map((c) => (
                            <option key={c.creativeId} value={c.creativeId}>
                              #{c.creativeId} · {c.mime} · {c.width}×{c.height}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={creativeId}
                          onChange={(e) => setCreativeId(e.target.value)}
                          className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink"
                          aria-label="Creative id"
                        />
                      )}
                    </FieldLabel>
                  </div>
                ),
              },
              {
                id: 'bidBudget',
                title: oc.bidBudget.title,
                description: oc.bidBudget.description,
                whatNext: oc.bidBudget.whatNext,
                status: statusOf('bidBudget'),
                content: (
                  <div className="space-y-3">
                    <FieldLabel label="Max CPC (USDC)" hintKey="maxCpc">
                      <input
                        value={maxCpc}
                        onChange={(e) => setMaxCpc(e.target.value)}
                        className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink"
                      />
                    </FieldLabel>
                    <FieldLabel label="Budget (USDC)" hintKey="campaignBudget">
                      <input
                        value={budget}
                        onChange={(e) => setBudget(e.target.value)}
                        className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink"
                      />
                    </FieldLabel>
                  </div>
                ),
              },
              {
                id: 'fund',
                title: oc.fund.title,
                description: oc.fund.description,
                whatNext: oc.fund.whatNext,
                status: statusOf('fund'),
                content: (
                  <div className="space-y-3">
                    <p className="text-sm text-muted">
                      Slot {slotId} · creative {creativeId} · max {maxCpc} USDC · budget {budget}{' '}
                      USDC
                    </p>
                    {!isConnected && (
                      <p className="text-sm text-ink">Connect a wallet to sign the permit and fund.</p>
                    )}
                    {!deployed && (
                      <p className="text-sm text-muted">
                        CampaignVault is not in the deployments artifact.
                      </p>
                    )}
                    <button
                      type="button"
                      disabled={!isConnected || !deployed || waiting}
                      onClick={() => void onOpen()}
                      className="w-full rounded-full bg-accent py-2 font-medium text-accent-ink disabled:opacity-40"
                    >
                      Fund with permit
                    </button>
                  </div>
                ),
              },
            ]}
          />
        </div>
        {status && <p className="mt-3 text-sm text-muted">{status}</p>}
      </div>
    </div>
  );
}

export function TopUpDialog({
  campaignId,
  onClose,
}: {
  campaignId: string;
  onClose: () => void;
}) {
  const { address, isConnected } = useAccount();
  const [amount, setAmount] = useState('5');
  const [status, setStatus] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<Hex | undefined>(undefined);
  const deployed = hasCampaignVault(targetChainId);
  const vault = deployed ? getContract(targetChainId, 'CampaignVault') : null;
  const usdc = deployed ? getContract(targetChainId, 'USDC') : null;
  const { signTypedDataAsync } = useSignTypedData();
  const { writeContractAsync, isPending } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: txHash, query: { enabled: Boolean(txHash) } });

  useEffect(() => {
    if (receipt.isSuccess) setStatus('Confirmed on chain. Remaining updates after the indexer.');
    if (receipt.isError) setStatus(receipt.error?.message ?? 'Transaction failed');
  }, [receipt.isSuccess, receipt.isError, receipt.error]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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
  const waiting = isPending || (Boolean(txHash) && !receipt.isSuccess && !receipt.isError);

  async function onTopUp() {
    if (!vault || !usdc || !address) return;
    setStatus(null);
    setTxHash(undefined);
    try {
      const value = parseUsdc(amount);
      const typedName = typeof tokenName.data === 'string' ? tokenName.data : 'USD Coin (Mock)';
      const permit = await signUsdcPermit({
        signTypedDataAsync,
        tokenName: typedName,
        usdcAddress: usdc.address,
        owner: address,
        spender: vault.address,
        value,
        nonce: typeof nonce.data === 'bigint' ? nonce.data : 0n,
      });
      const hash = await writeContractAsync({
        address: vault.address,
        abi: vault.abi,
        functionName: 'top_up_with_permit',
        args: [BigInt(campaignId), value, permit.deadline, permit.v, permit.r, permit.s],
      });
      setTxHash(hash);
      setStatus('Submitted — waiting for confirmation…');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="top-up-title"
        className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-xl"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="top-up-title" className="text-lg font-semibold">
            Top up campaign {campaignId}
          </h2>
          <button type="button" className="text-muted" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="mt-4">
          <FieldLabel label="Amount (USDC)" hintKey="topUpAmount">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink"
            />
          </FieldLabel>
        </div>
        <button
          type="button"
          disabled={!isConnected || !deployed || waiting}
          onClick={() => void onTopUp()}
          className="mt-5 w-full rounded-full bg-accent py-2 font-medium text-accent-ink disabled:opacity-40"
        >
          Top up with permit
        </button>
        {status && <p className="mt-3 text-sm text-muted">{status}</p>}
      </div>
    </div>
  );
}
