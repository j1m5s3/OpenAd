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
    renderPage();
    const select = screen.getByLabelText('Compare against');
    const openAdBefore = screen.getByText('OpenAd payout').nextElementSibling?.textContent;
    // Pins the caption WhyPage.tsx derives by stripping "(approx.)" off the preset label
    // (lib/earnings.ts): the take-rate percentage must survive that strip.
    const networkBefore = screen.getByText('Ad network (30% take) payout').nextElementSibling
      ?.textContent;
    fireEvent.change(select, { target: { value: 'network-50' } });
    const openAdAfter = screen.getByText('OpenAd payout').nextElementSibling?.textContent;
    const networkAfter = screen.getByText('Ad network (50% take) payout').nextElementSibling
      ?.textContent;
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
      /\b(sell(s|ing)?|sold|leas(e|es|ed|ing))\s+(an?\s+)?(ad\s+)?slots?\b/i,
    );
  });
});
