import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router';

import { WhyPage } from './WhyPage';

afterEach(cleanup);

function renderPage() {
  return render(
    <MemoryRouter>
      <WhyPage />
    </MemoryRouter>,
  );
}

describe('WhyPage', () => {
  it('shows the disclaimer', () => {
    renderPage();
    expect(
      screen.getAllByText(
        /Illustrative\. Network take rates are approximate public ranges and vary\./,
      ).length,
    ).toBeGreaterThan(0);
  });

  it('updates the uplift when the inputs change', () => {
    renderPage();
    const impressions = screen.getByLabelText('Monthly impressions');
    const before = screen.getByText(/Monthly uplift:/).textContent;
    fireEvent.change(impressions, { target: { value: '2000000' } });
    const after = screen.getByText(/Monthly uplift:/).textContent;
    expect(after).not.toBe(before);
  });

  it('changing the preset changes the comparison payout', () => {
    renderPage();
    const select = screen.getByLabelText('Compare against');
    const before = screen.getByText('OpenAd payout').nextElementSibling?.textContent;
    fireEvent.change(select, { target: { value: 'agency' } });
    const after = screen.getByText('OpenAd payout').nextElementSibling?.textContent;
    // OpenAd's own payout never changes with the comparison preset — only the network side does.
    expect(after).toBe(before);
  });

  it('links to /embed-demo', () => {
    renderPage();
    expect(screen.getByRole('link', { name: 'See the embed live' })).toHaveAttribute(
      'href',
      '/embed-demo',
    );
  });

  it('never renders "sell" for a slot (glossary copy)', () => {
    renderPage();
    expect(document.body.textContent).not.toMatch(/sell(s|ing)? a slot/i);
  });
});
