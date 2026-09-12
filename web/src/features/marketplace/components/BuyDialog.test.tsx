import { describe, expect, it } from 'vitest';

import { formatUsdc } from '../../../lib/format';
import { buyCtaLabel, quoteFeeCopy } from '../../../lib/permit';

describe('buyCtaLabel', () => {
  it('labels remainder, live, and blocked buys', () => {
    expect(buyCtaLabel(true, true)).toBe('Buy remainder');
    expect(buyCtaLabel(true, false)).toBe('Buy with permit');
    expect(buyCtaLabel(false, false)).toBe('Not sellable');
  });
});

describe('quoteFeeCopy', () => {
  it('itemizes protocol fee and publisher proceeds', () => {
    const copy = quoteFeeCopy(10_000_000n, 250_000n);
    expect(copy.net).toBe(9_750_000n);
    expect(copy.line).toContain(formatUsdc(250_000n));
    expect(copy.line).toContain('publisher');
  });
});
