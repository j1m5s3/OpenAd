import { describe, expect, it } from 'vitest';

import { withDevWalletParam } from './devWalletQuery';

describe('withDevWalletParam', () => {
  it('appends the current persona and replaces an existing one', () => {
    expect(withDevWalletParam('/slots/1', '?devwallet=adv-6')).toBe('/slots/1?devwallet=adv-6');
    expect(withDevWalletParam('/slots/1?x=1', '?devwallet=pub-3')).toBe(
      '/slots/1?x=1&devwallet=pub-3',
    );
    expect(withDevWalletParam('/supply', '')).toBe('/supply');
  });
});
