import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router';

import { SlotCard } from './SlotCard';
import type { SlotOut } from '../lib/api';

afterEach(cleanup);

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
  terms: {
    saleMode: 0,
    startPrice: '1000000',
    floorPrice: '500000',
    leadSeconds: 600,
    saleEnd: 0,
    approvalMode: 0,
    floorCpc: '0',
    paused: false,
  },
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
