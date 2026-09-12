import { Link } from 'react-router';

import { routes } from '../app/paths';
import type { SlotOut } from '../lib/api';
import { auctionOpenAt, auctionState } from '../lib/auction';
import { withDevWalletParam } from '../lib/devWalletQuery';
import { formatDuration, formatTimeLeft, formatUsdc, shortAddress } from '../lib/format';
import { kindLabel } from '../lib/labels';

export function SlotCard({ slot }: { slot: SlotOut }) {
  const state = auctionState(slot);
  const openAt = auctionOpenAt(slot);
  return (
    <Link
      to={withDevWalletParam(routes.slot(slot.slotId))}
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
          <span className="rounded-full border border-line px-2 py-0.5 text-xs capitalize text-muted">
            {state}
          </span>
        </div>
        <p className="text-sm text-muted">
          {kindLabel(slot.kind)} · {shortAddress(slot.owner)}
        </p>
        <p className="text-sm">
          {slot.terms
            ? `From ${formatUsdc(BigInt(slot.terms.floorPrice))} · opens at ${formatUsdc(BigInt(slot.terms.startPrice), { symbol: false })}`
            : 'No terms yet'}
        </p>
        <p className="text-xs text-muted">
          Period {slot.periodSeconds ? formatDuration(slot.periodSeconds) : '—'}
          {state === 'upcoming' && openAt != null ? ` · live ${formatTimeLeft(openAt)}` : null}
          {state === 'live' && slot.firstPeriodStart != null
            ? ` · period starts ${formatTimeLeft(slot.firstPeriodStart)}`
            : null}
        </p>
      </div>
    </Link>
  );
}
