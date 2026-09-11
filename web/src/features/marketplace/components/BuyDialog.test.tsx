import { describe, expect, it } from 'vitest';

import { buyCtaLabel } from '../../../lib/permit';

describe('buyCtaLabel', () => {
  it('labels remainder, live, and blocked buys', () => {
    expect(buyCtaLabel(true, true)).toBe('Buy remainder');
    expect(buyCtaLabel(true, false)).toBe('Buy with permit');
    expect(buyCtaLabel(false, false)).toBe('Not sellable');
  });
});
