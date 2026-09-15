import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Wizard } from './Wizard';

describe('Wizard', () => {
  it('renders stage titles in order and reports onSelect', () => {
    const onSelect = vi.fn();
    render(
      <Wizard
        activeId="mint"
        onSelect={onSelect}
        steps={[
          {
            id: 'mint',
            title: 'Mint slot',
            description: 'Create the NFT.',
            whatNext: 'Set a calendar.',
            status: 'active',
            content: <p>mint body</p>,
          },
          {
            id: 'calendar',
            title: 'Calendar',
            description: 'Periods.',
            whatNext: 'Set terms.',
            status: 'todo',
            content: <p>calendar body</p>,
          },
        ]}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Mint slot' })).toBeInTheDocument();
    expect(screen.getByText('mint body')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Calendar' }));
    expect(onSelect).toHaveBeenCalledWith('calendar');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onSelect).toHaveBeenCalledWith('calendar');
  });
});
