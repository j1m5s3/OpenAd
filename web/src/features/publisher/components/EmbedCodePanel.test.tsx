import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';

import { EmbedCodePanel } from './EmbedCodePanel';

afterEach(cleanup);

// `EmbedCodePanel` reads the current slot's own size via `useSlot` (react-query). Mocking it
// out keeps this a pure component test with no network and no QueryClientProvider needed.
vi.mock('../../marketplace/api', () => ({
  useSlot: () => ({ data: undefined, isPending: false, isError: false }),
}));

function renderPanel(slotIds = ['1', '2']) {
  return render(
    <MemoryRouter>
      <EmbedCodePanel slotIds={slotIds} />
    </MemoryRouter>,
  );
}

describe('EmbedCodePanel', () => {
  it('renders a snippet containing the first slot id by default', () => {
    renderPanel();
    const pre = document.querySelector('pre');
    expect(pre?.textContent).toContain('slot-id="1"');
    expect(pre?.textContent).toContain('<script type="module"');
  });

  it('changing the slot select updates the snippet', () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText('Slot to embed'), { target: { value: '2' } });
    const pre = document.querySelector('pre');
    expect(pre?.textContent).toContain('slot-id="2"');
  });

  it('changing the size preset updates the snippet dimensions', () => {
    renderPanel();
    const sizeSelect = screen.getByLabelText('Size') as HTMLSelectElement;
    fireEvent.change(sizeSelect, { target: { value: '1' } });
    const pre = document.querySelector('pre');
    expect(pre?.textContent).toMatch(/width="\d+" height="\d+"/);
  });

  it('copy calls the clipboard with the visible snippet', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await Promise.resolve();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalled();
    expect(writeText.mock.calls[0]?.[0]).toContain('<open-ad');
  });

  it('the Substack tab shows the no-scripts note', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Notion / Substack' }));
    expect(screen.getByText(/don't allow custom scripts/)).toBeInTheDocument();
  });

  it('the Badge tab shows a link+image snippet with no script tag', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Badge' }));
    const pre = document.querySelector('pre');
    expect(pre?.textContent).toContain('<a href=');
    expect(pre?.textContent).toContain('<img src=');
    expect(pre?.textContent).not.toContain('<script');
  });
});
