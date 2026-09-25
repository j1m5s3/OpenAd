import type { ReactNode } from 'react';

/** A single labelled stat: value plus an optional one-line hint underneath, e.g. "incl.
 * unsettled". Used by the publisher/advertiser performance panels (PLAN 21+22). */
export function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-canvas p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-lg font-medium">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}
