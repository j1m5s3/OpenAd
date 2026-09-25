import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { ApiError, api } from '../../../lib/api';
import {
  LISTING_AUDIENCE_MAX,
  LISTING_CATEGORIES,
  LISTING_SUMMARY_MAX,
  MAX_LISTING_CATEGORIES,
} from '../../../lib/listingTaxonomy';
import { slotKeys, useSlot } from '../../marketplace/api';

export function ListingEditor({ slotIds }: { slotIds: string[] }) {
  // "Slot to describe", not just "Slot": Supply also has a house-ad "Slot id" field and the
  // embed panel's own "Slot to embed" combobox — a shared label would resolve to more than one
  // accessible-name match on this page.
  const [slotId, setSlotId] = useState(slotIds[0] ?? '');
  const slot = useSlot(slotId);
  const queryClient = useQueryClient();
  const [summary, setSummary] = useState('');
  const [audience, setAudience] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Hydrates the form from the fetched listing exactly once per selected slot — never again on a
  // background refetch (react-query re-runs the query on window focus, after `invalidateQueries`,
  // etc.), which would otherwise clobber text the publisher is mid-typing (L1: a refetch racing a
  // keystroke silently overwrote the draft with the last-saved fixture values). `hydratedFor` is
  // state, not a ref, so `ready` below is derived in the same render: the controls stay disabled
  // until the listing for *this* slot has loaded and been copied into the form — text typed before
  // that could otherwise be overwritten by the first hydration.
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);
  useEffect(() => {
    if (!slot.isSuccess || hydratedFor === slotId) return;
    setSummary(slot.data.listing?.summary ?? '');
    setAudience(slot.data.listing?.audience ?? '');
    setCategories(slot.data.listing?.categories ?? []);
    setStatus(null);
    setHydratedFor(slotId);
  }, [slotId, slot.isSuccess, slot.data, hydratedFor]);
  const ready = slotId.length > 0 && slot.isSuccess && hydratedFor === slotId;

  function selectSlot(next: string) {
    // `hydratedFor` still names the previous slot, so the form is disabled until `next` hydrates.
    setSlotId(next);
  }

  function toggleCategory(value: string) {
    setCategories((prev) => {
      if (prev.includes(value)) return prev.filter((c) => c !== value);
      if (prev.length >= MAX_LISTING_CATEGORIES) return prev;
      return [...prev, value];
    });
  }

  async function save() {
    if (!ready) return;
    setStatus(null);
    setPending(true);
    try {
      await api.putSlotListing(slotId, { summary, audience, categories });
      setStatus('Listing saved');
      await queryClient.invalidateQueries({ queryKey: slotKeys.all });
    } catch (err) {
      setStatus(err instanceof ApiError ? err.message : 'Could not save the listing');
    } finally {
      setPending(false);
    }
  }

  async function clear() {
    if (!ready) return;
    setStatus(null);
    setPending(true);
    try {
      await api.deleteSlotListing(slotId);
      setSummary('');
      setAudience('');
      setCategories([]);
      setStatus('Listing cleared');
      await queryClient.invalidateQueries({ queryKey: slotKeys.all });
    } catch (err) {
      setStatus(err instanceof ApiError ? err.message : 'Could not clear the listing');
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-surface p-5">
      <h2 className="font-medium">Listing</h2>
      <p className="text-sm text-muted">
        A short, publisher-provided audience description and up to {MAX_LISTING_CATEGORIES}{' '}
        categories, shown to advertisers on Discover and your slot page. Self-described, not
        verified.
      </p>

      <label className="block text-sm">
        <span className="block text-muted">Slot to describe</span>
        <select
          value={slotId}
          onChange={(e) => selectSlot(e.target.value)}
          className="mt-1 rounded-lg border border-line bg-canvas px-3 py-1.5 text-ink outline-none"
        >
          {slotIds.map((id) => (
            <option key={id} value={id}>
              Slot #{id}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        <span className="block text-muted">{`Summary (${summary.length}/${LISTING_SUMMARY_MAX})`}</span>
        <input
          value={summary}
          maxLength={LISTING_SUMMARY_MAX}
          onChange={(e) => setSummary(e.target.value)}
          disabled={!ready}
          placeholder="One-line pitch for advertisers"
          className="mt-1 w-full rounded-lg border border-line bg-canvas px-3 py-1.5 text-ink outline-none disabled:opacity-60"
        />
      </label>

      <label className="block text-sm">
        <span className="block text-muted">{`Audience (${audience.length}/${LISTING_AUDIENCE_MAX})`}</span>
        <textarea
          value={audience}
          maxLength={LISTING_AUDIENCE_MAX}
          onChange={(e) => setAudience(e.target.value)}
          disabled={!ready}
          rows={3}
          placeholder="Who reads this page, and what it's about"
          className="mt-1 w-full rounded-lg border border-line bg-canvas px-3 py-1.5 text-ink outline-none disabled:opacity-60"
        />
      </label>

      <div>
        <span className="block text-sm text-muted">
          Categories (up to {MAX_LISTING_CATEGORIES})
        </span>
        <div className="mt-2 flex flex-wrap gap-2">
          {LISTING_CATEGORIES.map((c) => {
            const selected = categories.includes(c.value);
            const disabled = !ready || (!selected && categories.length >= MAX_LISTING_CATEGORIES);
            return (
              <button
                key={c.value}
                type="button"
                aria-pressed={selected}
                disabled={disabled}
                onClick={() => toggleCategory(c.value)}
                className={`rounded-full border px-3 py-1 text-sm disabled:opacity-40 ${
                  selected ? 'border-accent bg-accent text-accent-ink' : 'border-line text-muted'
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      {status && <p className="text-sm text-accent">{status}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending || !ready}
          onClick={() => void save()}
          className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-accent-ink disabled:opacity-40"
        >
          Save
        </button>
        <button
          type="button"
          disabled={pending || !ready}
          onClick={() => void clear()}
          className="rounded-full border border-line px-4 py-1.5 text-sm text-ink disabled:opacity-40"
        >
          Clear
        </button>
      </div>
    </section>
  );
}
