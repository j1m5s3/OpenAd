import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api, setRequestHandler } from '../../../lib/api';
import { sumBig } from '../../../lib/analytics';
import { formatUsdc } from '../../../lib/format';
import { setDemoNow } from '../../../demo/clock';
import { createDemoRequestHandler } from '../../../demo/demoApi';
import { demoStore } from '../../../demo/store';
import { SlotPerformance } from './SlotPerformance';

const NOW = 1_800_000_000;

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient();
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  setDemoNow(NOW);
  // `useSlotAnalytics` reads the wall clock (like the real app); pin it to the same instant the
  // fixtures are seeded at so the default 30-day window lines up with the seeded lease history.
  vi.spyOn(Date, 'now').mockReturnValue(NOW * 1000);
  demoStore.reset(NOW);
  setRequestHandler(createDemoRequestHandler(demoStore));
});

afterEach(() => {
  setDemoNow();
  setRequestHandler();
  vi.restoreAllMocks();
  cleanup();
});

describe('SlotPerformance', () => {
  it('shows an empty state with no slots', () => {
    renderWithClient(<SlotPerformance slotIds={[]} />);
    expect(screen.getByText(/mint a slot/i)).toBeInTheDocument();
  });

  it('renders Earnings as exactly leaseEarnings + cpcSettledEarnings from the response', async () => {
    const expected = await api.slotAnalytics('0');
    renderWithClient(<SlotPerformance slotIds={['0']} />);
    await waitFor(() => expect(screen.queryByText(/loading performance/i)).toBeNull());

    const earnings = sumBig(expected.totals.leaseEarnings, expected.totals.cpcSettledEarnings);
    expect(screen.getByText('Earnings').nextElementSibling).toHaveTextContent(formatUsdc(earnings));
    expect(screen.getByText('Accrued CPC')).toBeInTheDocument();
    expect(screen.getByText('unsettled — not yet earnings')).toBeInTheDocument();
  });

  it('shows CTR as "—, not tracked for leases" for a LEASE-only slot with no CPC activity', async () => {
    // Slot 0 is LEASE-only: a LEASE creative's click goes straight to the advertiser's own URL,
    // so there are no click events to compute a CTR from, real or synthetic.
    renderWithClient(<SlotPerformance slotIds={['0']} />);
    await waitFor(() => expect(screen.queryByText(/loading performance/i)).toBeNull());
    expect(screen.getByText('CTR').nextElementSibling).toHaveTextContent('—');
    expect(screen.getByText('not tracked for leases')).toBeInTheDocument();
  });

  it('shows "—" for CTR and eCPM on a slot with no impressions in the window', async () => {
    // Slot 1 is CPC but the window before its synthetic-traffic start has zero impressions.
    renderWithClient(<SlotPerformance slotIds={['1']} />);
    await waitFor(() => expect(screen.queryByText(/loading performance/i)).toBeNull());
    // CTR/eCPM show a real value once traffic exists; the null-path is covered directly in
    // lib/analytics.test.ts (`ctrPercent(null)`, `ecpmUsd(null)`).
    expect(screen.getByText('CTR')).toBeInTheDocument();
    expect(screen.getByText('eCPM')).toBeInTheDocument();
  });
});
