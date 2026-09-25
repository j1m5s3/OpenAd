import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DemoBanner } from './DemoBanner';
import { DEMO_PERSONAS } from './fixtures';

describe('DemoBanner', () => {
  it('renders the demo notice as a status region, with the persona switcher', () => {
    const provider = {
      getAccount: () => DEMO_PERSONAS.advertiserWallet.address as `0x${string}`,
      setAccount: () => {},
    };
    render(
      <QueryClientProvider client={new QueryClient()}>
        <DemoBanner provider={provider} />
      </QueryClientProvider>,
    );
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Demo — simulated data, no real funds or chain');
    expect(screen.getByLabelText('Viewing as')).toBeInTheDocument();
  });
});
