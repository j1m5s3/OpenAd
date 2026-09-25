import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';

import { api, setRequestHandler } from '../../../lib/api';
import { sumBig } from '../../../lib/analytics';
import { formatUsdc } from '../../../lib/format';
import { setDemoNow } from '../../../demo/clock';
import { createDemoRequestHandler } from '../../../demo/demoApi';
import { DEMO_PERSONAS } from '../../../demo/fixtures';
import { demoStore } from '../../../demo/store';
import { AdvertiserPerformance } from './AdvertiserPerformance';

const NOW = 1_800_000_000;

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  setDemoNow(NOW);
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

describe('AdvertiserPerformance', () => {
  it('renders nothing without a connected address', () => {
    const { container } = renderWithClient(<AdvertiserPerformance address={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders Spend as exactly leaseSpend + cpcSettledSpend, and Accrued CPC separately', async () => {
    const address = DEMO_PERSONAS.advertiserWallet.address;
    const expected = await api.advertiserAnalytics(address);
    renderWithClient(<AdvertiserPerformance address={address} />);
    await waitFor(() => expect(screen.queryByText(/loading performance/i)).toBeNull());

    const spend = sumBig(expected.totals.leaseSpend, expected.totals.cpcSettledSpend);
    expect(screen.getByText('Spend').nextElementSibling).toHaveTextContent(formatUsdc(spend));
    expect(screen.getByText('lease (window) + CPC settled (all-time)')).toBeInTheDocument();
    expect(screen.getByText('Accrued CPC').nextElementSibling).toHaveTextContent(
      formatUsdc(BigInt(expected.totals.accruedCpcSpend)),
    );
    expect(screen.getByText('unsettled — not yet spend')).toBeInTheDocument();
    expect(screen.getByText('Top slots by spend')).toBeInTheDocument();
  });

  it('sums the top-slots table to no more than leaseSpend + cpcSettledSpend (never accrued)', async () => {
    const address = DEMO_PERSONAS.advertiserWallet.address;
    const expected = await api.advertiserAnalytics(address);
    expect(BigInt(expected.totals.accruedCpcSpend)).toBeGreaterThan(0n); // guards against a
    // regression that folds accrued CPC back into by_slot: if it does, this bound breaks.
    const bySlotTotal = expected.bySlot.reduce((sum, r) => sum + BigInt(r.spend), 0n);
    expect(bySlotTotal).toBe(
      BigInt(expected.totals.leaseSpend) + BigInt(expected.totals.cpcSettledSpend),
    );
  });
});
