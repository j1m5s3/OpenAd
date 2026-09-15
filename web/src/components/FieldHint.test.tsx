import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FieldHint } from './FieldHint';

describe('FieldHint', () => {
  it('toggles the tip on click and closes on Escape', () => {
    render(<FieldHint hintKey="domain" />);
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'What is this?' }));
    expect(screen.getByRole('tooltip')).toHaveTextContent(/Immutable after mint/i);
    expect(screen.queryByText(/Learn more/)).toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
