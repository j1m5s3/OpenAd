import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Sparkline } from './Sparkline';

describe('Sparkline', () => {
  it('renders an accessible summary for an empty series', () => {
    render(<Sparkline values={[]} label="daily impressions" />);
    expect(screen.getByRole('img', { name: /daily impressions: no data/ })).toBeInTheDocument();
  });

  it('renders a flat line for an all-zero series without dividing by zero', () => {
    render(<Sparkline values={[0, 0, 0]} label="daily clicks" />);
    expect(
      screen.getByRole('img', { name: 'daily clicks: min 0, max 0, last 0' }),
    ).toBeInTheDocument();
  });

  it('renders a single point without dividing by zero', () => {
    render(<Sparkline values={[42]} label="daily spend" />);
    expect(
      screen.getByRole('img', { name: 'daily spend: min 42, max 42, last 42' }),
    ).toBeInTheDocument();
  });

  it('summarises a varying series', () => {
    render(<Sparkline values={[1, 5, 3]} label="daily payable clicks" />);
    expect(
      screen.getByRole('img', { name: 'daily payable clicks: min 1, max 5, last 3' }),
    ).toBeInTheDocument();
  });
});
