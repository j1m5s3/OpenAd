import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';

import { DiscoverPage } from './DiscoverPage';

afterEach(cleanup);

const useSlots = vi.fn();

vi.mock('./api', () => ({
  useSlots: (...args: unknown[]) => useSlots(...args),
}));

function slot(id: string) {
  return {
    slotId: id,
    owner: '0x' + 'aa'.repeat(20),
    width: 300,
    height: 250,
    kind: 0,
    domain: `slot-${id}.example`,
    calendarVersion: 0,
    periodSeconds: null,
    firstPeriodStart: null,
    terms: null,
  };
}

function renderDiscover(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <DiscoverPage />
    </MemoryRouter>,
  );
}

describe('DiscoverPage category filter', () => {
  it('reads the initial category from the ?category= URL param', () => {
    useSlots.mockReturnValue({
      data: { items: [slot('1')], total: 1 },
      isPending: false,
      isError: false,
    });
    renderDiscover('/?category=defi');
    expect(useSlots).toHaveBeenCalledWith(expect.objectContaining({ category: 'defi' }));
    expect(screen.getByRole('button', { name: 'DeFi' })).toHaveClass('border-accent');
  });

  it('clicking a category chip re-queries with that category', () => {
    useSlots.mockReturnValue({
      data: { items: [slot('1')], total: 1 },
      isPending: false,
      isError: false,
    });
    renderDiscover('/');
    fireEvent.click(screen.getByRole('button', { name: 'Security' }));
    expect(useSlots).toHaveBeenLastCalledWith(expect.objectContaining({ category: 'security' }));
  });

  it('"All categories" clears the category param', () => {
    useSlots.mockReturnValue({
      data: { items: [slot('1')], total: 1 },
      isPending: false,
      isError: false,
    });
    renderDiscover('/?category=defi');
    fireEvent.click(screen.getByRole('button', { name: 'All categories' }));
    const lastCall = useSlots.mock.calls.at(-1)?.[0];
    expect(lastCall?.category).toBeUndefined();
  });

  it('ignores a ?category= value that is not in the taxonomy (L3): treated as no filter', () => {
    useSlots.mockReturnValue({
      data: { items: [slot('1')], total: 1 },
      isPending: false,
      isError: false,
    });
    renderDiscover('/?category=not-a-real-category');
    const lastCall = useSlots.mock.calls.at(-1)?.[0];
    expect(lastCall?.category).toBeUndefined();
    expect(screen.getByRole('button', { name: 'All categories' })).toHaveClass('border-accent');
  });
});
