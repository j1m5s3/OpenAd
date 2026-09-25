import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';

import { formatUsdc } from '../../../lib/format';
import { buyCtaLabel, quoteFeeCopy } from '../../../lib/permit';

// Mocked before the component import that uses it (hoisted by vitest).
vi.mock('../../../lib/deployments', () => ({
  hasProtocol: () => true,
  getContract: (_chainId: number, name: string) => ({
    address: `0x${name.length}${'0'.repeat(39)}`,
    abi: [],
  }),
}));

vi.mock('../../advertiser/api', () => ({
  useAdvertiser: () => ({ data: undefined }),
  useAdvertiserCreatives: () => [],
}));

const signTypedDataAsync = vi.fn().mockResolvedValue(`0x${'11'.repeat(65)}`);
const writeContractAsync = vi.fn().mockResolvedValue('0xabc123');
let receiptState: { isSuccess: boolean; isError: boolean; error?: Error } = {
  isSuccess: false,
  isError: false,
};

const QUOTE = {
  sellable: true,
  reason: '',
  price: 3_000_000n,
  fee: 75_000n,
  start: undefined,
  end: undefined,
};

// What the live `quote` read would answer once the lease lands and the underlying query is
// re-enabled — the original bug (ROADMAP 6.2 step 35). Returning this whenever the quote query is
// disabled reproduces that exact shape, so a test asserting the receipt still shows the frozen
// snapshot actually exercises the `submitted?.price ?? q?.price` precedence, not just a mock that
// never changes.
const NOT_SELLABLE = {
  sellable: false,
  reason: 'Not sellable',
  price: 0n,
  fee: 0n,
  start: undefined,
  end: undefined,
};

const useReadContract = vi.fn((args: { functionName?: string; query?: { enabled?: boolean } }) => {
  if (args.functionName === 'quote') {
    const enabled = args.query?.enabled;
    return { data: enabled === false ? NOT_SELLABLE : QUOTE, isFetching: false };
  }
  if (args.functionName === 'name') return { data: 'USD Coin' };
  if (args.functionName === 'nonces') return { data: 0n };
  return { data: undefined };
});

vi.mock('wagmi', () => ({
  useAccount: () => ({ address: '0x000000000000000000000000000000000000a1', isConnected: true }),
  useReadContract: (args: unknown) => useReadContract(args as { functionName?: string }),
  useSignTypedData: () => ({ signTypedDataAsync }),
  useWriteContract: () => ({ writeContractAsync, isPending: false }),
  useWaitForTransactionReceipt: () => receiptState,
}));

const { BuyDialog } = await import('./BuyDialog');

afterEach(() => {
  cleanup();
  receiptState = { isSuccess: false, isError: false };
  useReadContract.mockClear();
  signTypedDataAsync.mockClear();
  writeContractAsync.mockClear();
});

function tree(onClose: () => void): ReactElement {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <BuyDialog slotId="0" periodIndex="4" onClose={onClose} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function renderDialog(onClose = vi.fn()) {
  const utils = render(tree(onClose));
  return {
    ...utils,
    onClose,
    // Re-renders with an identical tree so the component re-reads the mocked
    // `useWaitForTransactionReceipt` — needed because `receiptState` is a plain module variable,
    // not React state, so mutating it alone triggers no update.
    rerenderTree: () => utils.rerender(tree(onClose)),
  };
}

/** Awaits a mock's most recent call settling (resolved or rejected) without throwing, so a
 * rejected-signature test can await the same helper as a successful one. */
async function settle(fn: { mock: { results: { value: unknown }[] } }) {
  const result = fn.mock.results[fn.mock.results.length - 1];
  await (result?.value as Promise<unknown> | undefined)?.catch?.(() => {});
}

/** Drives the wizard from "review" to the "confirm" step and clicks the buy button. Awaits the
 * permit-sign + write mocks so no state update lands outside of `act`. */
async function submitBuy() {
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Buy with permit' }));
    await settle(signTypedDataAsync);
    await settle(writeContractAsync);
  });
}

function lastQuoteEnabled(): boolean {
  const quoteCalls = useReadContract.mock.calls.filter(
    (c) => (c[0] as { functionName?: string }).functionName === 'quote',
  );
  const last = quoteCalls[quoteCalls.length - 1]?.[0] as { query: { enabled: boolean } };
  return last.query.enabled;
}

describe('BuyDialog receipt (ROADMAP 6.2 step 35)', () => {
  it('stops the live quote once the user submits', async () => {
    renderDialog();
    await submitBuy();
    expect(lastQuoteEnabled()).toBe(false);
  });

  it('shows the snapshot price and the fee split, publisher + fee == price', async () => {
    renderDialog();
    await submitBuy();
    expect(screen.getByText(formatUsdc(QUOTE.price))).toBeInTheDocument();
    const copy = quoteFeeCopy(QUOTE.price, QUOTE.fee);
    expect(copy.net + QUOTE.fee).toBe(QUOTE.price);
    expect(screen.getByText(copy.line)).toBeInTheDocument();
  });

  it('never renders "Not sellable" or a 0.00 price once the lease confirms', async () => {
    const { rerenderTree } = renderDialog();
    await submitBuy();
    receiptState = { isSuccess: true, isError: false };
    rerenderTree();
    expect(screen.getByText('Lease confirmed')).toBeInTheDocument();
    expect(screen.queryByText(buyCtaLabel(false, false))).toBeNull();
    expect(screen.queryByText(formatUsdc(0n))).toBeNull();
  });

  it('"View slot" links to the slot route and closes the dialog', async () => {
    const { onClose, rerenderTree } = renderDialog();
    await submitBuy();
    receiptState = { isSuccess: true, isError: false };
    rerenderTree();
    const link = screen.getByRole('link', { name: 'View slot' });
    expect(link).toHaveAttribute('href', '/slots/0');
    fireEvent.click(link);
    expect(onClose).toHaveBeenCalled();
  });

  it('offers retry on failure and re-enables the live quote', async () => {
    const { rerenderTree } = renderDialog();
    await submitBuy();
    receiptState = { isSuccess: false, isError: true, error: new Error('reverted') };
    rerenderTree();
    expect(screen.getByText('reverted')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(lastQuoteEnabled()).toBe(true);
  });

  it('signs and writes the exact quoted price, which is also the price the receipt shows', async () => {
    renderDialog();
    await submitBuy();
    const signCall = signTypedDataAsync.mock.calls[
      signTypedDataAsync.mock.calls.length - 1
    ]?.[0] as {
      message: { value: bigint };
    };
    expect(signCall.message.value).toBe(QUOTE.price);
    const writeCall = writeContractAsync.mock.calls[
      writeContractAsync.mock.calls.length - 1
    ]?.[0] as {
      args: unknown[];
    };
    // args: [slotId, periodIndex, creativeId, price, deadline, v, r, s]
    expect(writeCall.args[3]).toBe(QUOTE.price);
    expect(screen.getByText(formatUsdc(QUOTE.price))).toBeInTheDocument();
  });

  it('offers retry and never calls writeContractAsync when the permit signature is rejected', async () => {
    signTypedDataAsync.mockRejectedValueOnce(new Error('User rejected'));
    const { rerenderTree } = renderDialog();
    await submitBuy();
    rerenderTree();
    expect(screen.getByText('User rejected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(writeContractAsync).not.toHaveBeenCalled();
  });
});

describe('buyCtaLabel', () => {
  it('labels remainder, live, and blocked buys', () => {
    expect(buyCtaLabel(true, true)).toBe('Buy remainder');
    expect(buyCtaLabel(true, false)).toBe('Buy with permit');
    expect(buyCtaLabel(false, false)).toBe('Not sellable');
  });
});

describe('quoteFeeCopy', () => {
  it('itemizes protocol fee and publisher proceeds', () => {
    const copy = quoteFeeCopy(10_000_000n, 250_000n);
    expect(copy.net).toBe(9_750_000n);
    expect(copy.line).toContain(formatUsdc(250_000n));
    expect(copy.line).toContain('publisher');
  });
});
