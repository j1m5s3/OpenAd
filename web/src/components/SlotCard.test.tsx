import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';

import { SlotCard } from './SlotCard';
import type { SlotOut } from '../lib/api';
import { formatTimeLeft } from '../lib/format';

afterEach(cleanup);
afterEach(() => {
  vi.useRealTimers();
});

const BASE_TERMS: NonNullable<SlotOut['terms']> = {
  saleMode: 0,
  startPrice: '1000000',
  floorPrice: '500000',
  leadSeconds: 600,
  saleEnd: 0,
  approvalMode: 0,
  floorCpc: '0',
  paused: false,
};

const BASE_SLOT: SlotOut = {
  slotId: '1',
  owner: '0x' + 'aa'.repeat(20),
  width: 300,
  height: 250,
  kind: 0,
  domain: 'publisher.example',
  calendarVersion: 1,
  periodSeconds: 3600,
  firstPeriodStart: 0,
  terms: BASE_TERMS,
};

function renderCard(slot: SlotOut) {
  return render(
    <MemoryRouter>
      <SlotCard slot={slot} />
    </MemoryRouter>,
  );
}

describe('SlotCard', () => {
  it('renders nothing extra when there is no listing', () => {
    renderCard(BASE_SLOT);
    expect(screen.queryByText('DeFi')).not.toBeInTheDocument();
  });

  it('shows the listing summary and category badges when present', () => {
    renderCard({
      ...BASE_SLOT,
      listing: {
        slotId: '1',
        summary: 'Weekly crypto market recap',
        audience: 'Solidity devs',
        categories: ['defi', 'security'],
        updatedAt: 0,
      },
    });
    expect(screen.getByText('Weekly crypto market recap')).toBeInTheDocument();
    expect(screen.getByText('DeFi')).toBeInTheDocument();
    expect(screen.getByText('Security')).toBeInTheDocument();
  });
});

// -------------------------------------------------------------------------------------------
// Each auctionStatus state's copy line (round-2 L2). Expected strings are computed with the same
// `formatTimeLeft` the component calls, under the same faked "now", instead of hand-computed
// literals — so a copy test can't silently drift from a `formatDuration` rounding change.
// -------------------------------------------------------------------------------------------
describe('SlotCard auction copy', () => {
  it("shows 'live in …' while waiting for the very first period's Dutch window to open", () => {
    // S0=1,000,000, lead=600 -> open(0) = 999,400. now=999,300 is 100s before it: 'upcoming'.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(999_300 * 1000));
    const slot: SlotOut = {
      ...BASE_SLOT,
      firstPeriodStart: 1_000_000,
      terms: { ...BASE_TERMS, leadSeconds: 600 },
    };
    const { container } = renderCard(slot);
    expect(container.textContent).toContain(`live ${formatTimeLeft(999_400)}`);
  });

  it("shows 'period starts in …' while live with leadSeconds == periodSeconds", () => {
    // The demo case (existing auction.test.ts table): leadSeconds == periodSeconds keeps the slot
    // continuously 'live' from open(0) onward, always with startsAt == start(current + 1).
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_000_000 * 1000));
    const slot: SlotOut = {
      ...BASE_SLOT,
      firstPeriodStart: 1_000_000,
      terms: { ...BASE_TERMS, leadSeconds: 3600 },
    };
    const { container } = renderCard(slot);
    expect(container.textContent).toContain(`period starts ${formatTimeLeft(1_003_600)}`);
  });

  it("shows 'next auction in …' when remainder-pricing and another period will still open", () => {
    // leadSeconds < periodSeconds: period 0's remainder phase, with period 1's Dutch window
    // (opens at start(1) - lead = 1,001,800) still ahead of `now`.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_000_100 * 1000));
    const slot: SlotOut = {
      ...BASE_SLOT,
      firstPeriodStart: 1_000_000,
      terms: { ...BASE_TERMS, leadSeconds: 1_800 },
    };
    const { container } = renderCard(slot);
    expect(container.textContent).toContain(`next auction ${formatTimeLeft(1_001_800)}`);
  });

  it("shows 'final period ends in …' when remainder-pricing the last period saleEnd allows", () => {
    // saleEnd == start(1): only period 0 fits (kLast = 0), so period 1 never opens and the
    // component falls through to the endsAt branch instead of opensAt.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_000_100 * 1000));
    const slot: SlotOut = {
      ...BASE_SLOT,
      firstPeriodStart: 1_000_000,
      terms: { ...BASE_TERMS, leadSeconds: 1_800, saleEnd: 1_003_600 },
    };
    const { container } = renderCard(slot);
    expect(container.textContent).toContain(`final period ends ${formatTimeLeft(1_003_600)}`);
  });
});
