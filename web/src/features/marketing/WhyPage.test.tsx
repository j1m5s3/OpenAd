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

  it("changing the preset changes the comparison payout but never OpenAd's own", () => {
    const { container } = renderPage();
    const select = screen.getByLabelText('Compare against');
    const payouts = () =>
      Array.from(container.querySelectorAll('.text-2xl')).map((el) => el.textContent);
    const openAdBefore = screen.getByText('OpenAd payout').nextElementSibling?.textContent;
    const [networkBefore] = payouts();
    fireEvent.change(select, { target: { value: 'network-50' } });
    const openAdAfter = screen.getByText('OpenAd payout').nextElementSibling?.textContent;
    const [networkAfter] = payouts();
    // Only the network side moves with the comparison preset.
    expect(networkAfter).not.toBe(networkBefore);
    expect(openAdAfter).toBe(openAdBefore);
  });

  it('links to /embed-demo', () => {
    renderPage();
    expect(screen.getByRole('link', { name: 'See the embed live' })).toHaveAttribute(
      'href',
      '/embed-demo',
    );
  });

  it('never sells or leases a slot itself (glossary copy: a publisher sells periods)', () => {
    renderPage();
    expect(document.body.textContent).not.toMatch(
      /\b(sell|lease)(s|d|ing)? (an? )?(ad )?slots?\b/i,
    );
  });
});
