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

  it('remounts step content on step change, so uncontrolled inputs never carry over', () => {
    const step = (id: string, name: string, value: string) => ({
      id,
      title: id,
      description: '',
      whatNext: '',
      status: 'todo' as const,
      content: <input aria-label={name} defaultValue={value} />,
    });
    const steps = [step('mint', 'Width', '300'), step('calendar', 'Period length', '86400')];
    const { rerender } = render(<Wizard activeId="mint" onSelect={() => {}} steps={steps} />);
    expect(screen.getByLabelText('Width')).toHaveValue('300');
    rerender(<Wizard activeId="calendar" onSelect={() => {}} steps={steps} />);
    expect(screen.getByLabelText('Period length')).toHaveValue('86400');
  });
});
