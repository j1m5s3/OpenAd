import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DemoBanner } from './DemoBanner';

describe('DemoBanner', () => {
  it('renders the demo notice as a status region', () => {
    render(<DemoBanner />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Demo — simulated data, no real funds or chain');
  });
});
