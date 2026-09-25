import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type * as apiModule from '../../../lib/api';
import { ApiError } from '../../../lib/api';
import type * as marketplaceApiModule from '../../marketplace/api';
import { ListingEditor } from './ListingEditor';

afterEach(cleanup);

const putSlotListing = vi.fn().mockResolvedValue({});
const deleteSlotListing = vi.fn().mockResolvedValue(undefined);

vi.mock('../../../lib/api', async () => {
  const actual = await vi.importActual<typeof apiModule>('../../../lib/api');
  return {
    ...actual,
    api: {
      putSlotListing: (...args: unknown[]) => putSlotListing(...args),
      deleteSlotListing: (...args: unknown[]) => deleteSlotListing(...args),
    },
  };
});

let useSlotResult: {
  data: { listing: { summary: string; audience: string; categories: string[] } | null } | undefined;
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
} = LOADED_EMPTY();

// Default: the slot has loaded and has no listing yet, so the form is enabled and empty.
function LOADED_EMPTY() {
  return { data: { listing: null }, isPending: false, isError: false, isSuccess: true };
}

vi.mock('../../marketplace/api', async () => {
  const actual = await vi.importActual<typeof marketplaceApiModule>('../../marketplace/api');
  return {
    ...actual,
    useSlot: () => useSlotResult,
  };
});

function renderEditor(slotIds = ['1', '2']) {
  const queryClient = new QueryClient();
  const result = render(
    <QueryClientProvider client={queryClient}>
      <ListingEditor slotIds={slotIds} />
    </QueryClientProvider>,
  );
  return {
    ...result,
    rerenderSameInstance: () =>
      result.rerender(
        <QueryClientProvider client={queryClient}>
          <ListingEditor slotIds={slotIds} />
        </QueryClientProvider>,
      ),
  };
}

describe('ListingEditor', () => {
  afterEach(() => {
    useSlotResult = LOADED_EMPTY();
    putSlotListing.mockReset().mockResolvedValue({});
    deleteSlotListing.mockReset().mockResolvedValue(undefined);
  });

  it('shows a "Slot to describe" select distinct from other Supply slot pickers', () => {
    renderEditor();
    expect(screen.getByLabelText('Slot to describe')).toBeInTheDocument();
  });

  it('the summary and audience counters track input length', () => {
    renderEditor();
    expect(screen.getByText('Summary (0/140)')).toBeInTheDocument();
    const summaryText = 'Weekly crypto recap';
    fireEvent.change(screen.getByPlaceholderText('One-line pitch for advertisers'), {
      target: { value: summaryText },
    });
    expect(screen.getByText(`Summary (${summaryText.length}/140)`)).toBeInTheDocument();

    expect(screen.getByText('Audience (0/600)')).toBeInTheDocument();
    const audienceText = 'Solidity devs';
    fireEvent.change(screen.getByPlaceholderText("Who reads this page, and what it's about"), {
      target: { value: audienceText },
    });
    expect(screen.getByText(`Audience (${audienceText.length}/600)`)).toBeInTheDocument();
  });

  it('allows at most 3 category chips selected', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'DeFi' }));
    fireEvent.click(screen.getByRole('button', { name: 'NFT' }));
    fireEvent.click(screen.getByRole('button', { name: 'Gaming' }));
    fireEvent.click(screen.getByRole('button', { name: 'Wallets' }));
    expect(screen.getByRole('button', { name: 'DeFi' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'NFT' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Gaming' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Wallets' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: 'Wallets' })).toBeDisabled();
  });

  it('deselecting a chip frees a slot for another category', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'DeFi' }));
    fireEvent.click(screen.getByRole('button', { name: 'NFT' }));
    fireEvent.click(screen.getByRole('button', { name: 'Gaming' }));
    fireEvent.click(screen.getByRole('button', { name: 'DeFi' })); // deselect
    fireEvent.click(screen.getByRole('button', { name: 'Wallets' }));
    expect(screen.getByRole('button', { name: 'Wallets' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('save calls the API with the current slot, text and categories', async () => {
    renderEditor();
    fireEvent.change(screen.getByLabelText('Slot to describe'), { target: { value: '2' } });
    fireEvent.change(screen.getByPlaceholderText('One-line pitch for advertisers'), {
      target: { value: 'Sidebar reaching security-conscious devs' },
    });
    fireEvent.change(screen.getByPlaceholderText("Who reads this page, and what it's about"), {
      target: { value: 'Security researchers' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Security' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(putSlotListing).toHaveBeenCalled());
    expect(putSlotListing).toHaveBeenCalledWith('2', {
      summary: 'Sidebar reaching security-conscious devs',
      audience: 'Security researchers',
      categories: ['security'],
    });
    await waitFor(() => expect(screen.getByText('Listing saved')).toBeInTheDocument());
  });

  it('clear calls the delete API and resets the fields', async () => {
    renderEditor();
    fireEvent.change(screen.getByPlaceholderText('One-line pitch for advertisers'), {
      target: { value: 'Something' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(deleteSlotListing).toHaveBeenCalledWith('1'));
    await waitFor(() => expect(screen.getByText('Listing cleared')).toBeInTheDocument());
    expect(
      (screen.getByPlaceholderText('One-line pitch for advertisers') as HTMLInputElement).value,
    ).toBe('');
  });

  it('hydrates from the loaded listing only once per slot, never overwriting a mid-typing draft on a later refetch (L1)', () => {
    useSlotResult = {
      data: {
        listing: { summary: 'Fixture summary', audience: 'Fixture audience', categories: ['defi'] },
      },
      isPending: false,
      isError: false,
      isSuccess: true,
    };
    const { rerenderSameInstance } = renderEditor();
    // First render hydrates from the fixture.
    expect(
      (screen.getByPlaceholderText('One-line pitch for advertisers') as HTMLInputElement).value,
    ).toBe('Fixture summary');

    // The publisher starts typing over it.
    fireEvent.change(screen.getByPlaceholderText('One-line pitch for advertisers'), {
      target: { value: 'My edited summary' },
    });

    // A background refetch resolves again for the SAME slot (react-query re-runs the query on
    // window focus, after `invalidateQueries`, etc., handing back the same fixture data) — this
    // must not clobber the in-progress draft.
    useSlotResult = { ...useSlotResult, isSuccess: true };
    rerenderSameInstance();
    expect(
      (screen.getByPlaceholderText('One-line pitch for advertisers') as HTMLInputElement).value,
    ).toBe('My edited summary');
  });

  it('shows the ApiError message and does not leave a stale "Listing saved" when save is rejected (L2)', async () => {
    putSlotListing.mockRejectedValueOnce(
      new ApiError(422, 'invalid_listing', 'summary must not contain a URL'),
    );
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.getByText('summary must not contain a URL')).toBeInTheDocument(),
    );
    expect(screen.queryByText('Listing saved')).not.toBeInTheDocument();
  });

  it('shows the ApiError message when clear is rejected (L2)', async () => {
    deleteSlotListing.mockRejectedValueOnce(new ApiError(403, 'forbidden', 'not the slot owner'));
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(screen.getByText('not the slot owner')).toBeInTheDocument());
    expect(screen.queryByText('Listing cleared')).not.toBeInTheDocument();
  });

  it('disables every control while the slot is loading, then hydrates from the fixture and keeps edits (L1)', () => {
    useSlotResult = { data: undefined, isPending: true, isError: false, isSuccess: false };
    const { rerenderSameInstance } = renderEditor();
    const summary = () =>
      screen.getByPlaceholderText('One-line pitch for advertisers') as HTMLInputElement;
    const audience = () =>
      screen.getByPlaceholderText(
        "Who reads this page, and what it's about",
      ) as HTMLTextAreaElement;

    expect(summary()).toBeDisabled();
    expect(audience()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'DeFi' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Security' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();

    // The demo fixture listing for slot #1 (web/src/demo/fixtures.ts) arrives.
    useSlotResult = {
      data: {
        listing: {
          summary: 'Newsletter sidebar, high-intent readers.',
          audience: 'The same audience as our header banner, with longer average session time.',
          categories: ['defi'],
        },
      },
      isPending: false,
      isError: false,
      isSuccess: true,
    };
    rerenderSameInstance();

    expect(summary()).toBeEnabled();
    expect(audience()).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeEnabled();
    expect(summary().value).toBe('Newsletter sidebar, high-intent readers.');
    expect(audience().value).toBe(
      'The same audience as our header banner, with longer average session time.',
    );
    expect(screen.getByRole('button', { name: 'DeFi' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.change(summary(), { target: { value: 'Sidebar reaching security-conscious devs' } });
    fireEvent.change(audience(), { target: { value: 'Security researchers' } });
    fireEvent.click(screen.getByRole('button', { name: 'Security' }));
    rerenderSameInstance(); // a background refetch must not clobber the edits
    expect(summary().value).toBe('Sidebar reaching security-conscious devs');
    expect(audience().value).toBe('Security researchers');
    expect(screen.getByRole('button', { name: 'Security' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('disables the form again while a newly selected slot is loading', () => {
    const { rerenderSameInstance } = renderEditor();
    expect(screen.getByPlaceholderText('One-line pitch for advertisers')).toBeEnabled();
    useSlotResult = { data: undefined, isPending: true, isError: false, isSuccess: false };
    fireEvent.change(screen.getByLabelText('Slot to describe'), { target: { value: '2' } });
    rerenderSameInstance();
    expect(screen.getByPlaceholderText('One-line pitch for advertisers')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});
