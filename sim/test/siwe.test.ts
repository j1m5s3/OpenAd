import type { Address, Hex } from 'viem';
import { describe, expect, it } from 'vitest';

import { SIM_CHAIN_ID } from '../src/accounts.js';
import { ApiClient } from '../src/api.js';
import { DEFAULT_WEB_ORIGIN, buildSiweMessage, siweLooksValid, siweOrigin } from '../src/siwe.js';

const ADDRESS = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';
const SWAPPED_CASE = ADDRESS.replace(/[a-fA-F]/g, (c) =>
  c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase(),
);
const WEB = 'http://localhost:5173';
const BASE = {
  address: ADDRESS,
  chainId: SIM_CHAIN_ID,
  nonce: 'abc12345',
  issuedAt: '2026-09-12T00:00:00.000Z',
} as const;

describe('SIWE message', () => {
  it('signs as the web origin, in the exact EIP-4361 layout the API parses', () => {
    expect(siweOrigin(WEB)).toEqual({ domain: 'localhost:5173', uri: WEB });
    const message = buildSiweMessage({ ...BASE, ...siweOrigin(WEB) });
    expect(message.split('\n')).toEqual([
      'localhost:5173 wants you to sign in with your Ethereum account:',
      ADDRESS,
      '',
      '',
      `URI: ${WEB}`,
      'Version: 1',
      `Chain ID: ${SIM_CHAIN_ID}`,
      'Nonce: abc12345',
      'Issued At: 2026-09-12T00:00:00.000Z',
    ]);
    expect(siweLooksValid(message, SIM_CHAIN_ID, WEB)).toBe(true);
  });

  it('writes the address EIP-55 checksummed', () => {
    const message = buildSiweMessage({
      ...BASE,
      ...siweOrigin(WEB),
      address: ADDRESS.toLowerCase() as Address,
    });
    expect(message.split('\n')[1]).toBe(ADDRESS);
  });

  it('rejects messages the API would reject', () => {
    const valid = buildSiweMessage({ ...BASE, ...siweOrigin(WEB) });
    const cases = [
      buildSiweMessage({ ...BASE, domain: 'localhost', uri: 'http://localhost:8000' }), // old sim: API base URL
      buildSiweMessage({ ...BASE, domain: 'localhost', uri: WEB }), // hostname without the port
      buildSiweMessage({ ...BASE, domain: 'localhost:5173', uri: 'https://localhost:5173' }), // scheme
      buildSiweMessage({ ...BASE, ...siweOrigin(WEB), chainId: 1 }),
      valid.replace('Nonce: abc12345', 'Nonce: abc'), // viem refuses to build a short nonce
      valid.replace('\n\n\n', '\n\n'), // one empty line after the address: not EIP-4361
      valid.replace(ADDRESS, ADDRESS.toLowerCase()), // no EIP-55 checksum
      valid.replace(ADDRESS, SWAPPED_CASE), // mixed case, but not the checksum
      `${valid}\nFoo: bar`,
    ];
    for (const message of cases) {
      expect(siweLooksValid(message, SIM_CHAIN_ID, WEB)).toBe(false);
    }
  });
});

describe('ApiClient.siwe', () => {
  it('defaults to the web dev origin', () => {
    expect(new ApiClient('http://localhost:8000').webOrigin).toBe(DEFAULT_WEB_ORIGIN);
  });

  it('signs in as the configured web origin, never the API base URL', async () => {
    const bodies: string[] = [];
    const fakeFetch = async (
      input: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      const url = String(input);
      if (url === 'http://localhost:8000/v1/auth/nonce') {
        return new Response(JSON.stringify({ nonce: 'abcdef0123456789' }), { status: 200 });
      }
      if (url === 'http://localhost:8000/v1/auth/verify') {
        bodies.push(String(init?.body));
        return new Response(JSON.stringify({ address: ADDRESS.toLowerCase() }), {
          status: 200,
          headers: { 'set-cookie': 'openad_session=sid123; HttpOnly; Path=/' },
        });
      }
      throw new Error(`unexpected request ${url}`);
    };
    const api = new ApiClient(
      'http://localhost:8000',
      fakeFetch as typeof fetch,
      'http://127.0.0.1:5173',
    );
    const signed: string[] = [];
    await api.siwe({
      address: ADDRESS,
      signMessage: async ({ message }) => {
        signed.push(message);
        return '0x1234' as Hex;
      },
    });

    const message = signed[0] ?? '';
    expect(message.split('\n')[0]).toBe(
      '127.0.0.1:5173 wants you to sign in with your Ethereum account:',
    );
    expect(message).toContain('URI: http://127.0.0.1:5173');
    expect(message).not.toContain('8000');
    expect(JSON.parse(bodies[0] ?? '{}')).toEqual({ message, signature: '0x1234' });
    expect(api.cookies.get(ADDRESS.toLowerCase())).toBe('sid123');
  });
});
