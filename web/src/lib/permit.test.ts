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
      nonce: 'abc12345',
      issuedAt: '2026-09-11T00:00:00.000Z',
    });
    expect(msg).toContain('Nonce: abc12345');
    expect(msg).toContain('Chain ID: 31337');
    expect(msg).toContain('0x0000000000000000000000000000000000000001');
  });

  const FIELDS = {
    domain: 'localhost:5173',
    address: '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
    uri: 'http://localhost:5173',
    chainId: 31337,
    nonce: 'abcdef0123456789',
    issuedAt: '2026-09-25T12:00:00.000Z',
  } as const;

  it('keeps host and port on the domain line, in the exact EIP-4361 layout the API parses', () => {
    // useSiwe passes window.location.host / .origin; the API binds both to an allowed origin.
    // api/tests/test_auth_hardening.py (VIEM_MESSAGE) parses this exact text.
    expect(buildSiweMessage(FIELDS).split('\n')).toEqual([
      'localhost:5173 wants you to sign in with your Ethereum account:',
      '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
      '',
      '',
      'URI: http://localhost:5173',
      'Version: 1',
      'Chain ID: 31337',
      'Nonce: abcdef0123456789',
      'Issued At: 2026-09-25T12:00:00.000Z',
    ]);
  });

  it('writes the address EIP-55 checksummed, as the API requires', () => {
    const msg = buildSiweMessage({
      ...FIELDS,
      address: '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed',
    });
    expect(msg.split('\n')[1]).toBe('0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed');
  });

  it('refuses a nonce EIP-4361 does not allow', () => {
    expect(() => buildSiweMessage({ ...FIELDS, nonce: 'demo-0123' })).toThrow(/nonce/);
    expect(() => buildSiweMessage({ ...FIELDS, nonce: 'abc123' })).toThrow(/nonce/);
  });
});

describe('permitDeadline', () => {
  it('is one hour after now', () => {
    expect(permitDeadline(1_000_000)).toBe(1_003_600n);
  });
});
