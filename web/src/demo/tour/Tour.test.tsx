import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';

import { DEMO_PERSONAS } from '../fixtures';
import { Tour } from './Tour';
import { TOUR_STEPS } from './steps';
import { restartTour, setTourActive, setStoredStepIndex } from './tourState';

const setAccount = vi.fn();

vi.mock('../install', () => ({
  getDemoProvider: () => ({ getAccount: () => DEMO_PERSONAS.advertiserWallet.address, setAccount }),
}));

function renderTour() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Tour />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  setAccount.mockClear();
  setTourActive(true);
  setStoredStepIndex(0);
});

afterEach(cleanup);

describe('Tour', () => {
  it('shows step 1 of N and advances on Next', () => {
    renderTour();
    expect(screen.getByText(`Tour 1 of ${TOUR_STEPS.length}`)).toBeInTheDocument();
    expect(screen.getByText(TOUR_STEPS[0].title)).toBeInTheDocument();

    act(() => {
      screen.getByRole('button', { name: 'Next' }).click();
    });
    expect(screen.getByText(`Tour 2 of ${TOUR_STEPS.length}`)).toBeInTheDocument();
    expect(screen.getByText(TOUR_STEPS[1].title)).toBeInTheDocument();
  });

  it('Back returns to the previous step and is disabled on step 1', () => {
    renderTour();
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();

    act(() => {
      screen.getByRole('button', { name: 'Next' }).click();
    });
    expect(screen.getByRole('button', { name: 'Back' })).toBeEnabled();

    act(() => {
      screen.getByRole('button', { name: 'Back' }).click();
    });
    expect(screen.getByText(`Tour 1 of ${TOUR_STEPS.length}`)).toBeInTheDocument();
  });

  it('Skip dismisses the tour', () => {
    renderTour();
    act(() => {
      screen.getByRole('button', { name: 'Skip' }).click();
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('switches the demo persona through setAccount on the supply step', () => {
    setStoredStepIndex(3); // the 'supply' step (index 3): switches to the publisher persona.
    renderTour();
    expect(setAccount).toHaveBeenCalledWith(DEMO_PERSONAS.publisherNewsletter.address);
  });

  it('a throwing localStorage does not break it: it renders inactive, and still restarts', () => {
    const original = window.localStorage;
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('blocked');
      },
    });
    try {
      expect(() => renderTour()).not.toThrow();
      // No persisted state is readable, so it renders correctly inactive rather than throwing.
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      // restartTour() still works in-memory even though persisting the flag silently fails.
      act(() => {
        restartTour();
      });
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    } finally {
      Object.defineProperty(window, 'localStorage', { configurable: true, value: original });
    }
  });

  it('Escape dismisses the tour', () => {
    renderTour();
    const dialog = screen.getByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
