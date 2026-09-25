import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEMO_PERSONAS } from './fixtures';
import { PersonaSwitcher } from './PersonaSwitcher';
import { demoStore } from './store';

afterEach(cleanup);

describe('PersonaSwitcher', () => {
  it('switching persona calls setAccount, invalidates queries and changes the label', () => {
    let account = DEMO_PERSONAS.advertiserWallet.address as `0x${string}`;
    const setAccount = vi.fn((a: string) => {
      account = a as `0x${string}`;
    });
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    render(
      <QueryClientProvider client={queryClient}>
        <PersonaSwitcher provider={{ getAccount: () => account, setAccount }} />
      </QueryClientProvider>,
    );
    const select = screen.getByLabelText<HTMLSelectElement>('Viewing as');
    expect(select.selectedOptions[0]?.textContent).toBe('Advertiser — Nimbus Wallet');

    fireEvent.change(select, {
      target: { value: DEMO_PERSONAS.publisherNewsletter.address.toLowerCase() },
    });

    expect(setAccount).toHaveBeenCalledWith(
      DEMO_PERSONAS.publisherNewsletter.address.toLowerCase(),
    );
    expect(invalidate).toHaveBeenCalled();
    expect(select.selectedOptions[0]?.textContent).toBe('Publisher — Basecamp Weekly (newsletter)');
  });

  it('shows "Signed in" only while the demo SIWE session belongs to the selected persona', () => {
    demoStore.reset();
    const account = DEMO_PERSONAS.advertiserWallet.address as `0x${string}`;
    render(
      <QueryClientProvider client={new QueryClient()}>
        <PersonaSwitcher provider={{ getAccount: () => account, setAccount: () => {} }} />
      </QueryClientProvider>,
    );
    expect(screen.queryByText('Signed in')).toBeNull();
    act(() => demoStore.update((s) => void (s.connectedAddress = account.toLowerCase())));
    expect(screen.getByText('Signed in')).toBeInTheDocument();
    act(() =>
      demoStore.update(
        (s) => void (s.connectedAddress = DEMO_PERSONAS.publisherNewsletter.address),
      ),
    );
    expect(screen.queryByText('Signed in')).toBeNull();
  });
});
