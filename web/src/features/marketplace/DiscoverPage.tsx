import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';

import { SlotCard } from '../../components/SlotCard';
import { auctionState } from '../../lib/auction';
import { useSlots } from './api';

const FILTERS = ['all', 'live', 'upcoming', 'remainder', 'paused', 'ended'] as const;

export function DiscoverPage() {
  const [params] = useSearchParams();
  const q = params.get('q') ?? '';
  const slots = useSlots(q ? { domain: q } : {});
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all');

  const items = useMemo(() => {
    const list = slots.data?.items ?? [];
    if (filter === 'all') return list;
    return list.filter((s) => auctionState(s) === filter);
  }, [slots.data, filter]);

  const featured = items.slice(0, 4);
  const rest = items.slice(4);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-accent">Marketplace</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Discover slots</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Periods sell by Dutch auction in USDC. One transaction to buy — no bids, no escrow.
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

      {slots.isError && (
        <p className="rounded-2xl border border-line bg-surface p-4 text-sm text-muted">
          Could not reach the API ({(slots.error as Error).message}).
        </p>
      )}

      {slots.isPending && <p className="text-muted">Loading slots…</p>}

      {!slots.isPending && items.length === 0 && (
        <p className="rounded-2xl border border-line bg-surface p-8 text-center text-muted">
          No slots indexed yet. Deploy the protocol and run the indexer.
        </p>
      )}

      {featured.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm uppercase tracking-wide text-muted">Featured</h2>
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
