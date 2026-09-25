/** Persistent demo-mode banner (ADR-0016). Rendered whenever `DEMO_MODE` is on, so nobody
 * mistakes the seeded fixtures and simulated wallet for real funds or a real chain. Hosts the
 * persona switcher. */
import type { ComponentProps } from 'react';

import { PersonaSwitcher } from './PersonaSwitcher';
import { restartTour } from './tour/tourState';

export function DemoBanner({
  provider,
}: {
  provider?: ComponentProps<typeof PersonaSwitcher>['provider'];
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-b border-accent/40 bg-accent/10 px-4 py-1.5 text-xs font-medium text-ink">
      <p role="status">Demo — simulated data, no real funds or chain</p>
      <PersonaSwitcher {...(provider ? { provider } : {})} />
      <button type="button" onClick={restartTour} className="underline">
        Take the tour
      </button>
    </div>
  );
}
