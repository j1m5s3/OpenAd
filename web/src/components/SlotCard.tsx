import { Link } from 'react-router';

import { routes } from '../app/paths';
import type { SlotOut } from '../lib/api';
import { auctionState } from '../lib/auction';
import { formatDuration, formatUsdc, shortAddress } from '../lib/format';

const KIND_LABEL: Record<number, string> = {
  0: 'Display',
  1: 'Newsletter',
  2: 'Physical',
  3: 'Other',
};

export function SlotCard({ slot }: { slot: SlotOut }) {
  const state = auctionState(slot);
  return (
    <Link
      to={routes.slot(slot.slotId)}
      className="group block overflow-hidden rounded-2xl border border-line bg-surface transition hover:border-accent/40"
    >
      <div
        className="flex h-36 items-end bg-surface-2 p-4 text-xs text-muted"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 20%, rgb(200 245 66 / 18%), transparent 45%)',
        }}
      >
        {slot.width}×{slot.height}
      </div>
      <div className="space-y-2 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate font-medium">{slot.domain}</p>
          <span className="rounded-full border border-line px-2 py-0.5 text-xs text-muted">{state}</span>
        </div>
        <p className="text-sm text-muted">
          {KIND_LABEL[slot.kind] ?? slot.kind} · {shortAddress(slot.owner)}
        </p>
        <p className="text-sm">
          {slot.terms
            ? `${formatUsdc(BigInt(slot.terms.startPrice), { symbol: false })} → ${formatUsdc(BigInt(slot.terms.floorPrice))}`
            : 'no terms'}
        </p>
        <p className="text-xs text-muted">
          Period {slot.periodSeconds ? formatDuration(slot.periodSeconds) : '—'}
        </p>
      </div>
    </Link>
  );
}
