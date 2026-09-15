import type { FormEvent } from 'react';
import { useState } from 'react';
import { keccak256 } from 'viem';
import { useAccount, useWriteContract } from 'wagmi';

import type { AdvertiserOut } from '../../lib/api';
import { getContract, hasProtocol } from '../../lib/deployments';
import { formatUsdc } from '../../lib/format';
import { quoteFeeCopy } from '../../lib/permit';
import { targetChainId } from '../../lib/wagmi';
import { useAdvertiser } from './api';
import { CreativeWizard } from './components/CreativeWizard';
import { OpenCampaignDialog, TopUpDialog } from './components/OpenCampaignDialog';

type CampaignRow = AdvertiserOut['campaigns'][number];

function campaignStatusLabel(c: CampaignRow): string {
  if (c.closed) return 'Closed';
  if (c.closeAfter > 0) return 'Closing';
  if (c.paused) return 'Paused';
  return 'Open';
}

export function CampaignsPage() {
  const { address, isConnected } = useAccount();
  const deployed = hasProtocol(targetChainId);
  const dash = useAdvertiser(address);
  const { writeContractAsync, isPending } = useWriteContract();
  const [hash, setHash] = useState<string>('');
  const [msg, setMsg] = useState<string | null>(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [topUpId, setTopUpId] = useState<string | null>(null);

  async function onFile(file: File) {
    const buf = new Uint8Array(await file.arrayBuffer());
    setHash(keccak256(buf));
  }

  async function registerMedia(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const registry = getContract(targetChainId, 'CreativeRegistry');
    await writeContractAsync({
      ...registry,
      functionName: 'register_media',
      args: [
        String(fd.get('uri')),
        hash as `0x${string}`,
        String(fd.get('mime')),
        Number(fd.get('width')),
        Number(fd.get('height')),
        String(fd.get('clickUrl')),
      ],
    });
    setMsg('Creative registered');
  }

  async function registerNft(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const registry = getContract(targetChainId, 'CreativeRegistry');
    await writeContractAsync({
      ...registry,
      functionName: 'register_nft',
      args: [
        BigInt(String(fd.get('nftChainId'))),
        String(fd.get('nftContract')),
        BigInt(String(fd.get('nftTokenId'))),
        Number(fd.get('nftStandard')),
        String(fd.get('clickUrl')),
      ],
    });
    setMsg('NFT creative registered');
  }

  async function requestApproval(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const registry = getContract(targetChainId, 'CreativeRegistry');
    await writeContractAsync({
      ...registry,
      functionName: 'request_approval',
      args: [String(fd.get('publisher')), BigInt(String(fd.get('creativeId')))],
    });
    setMsg('Approval requested');
  }

  async function vaultWrite(functionName: 'set_paused' | 'request_close' | 'finalize_close', args: readonly unknown[]) {
    const vault = getContract(targetChainId, 'CampaignVault');
    await writeContractAsync({
      ...vault,
      functionName,
      args,
    });
    setMsg(`${functionName.replaceAll('_', ' ')} submitted`);
  }

  const campaigns = dash.data?.campaigns ?? [];

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-accent">Advertiser</p>
        <h1 className="mt-1 text-3xl font-semibold">Campaigns</h1>
        <p className="mt-2 text-muted">
          Register creatives (hashed in the browser, never uploaded here), request approval, fund
          CPC campaigns, and track delivery. HTML/JS creatives are out of scope — raster only.
        </p>
      </div>
      {!isConnected && <p className="text-muted">Connect a wallet to register creatives.</p>}
      {!deployed && (
        <p className="rounded-2xl border border-line bg-surface p-4 text-sm text-muted">
          Protocol is not deployed on chain {targetChainId}.
        </p>
      )}
      {msg && <p className="text-sm text-accent">{msg}</p>}

      <section className="rounded-2xl border border-line bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-medium">CPC campaigns</h2>
          <button
            type="button"
            onClick={() => setOpenDialog(true)}
            className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-accent-ink"
          >
            Open campaign
          </button>
        </div>
        <p className="mt-2 text-sm text-muted">
          Fund escrow in CampaignVault. Serve picks a winner at the publisher floor CPC. This is
          not a period buy.
        </p>
        <ul className="mt-4 space-y-4">
          {campaigns.map((c) => (
            <li key={c.campaignId} className="rounded-xl border border-line p-4 text-sm">
              <p>
                Campaign {c.campaignId} · slot {c.slotId} · creative {c.creativeId} ·{' '}
                {campaignStatusLabel(c)}
              </p>
              <p className="mt-1 text-muted">
                Max {formatUsdc(BigInt(c.maxCpc))} · remaining {formatUsdc(BigInt(c.remaining))} of{' '}
                {formatUsdc(BigInt(c.budget))} · {c.serves} serves
              </p>
              {!c.closed && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-full border border-line px-3 py-1"
                    onClick={() => setTopUpId(c.campaignId)}
                  >
                    Top up
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-line px-3 py-1"
                    disabled={isPending}
                    onClick={() => void vaultWrite('set_paused', [BigInt(c.campaignId), !c.paused])}
                  >
                    {c.paused ? 'Unpause' : 'Pause'}
                  </button>
                  {c.closeAfter === 0 ? (
                    <button
                      type="button"
                      className="rounded-full border border-line px-3 py-1"
                      disabled={isPending}
                      onClick={() => void vaultWrite('request_close', [BigInt(c.campaignId)])}
                    >
                      Request close
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="rounded-full border border-line px-3 py-1"
                      disabled={isPending}
                      onClick={() => void vaultWrite('finalize_close', [BigInt(c.campaignId)])}
                    >
                      Finalize close
                    </button>
                  )}
                </div>
              )}
              {c.settlements.length > 0 && (
                <ul className="mt-3 space-y-1 text-xs text-muted">
                  {c.settlements.map((s) => (
                    <li key={s.batchId}>
                      Settle {s.payableClicks} clicks · {formatUsdc(BigInt(s.charged))} charged ·{' '}
                      {quoteFeeCopy(BigInt(s.charged), BigInt(s.fee)).line}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
          {campaigns.length === 0 && (
            <li className="text-muted">No campaigns yet. Open one on a CPC slot.</li>
          )}
        </ul>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="font-medium">Leases & delivery</h2>
        <p className="mt-2 text-sm text-muted">
          Creatives: {dash.data?.creativeIds.join(', ') || 'none'} · leases {dash.data?.leaseCount ?? 0}
        </p>
        <ul className="mt-3 space-y-1 text-sm">
          {(dash.data?.delivery ?? []).map((d) => (
            <li key={`${d.slotId}-${d.periodIndex}`}>
              Slot {d.slotId} period {d.periodIndex}: {d.serves} serves
            </li>
          ))}
        </ul>
        {dash.data && (
          <p className="mt-2 text-xs text-muted">Earnings shown on Supply are publisher-side.</p>
        )}
      </section>

      <CreativeWizard
        pending={isPending}
        hash={hash}
        creativeIds={dash.data?.creativeIds ?? []}
        onFile={onFile}
        onRegisterMedia={registerMedia}
        onRegisterNft={registerNft}
        onRequestApproval={requestApproval}
      />

      {openDialog && <OpenCampaignDialog onClose={() => setOpenDialog(false)} />}
      {topUpId && <TopUpDialog campaignId={topUpId} onClose={() => setTopUpId(null)} />}
    </div>
  );
}
