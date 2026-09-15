import { describe, expect, it } from 'vitest';

import { indexerLagCopy } from './indexerLag';

describe('indexerLagCopy', () => {
  it('degrades when the API is unreachable', () => {
    expect(indexerLagCopy(0, false)).toContain('reorg-safe');
    expect(indexerLagCopy(null, false)).toContain('Indexer lag unavailable');
  });

  it('reports zero, unknown, and positive lag', () => {
    expect(indexerLagCopy(0, true)).toBe('Indexer lag: 0 blocks (reorg-safe).');
    expect(indexerLagCopy(null, true)).toContain('Indexer lag unknown');
    expect(indexerLagCopy(12, true)).toBe('Indexer lag: 12 blocks (reorg-safe rewind).');
  });
});
