import type { FormEvent, ReactNode } from 'react';
import { useAccount, useWriteContract } from 'wagmi';
import { useState } from 'react';

import { Field, FieldLabel } from '../../components/Field';
import { api } from '../../lib/api';
import { formatUsdc, parseUsdc } from '../../lib/format';
import { getContract, hasProtocol } from '../../lib/deployments';
import { SALE_CPC, approvalStatusLabel, datetimeLocalToUnix } from '../../lib/labels';
import { targetChainId } from '../../lib/wagmi';
import { approvalActionLabel } from './components/ApproveDialog';
import { EmbedCodePanel } from './components/EmbedCodePanel';
import { SlotSetupWizard } from './components/SlotSetupWizard';
import { usePublisher, usePublisherApprovals } from './api';

export function SupplyPage() {
  const { address, isConnected } = useAccount();
  const deployed = hasProtocol(targetChainId);
  const pub = usePublisher(address);
  const approvals = usePublisherApprovals(address);
  const { writeContractAsync, isPending } = useWriteContract();
  const [msg, setMsg] = useState<string | null>(null);
  const lastSlotId = pub.data?.slotIds.at(-1) ?? '1';

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
        BigInt(datetimeLocalToUnix(String(fd.get('firstStart')))),
      ],
    });
    setMsg('Calendar submitted');
  }

  async function setTerms(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const market = getContract(targetChainId, 'Marketplace');
    const saleMode = Number(fd.get('saleMode'));
    const approvalMode = Number(fd.get('approvalMode'));
    const cpc = saleMode === SALE_CPC;
    await writeContractAsync({
      ...market,
      functionName: 'set_terms',
      args: [
        BigInt(String(fd.get('slotId'))),
        cpc ? 0n : parseUsdc(String(fd.get('startPrice'))),
        cpc ? 0n : parseUsdc(String(fd.get('floorPrice'))),
        cpc ? 0n : BigInt(String(fd.get('leadSeconds'))),
        0n,
        approvalMode,
        saleMode,
        cpc ? parseUsdc(String(fd.get('floorCpc'))) : 0n,
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
        <p className="mt-2 text-muted">
          Mint slots, set calendars and terms (Lease Dutch or CPC), approve creatives. Lease
          proceeds arrive in the same buy transaction; CPC proceeds arrive when the settler settles
          payable clicks — no Net-60 invoice.
        </p>
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
        <Field name="slotId" label="Slot id" defaultValue="1" hintKey="pricingSlotId" />
      </FormCard>

      <SlotSetupWizard
        pending={isPending}
        defaultSlotId={lastSlotId}
        onMint={mint}
        onCalendar={setCalendar}
        onTerms={setTerms}
      />

      <FormCard title="Pause sales" onSubmit={(e) => void setPaused(e)} pending={isPending}>
        <Field name="slotId" label="Slot id" defaultValue="1" hintKey="slotId" />
        <FieldLabel label="Paused" hintKey="paused">
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" name="paused" className="accent-accent" />
            Paused
          </label>
        </FieldLabel>
      </FormCard>

      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="font-medium">Approvals inbox</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {(approvals.data ?? []).map((a) => (
            <li key={a.creativeId} className="flex items-center justify-between gap-3">
              <span>
                Creative {a.creativeId} · {approvalStatusLabel(a.status)}
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
        <Field
          name="advertiser"
          label="Advertiser address"
          placeholder="0x…"
          hintKey="advertiserAllowlist"
        />
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" name="allowed" defaultChecked className="accent-accent" />
          Allowed
        </label>
      </FormCard>

      <FormCard title="House ad" onSubmit={(e) => void saveHouse(e)} pending={false}>
        <Field name="slotId" label="Slot id" defaultValue="1" hintKey="slotId" />
        <Field name="mediaUrl" label="Media URL" placeholder="https://" hintKey="houseMediaUrl" />
        <Field name="clickUrl" label="Click URL" placeholder="https://" hintKey="houseClickUrl" />
      </FormCard>

      <FormCard title="Domain verification" onSubmit={(e) => void verifyDomain(e)} pending={false}>
        <Field name="slotId" label="Slot id" defaultValue="1" hintKey="verifyDomain" />
      </FormCard>

      <EmbedCodePanel slotIds={pub.data?.slotIds ?? ['1']} />
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
