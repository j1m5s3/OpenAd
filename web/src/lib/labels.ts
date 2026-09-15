import type { SlotOut } from './api';

export const KIND_LABEL: Record<number, string> = {
  0: 'Display',
  1: 'Newsletter',
  2: 'Physical',
  3: 'Other',
};

export const APPROVAL_MODE_LABEL: Record<number, string> = {
  0: 'Required',
  1: 'Waived',
};

export const SALE_MODE_LABEL: Record<number, string> = {
  0: 'Lease (Dutch)',
  1: 'CPC',
};

export const SALE_LEASE = 0;
export const SALE_CPC = 1;

export const NFT_STANDARD_LABEL: Record<number, string> = {
  1: 'ERC-721',
  2: 'ERC-1155',
};

export const APPROVAL_STATUS_LABEL: Record<number, string> = {
  0: 'None',
  1: 'Requested',
  2: 'Approved',
  3: 'Rejected',
  4: 'Revoked',
};

export function kindLabel(kind: number): string {
  return KIND_LABEL[kind] ?? `Kind ${kind}`;
}

export function approvalModeLabel(mode: number): string {
  return APPROVAL_MODE_LABEL[mode] ?? `Mode ${mode}`;
}

export function saleModeLabel(mode: number): string {
  return SALE_MODE_LABEL[mode] ?? `Sale mode ${mode}`;
}

export function approvalStatusLabel(status: number): string {
  return APPROVAL_STATUS_LABEL[status] ?? `Status ${status}`;
}

export function unixToDatetimeLocal(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function datetimeLocalToUnix(value: string): number {
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) throw new Error(`invalid datetime: ${value}`);
  return Math.floor(ms / 1000);
}

export function slotCardTitle(slot: SlotOut): string {
  return slot.domain;
}
