import type { FormEvent } from 'react';
import { useState } from 'react';
import { keccak256 } from 'viem';
import { useAccount, useWriteContract } from 'wagmi';

import { getContract, hasProtocol } from '../../lib/deployments';
import { targetChainId } from '../../lib/wagmi';
import { useAdvertiser } from './api';

export function CampaignsPage() {
  const { address, isConnected } = useAccount();
  const deployed = hasProtocol(targetChainId);
  const dash = useAdvertiser(address);
  const { writeContractAsync, isPending } = useWriteContract();
  const [hash, setHash] = useState<string>('');
  const [msg, setMsg] = useState<string | null>(null);

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

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-accent">Advertiser</p>
        <h1 className="mt-1 text-3xl font-semibold">Campaigns</h1>
        <p className="mt-2 text-muted">
          Register creatives (hashed in the browser, never uploaded here), request approval, and
          track delivery. HTML/JS creatives are out of scope — raster only.
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

      <form
        onSubmit={(e) => void registerMedia(e)}
        className="space-y-3 rounded-2xl border border-line bg-surface p-5"
      >
        <h2 className="font-medium">Register media</h2>
        <label className="block text-sm text-muted">
          File (hashed locally, never uploaded)
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="mt-1 block w-full text-ink"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onFile(file);
            }}
          />
        </label>
        <p className="break-all text-xs text-muted">keccak: {hash || '—'}</p>
        <label className="block text-sm text-muted">
          Public URI
          <input name="uri" className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink" />
        </label>
        <label className="block text-sm text-muted">
          MIME
          <select
            name="mime"
            defaultValue="image/png"
            className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink"
          >
            <option value="image/png">image/png</option>
            <option value="image/jpeg">image/jpeg</option>
            <option value="image/webp">image/webp</option>
            <option value="image/gif">image/gif</option>
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm text-muted">
            Width
            <input
              name="width"
              defaultValue="300"
              className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink"
            />
          </label>
          <label className="block text-sm text-muted">
            Height
            <input
              name="height"
              defaultValue="250"
              className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink"
            />
          </label>
        </div>
        <label className="block text-sm text-muted">
          Click URL
          <input name="clickUrl" className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink" />
        </label>
        <button
          type="submit"
          disabled={isPending || !hash}
          className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-accent-ink disabled:opacity-40"
        >
          Register
        </button>
      </form>

      <form
        onSubmit={(e) => void registerNft(e)}
        className="space-y-3 rounded-2xl border border-line bg-surface p-5"
      >
        <h2 className="font-medium">Register NFT creative</h2>
        <label className="block text-sm text-muted">
          NFT chain id
          <input
            name="nftChainId"
            defaultValue={String(targetChainId)}
            className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink"
          />
        </label>
        <label className="block text-sm text-muted">
          Contract
          <input name="nftContract" className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink" />
        </label>
        <label className="block text-sm text-muted">
          Token id
          <input name="nftTokenId" className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink" />
        </label>
        <label className="block text-sm text-muted">
          Standard
          <select
            name="nftStandard"
            defaultValue="1"
            className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink"
          >
            <option value="1">ERC-721</option>
            <option value="2">ERC-1155</option>
          </select>
        </label>
        <label className="block text-sm text-muted">
          Click URL
          <input name="clickUrl" className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink" />
        </label>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-accent-ink disabled:opacity-40"
        >
          Register NFT
        </button>
      </form>

      <form
        onSubmit={(e) => void requestApproval(e)}
        className="space-y-3 rounded-2xl border border-line bg-surface p-5"
      >
        <h2 className="font-medium">Request approval</h2>
        <label className="block text-sm text-muted">
          Publisher
          <input name="publisher" className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink" />
        </label>
        <label className="block text-sm text-muted">
          Creative
          {(dash.data?.creativeIds.length ?? 0) > 0 ? (
            <select
              name="creativeId"
              className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink"
            >
              {dash.data?.creativeIds.map((id) => (
                <option key={id} value={id}>
                  #{id}
                </option>
              ))}
            </select>
          ) : (
            <input
              name="creativeId"
              className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink"
              aria-label="Creative id"
            />
          )}
        </label>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-accent-ink disabled:opacity-40"
        >
          Request
        </button>
      </form>
    </div>
  );
}
