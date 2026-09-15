import { describe, expect, it } from 'vitest';

import { buildSiweMessage, permitDeadline, splitSignature } from './permit';

describe('splitSignature', () => {
  it('splits a 65-byte hex signature into v/r/s', () => {
    const r = '11'.repeat(32);
    const s = '22'.repeat(32);
    const { v, r: rr, s: ss } = splitSignature(`0x${r}${s}1b`);
    expect(rr).toBe(`0x${r}`);
    expect(ss).toBe(`0x${s}`);
    expect(v).toBe(27);
  });
});

describe('buildSiweMessage', () => {
  it('includes nonce, chain id, and address', () => {
    const msg = buildSiweMessage({
      domain: 'localhost',
      address: '0x0000000000000000000000000000000000000001',
      uri: 'http://localhost:5173',
      chainId: 31337,
      nonce: 'abc123',
      issuedAt: '2026-09-11T00:00:00.000Z',
    });
    expect(msg).toContain('Nonce: abc123');
    expect(msg).toContain('Chain ID: 31337');
    expect(msg).toContain('0x0000000000000000000000000000000000000001');
  });
});

describe('permitDeadline', () => {
  it('is one hour after now', () => {
    expect(permitDeadline(1_000_000)).toBe(1_003_600n);
  });
});
