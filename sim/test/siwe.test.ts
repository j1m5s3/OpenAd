import { describe, expect, it } from 'vitest';

import { buildSiweMessage, siweLooksValid } from '../src/siwe.js';
import { SIM_CHAIN_ID } from '../src/accounts.js';

describe('SIWE message', () => {
  it('includes Nonce and Chain ID lines the API regexes require', () => {
    const message = buildSiweMessage({
      domain: 'localhost',
      address: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
      uri: 'http://localhost:8000',
      chainId: SIM_CHAIN_ID,
      nonce: 'abc123',
      issuedAt: '2026-09-12T00:00:00.000Z',
    });
    expect(siweLooksValid(message, SIM_CHAIN_ID)).toBe(true);
    expect(message).toContain('Nonce: abc123');
    expect(message).toContain('Chain ID: 31337');
  });
});
