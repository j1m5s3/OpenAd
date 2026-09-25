import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';

import { SlotPage } from './SlotPage';

afterEach(cleanup);

// Slot's calendar: firstPeriodStart 0, periodSeconds 3600 — used by the periods-window test below
// to pick a "now" that lands in a known, non-zero period index.
const usePeriods = vi.fn();

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
        saleEnd: 0,
        approvalMode: 0,
        floorCpc: null,
        paused: false,
      },
    },
  }),
  usePeriods: (...args: unknown[]) => usePeriods(...args),
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

beforeEach(() => {
  usePeriods.mockReset();
  usePeriods.mockReturnValue({ data: { items: [] } });
});

afterEach(() => {
  vi.useRealTimers();
});

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

describe('SlotPage periods window', () => {
  it('requests periods starting at the current period index, not always 0 (PLAN step 40)', () => {
    vi.useFakeTimers();
    // The mocked slot's calendar is firstPeriodStart 0, periodSeconds 3600: period 5 runs
    // [18000, 21600). A "now" inside it makes the current period index deterministically 5, well
    // past the 15-period window (`from=0, to=14`) the page used to request unconditionally.
    vi.setSystemTime(new Date(18_100 * 1000));
    renderPage();
    expect(usePeriods).toHaveBeenCalledWith('42', 5);
  });
});
