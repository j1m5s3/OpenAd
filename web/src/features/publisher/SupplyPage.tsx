import type { FormEvent, ReactNode } from 'react';
import { useState } from 'react';
import { useAccount, useWriteContract } from 'wagmi';

import { api } from '../../lib/api';
import { formatUsdc, parseUsdc } from '../../lib/format';
import { getContract, hasProtocol } from '../../lib/deployments';
import { targetChainId } from '../../lib/wagmi';
import { approvalActionLabel } from './components/ApproveDialog';
import { usePublisher, usePublisherApprovals } from './api';

export function SupplyPage() {
  const { address, isConnected } = useAccount();
  const deployed = hasProtocol(targetChainId);
  const pub = usePublisher(address);
  const approvals = usePublisherApprovals(address);
  const { writeContractAsync, isPending } = useWriteContract();
  const [msg, setMsg] = useState<string | null>(null);

  async function mint(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!deployed) return;
    const fd = new FormData(e.currentTarget);
    const adSlot = getContract(targetChainId, 'AdSlot');
    await writeContractAsync({
      ...adSlot,
      functionName: 'mint_slot',
      args: [
        {
          width: Number(fd.get('width')),
          height: Number(fd.get('height')),
          kind: Number(fd.get('kind')),
          domain: String(fd.get('domain')),
        },
      ],
    });
    setMsg('Mint submitted');
  }

  async function setCalendar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const adSlot = getContract(targetChainId, 'AdSlot');
    await writeContractAsync({
      ...adSlot,
      functionName: 'set_calendar',
      args: [
        BigInt(String(fd.get('slotId'))),
        BigInt(String(fd.get('periodSeconds'))),
        BigInt(String(fd.get('firstStart'))),
      ],
    });
    setMsg('Calendar submitted');
  }

  async function setTerms(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const market = getContract(targetChainId, 'Marketplace');
    await writeContractAsync({
      ...market,
      functionName: 'set_terms',
      args: [
        BigInt(String(fd.get('slotId'))),
        parseUsdc(String(fd.get('startPrice'))),
        parseUsdc(String(fd.get('floorPrice'))),
        BigInt(String(fd.get('leadSeconds'))),
        0n,
        Number(fd.get('approvalMode')),
      ],
    });
    setMsg('Terms submitted');
  }

  async function setPaused(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const market = getContract(targetChainId, 'Marketplace');
    await writeContractAsync({
      ...market,
      functionName: 'set_paused',
      args: [BigInt(String(fd.get('slotId'))), fd.get('paused') === 'on'],
    });
    setMsg('Pause submitted');
  }

  async function setApproval(creativeId: string, approved: boolean) {
    const registry = getContract(targetChainId, 'CreativeRegistry');
    await writeContractAsync({
      ...registry,
      functionName: 'set_approval',
      args: [BigInt(creativeId), approved],
    });
    setMsg(approvalActionLabel(approved));
  }

  async function setAllowlist(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const registry = getContract(targetChainId, 'CreativeRegistry');
    await writeContractAsync({
      ...registry,
      functionName: 'set_advertiser_allowed',
      args: [String(fd.get('advertiser')), fd.get('allowed') === 'on'],
    });
    setMsg('Allowlist updated');
  }

  async function saveHouse(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await api.putHouseAd(String(fd.get('slotId')), {
      mediaUrl: String(fd.get('mediaUrl')),
      clickUrl: String(fd.get('clickUrl')),
    });
    setMsg('House ad saved');
  }

  async function suggest(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!address) return;
    const fd = new FormData(e.currentTarget);
    const rec = await api.pricingSuggestion(address, String(fd.get('slotId')));
    setMsg(`Suggested start ${rec.suggestedStartPrice} floor ${rec.suggestedFloorPrice}`);
  }

  async function verifyDomain(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const rec = await api.startDomainVerification(String(fd.get('slotId')));
    setMsg(`Verification token ${String(rec.token)}`);
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-accent">Publisher</p>
        <h1 className="mt-1 text-3xl font-semibold">Supply</h1>
        <p className="mt-2 text-muted">Mint slots, set calendars and terms, approve creatives.</p>
      </div>
      {!isConnected && <p className="text-muted">Connect the wallet that owns your slots.</p>}
      {!deployed && (
        <p className="rounded-2xl border border-line bg-surface p-4 text-sm text-muted">
          Protocol is not deployed on chain {targetChainId}.
        </p>
      )}
      {msg && <p className="text-sm text-accent">{msg}</p>}

      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="font-medium">Earnings</h2>
        <p className="mt-2 text-2xl">
          {pub.data ? formatUsdc(BigInt(pub.data.earningsUsdc)) : '—'}
        </p>
        <p className="mt-1 text-sm text-muted">Slots: {pub.data?.slotIds.join(', ') || 'none'}</p>
      </section>

      <FormCard title="Pricing suggestion" onSubmit={(e) => void suggest(e)} pending={false}>
        <Field name="slotId" label="Slot id" defaultValue="1" />
      </FormCard>

      <FormCard title="Mint slot" onSubmit={(e) => void mint(e)} pending={isPending}>
        <Field name="domain" label="Domain" placeholder="example.com" />
        <Field name="width" label="Width" defaultValue="300" />
        <Field name="height" label="Height" defaultValue="250" />
        <Field name="kind" label="Kind (0 display)" defaultValue="0" />
      </FormCard>

      <FormCard title="Calendar" onSubmit={(e) => void setCalendar(e)} pending={isPending}>
        <Field name="slotId" label="Slot id" defaultValue="1" />
        <Field name="periodSeconds" label="Period seconds" defaultValue="86400" />
        <Field
          name="firstStart"
          label="First period start (unix)"
          defaultValue={String(Math.floor(Date.now() / 1000) + 3600)}
        />
      </FormCard>

      <FormCard title="Terms" onSubmit={(e) => void setTerms(e)} pending={isPending}>
        <Field name="slotId" label="Slot id" defaultValue="1" />
        <Field name="startPrice" label="Start USDC" defaultValue="10" />
        <Field name="floorPrice" label="Floor USDC" defaultValue="1" />
        <Field name="leadSeconds" label="Lead seconds" defaultValue="3600" />
        <Field name="approvalMode" label="Approval mode (0 required)" defaultValue="0" />
      </FormCard>

      <FormCard title="Pause sales" onSubmit={(e) => void setPaused(e)} pending={isPending}>
        <Field name="slotId" label="Slot id" defaultValue="1" />
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" name="paused" className="accent-accent" />
          Paused
        </label>
      </FormCard>

      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="font-medium">Approvals inbox</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {(approvals.data ?? []).map((a) => (
            <li key={a.creativeId} className="flex items-center justify-between gap-3">
              <span>
                Creative {a.creativeId} · status {a.status}
              </span>
              <span className="flex gap-2">
                <button
                  type="button"
                  className="rounded-full bg-accent px-3 py-1 text-accent-ink"
                  onClick={() => void setApproval(a.creativeId, true)}
                >
                  {approvalActionLabel(true)}
                </button>
                <button
                  type="button"
                  className="rounded-full border border-line px-3 py-1"
                  onClick={() => void setApproval(a.creativeId, false)}
                >
                  {approvalActionLabel(false)}
                </button>
              </span>
            </li>
          ))}
          {(approvals.data ?? []).length === 0 && (
            <li className="text-muted">No approval requests.</li>
          )}
        </ul>
      </section>

      <FormCard title="Allowlist" onSubmit={(e) => void setAllowlist(e)} pending={isPending}>
        <Field name="advertiser" label="Advertiser address" placeholder="0x…" />
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" name="allowed" defaultChecked className="accent-accent" />
          Allowed
        </label>
      </FormCard>

      <FormCard title="House ad" onSubmit={(e) => void saveHouse(e)} pending={false}>
        <Field name="slotId" label="Slot id" defaultValue="1" />
        <Field name="mediaUrl" label="Media URL" placeholder="https://" />
        <Field name="clickUrl" label="Click URL" placeholder="https://" />
      </FormCard>

      <FormCard title="Domain verification" onSubmit={(e) => void verifyDomain(e)} pending={false}>
        <Field name="slotId" label="Slot id" defaultValue="1" />
      </FormCard>
    </div>
  );
}

function FormCard({
  title,
  onSubmit,
  pending,
  children,
}: {
  title: string;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  pending: boolean;
  children: ReactNode;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-2xl border border-line bg-surface p-5">
      <h2 className="font-medium">{title}</h2>
      {children}
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-accent-ink disabled:opacity-40"
      >
        Submit
      </button>
    </form>
  );
}

function Field({
  name,
  label,
  defaultValue,
  placeholder,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
}) {
  return (
    <label className="block text-sm text-muted">
      {label}
      <input
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-ink"
      />
    </label>
  );
}
