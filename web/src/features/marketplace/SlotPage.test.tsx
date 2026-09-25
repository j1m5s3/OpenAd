import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';

import { SlotPage } from './SlotPage';

afterEach(cleanup);

vi.mock('./api', () => ({
  useSlot: () => ({
    isPending: false,
    isError: false,
    data: {
      slotId: '42',
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
        approvalMode: 0,
        floorCpc: null,
      },
    },
  }),
  usePeriods: () => ({ data: { items: [] } }),
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/slots/42']}>
      <Routes>
        <Route path="/slots/:slotId" element={<SlotPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SlotPage share row', () => {
  it('shows an absolute, hash-safe slot URL', () => {
    renderPage();
    const input = screen.getByLabelText('Slot page URL') as HTMLInputElement;
    expect(input.value).toMatch(/^https?:\/\//);
    expect(input.value).toContain('/slots/42');
  });

  it('sets the document title to the slot domain', () => {
    renderPage();
    expect(document.title).toBe('publisher.example — ad slot on OpenAd');
  });

  it('has X and Farcaster share links', () => {
    renderPage();
    expect(screen.getByRole('link', { name: 'Share on X' })).toHaveAttribute(
      'href',
      expect.stringContaining('twitter.com/intent/tweet'),
    );
    expect(screen.getByRole('link', { name: 'Share on Farcaster' })).toHaveAttribute(
      'href',
      expect.stringContaining('warpcast.com/~/compose'),
    );
  });
});
