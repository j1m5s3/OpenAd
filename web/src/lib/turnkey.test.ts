import { describe, expect, it } from 'vitest';

import { gasSponsorshipActive, turnkeyConfigured } from './turnkey';

describe('turnkey gate', () => {
  it('is off without env and skips gas sponsorship on Anvil', () => {
    expect(turnkeyConfigured()).toBe(false);
    expect(gasSponsorshipActive(31337)).toBe(false);
  });
});
