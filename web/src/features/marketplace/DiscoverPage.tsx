import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';

import { SlotCard } from '../../components/SlotCard';
import { auctionState } from '../../lib/auction';
import { kindLabel } from '../../lib/labels';
import { useSlots } from './api';

const FILTERS = ['all', 'live', 'upcoming', 'remainder', 'paused', 'ended'] as const;
const KINDS = [0, 1, 2, 3] as const;

export function DiscoverPage() {
  const [params] = useSearchParams();
  const q = params.get('q') ?? '';
  const [kind, setKind] = useState<number | 'all'>('all');
  const slots = useSlots(q ? { domain: q } : kind === 'all' ? {} : { kind });
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all');

  const items = useMemo(() => {
    const list = slots.data?.items ?? [];
    const byKind = kind === 'all' ? list : list.filter((s) => s.kind === kind);
    if (filter === 'all') return byKind;
    return byKind.filter((s) => auctionState(s) === filter);
  }, [slots.data, filter, kind]);

  const featured = useMemo(() => {
    const hot = items.filter((s) => {
      const state = auctionState(s);
      return state === 'live' || state === 'remainder';
    });
    return (hot.length > 0 ? hot : items).slice(0, 4);
  }, [items]);
  const rest = items.filter((s) => !featured.some((f) => f.slotId === s.slotId));

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-accent">Marketplace</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Discover slots</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Periods sell by Dutch auction in USDC. One transaction to buy — no bids, no escrow. You
          lease a period; the slot NFT stays with the publisher.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 text-sm capitalize ${
              filter === f ? 'border-accent bg-accent text-accent-ink' : 'border-line text-muted'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setKind('all')}
          className={`rounded-full border px-3 py-1 text-sm ${
            kind === 'all' ? 'border-accent bg-accent text-accent-ink' : 'border-line text-muted'
          }`}
        >
          All kinds
        </button>
        {KINDS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`rounded-full border px-3 py-1 text-sm ${
              kind === k ? 'border-accent bg-accent text-accent-ink' : 'border-line text-muted'
            }`}
          >
            {kindLabel(k)}
          </button>
        ))}
      </div>

      {slots.isError && (
        <p className="rounded-2xl border border-line bg-surface p-4 text-sm text-ink">
          Could not reach the API ({(slots.error as Error).message}).
        </p>
      )}

      {slots.isPending && <p className="text-muted">Loading slots…</p>}

      {!slots.isPending && items.length === 0 && (
        <p className="rounded-2xl border border-line bg-surface p-8 text-center text-muted">
          No slots match these filters. Deploy the protocol, run the indexer, or clear filters.
        </p>
      )}

      {featured.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm uppercase tracking-wide text-muted">Live now</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {featured.map((slot) => (
              <SlotCard key={slot.slotId} slot={slot} />
            ))}
          </div>
        </section>
      )}

      {rest.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm uppercase tracking-wide text-muted">All</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((slot) => (
              <SlotCard key={slot.slotId} slot={slot} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
