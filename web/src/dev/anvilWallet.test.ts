import { describe, expect, it, vi } from 'vitest';

import {
  ANVIL_CHAIN_HEX,
  ANVIL_CHAIN_ID,
  DEV_WALLET_RDNS,
  announceEip6963,
  createDevWalletProvider,
  isLocalHref,
  parseDevWalletId,
  shouldInstallDevWallet,
} from './anvilWallet';

const PUB3 = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';

describe('parseDevWalletId', () => {
  it('accepts known sim ids and rejects unknown', () => {
    expect(parseDevWalletId('?devwallet=pub-3')).toBe('pub-3');
    expect(parseDevWalletId('devwallet=adv-6')).toBe('adv-6');
    expect(parseDevWalletId('?devwallet=funder')).toBeNull();
    expect(parseDevWalletId('')).toBeNull();
  });
});

describe('shouldInstallDevWallet', () => {
  it('installs only on local DEV Anvil with a known id', () => {
    expect(
      shouldInstallDevWallet({
        isDev: true,
        href: 'http://localhost:5173/supply?devwallet=pub-3',
        chainId: ANVIL_CHAIN_ID,
      }),
    ).toEqual({ id: 'pub-3', address: PUB3 });
    expect(
      shouldInstallDevWallet({
        isDev: false,
        href: 'http://localhost:5173/?devwallet=pub-3',
        chainId: ANVIL_CHAIN_ID,
      }),
    ).toBeNull();
    expect(
      shouldInstallDevWallet({
        isDev: true,
        href: 'https://app.example/?devwallet=pub-3',
        chainId: ANVIL_CHAIN_ID,
      }),
    ).toBeNull();
    expect(
      shouldInstallDevWallet({
        isDev: true,
        href: 'http://127.0.0.1:5173/?devwallet=pub-3',
        chainId: 8453,
      }),
    ).toBeNull();
  });

  it('treats localhost and 127.0.0.1 as local', () => {
    expect(isLocalHref('http://localhost:5173/')).toBe(true);
    expect(isLocalHref('http://127.0.0.1:5173/')).toBe(true);
    expect(isLocalHref('not a url')).toBe(false);
  });
});

describe('createDevWalletProvider', () => {
  it('answers local methods without RPC', async () => {
    const rpcFetch = vi.fn();
    const provider = createDevWalletProvider(PUB3, rpcFetch as unknown as typeof fetch);
    expect(provider.isOpenAdDevWallet).toBe(true);
    expect(provider.isMetaMask).toBe(false);
    await expect(provider.request({ method: 'eth_accounts' })).resolves.toEqual([PUB3]);
    await expect(provider.request({ method: 'eth_requestAccounts' })).resolves.toEqual([PUB3]);
    await expect(provider.request({ method: 'eth_chainId' })).resolves.toBe(ANVIL_CHAIN_HEX);
    await expect(provider.request({ method: 'net_version' })).resolves.toBe('31337');
    await expect(provider.request({ method: 'wallet_switchEthereumChain' })).resolves.toBeNull();
    expect(rpcFetch).not.toHaveBeenCalled();
  });

  it('forwards unknown methods to /anvil', async () => {
    const rpcFetch = vi.fn().mockResolvedValue({
      json: async () => ({ result: '0x1' }),
    });
    const provider = createDevWalletProvider(PUB3, rpcFetch as unknown as typeof fetch);
    await expect(provider.request({ method: 'eth_blockNumber' })).resolves.toBe('0x1');
    expect(rpcFetch).toHaveBeenCalledWith(
      '/anvil',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      }),
    );
    const body = JSON.parse((rpcFetch.mock.calls[0]?.[1] as RequestInit).body as string) as {
      method: string;
    };
    expect(body.method).toBe('eth_blockNumber');
  });

  it('retries personal_sign with swapped params then surfaces the first error', async () => {
    const rpcFetch = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({ error: { code: -32602, message: 'invalid argument 0' } }),
      })
      .mockResolvedValueOnce({
        json: async () => ({ result: '0xsig' }),
      });
    const provider = createDevWalletProvider(PUB3, rpcFetch as unknown as typeof fetch);
    await expect(
      provider.request({ method: 'personal_sign', params: [PUB3, '0xdead'] }),
    ).resolves.toBe('0xsig');
    expect(rpcFetch).toHaveBeenCalledTimes(2);
  });

  it('throws RPC errors from Anvil', async () => {
    const rpcFetch = vi.fn().mockResolvedValue({
      json: async () => ({ error: { code: -32000, message: 'signing failed' } }),
    });
    const provider = createDevWalletProvider(PUB3, rpcFetch as unknown as typeof fetch);
    await expect(provider.request({ method: 'eth_signTypedData_v4', params: [PUB3, '{}'] })).rejects.toThrow(
      'signing failed',
    );
  });
});

describe('announceEip6963', () => {
  it('emits eip6963:announceProvider with the OpenAd rdns', () => {
    const provider = createDevWalletProvider(PUB3, vi.fn() as unknown as typeof fetch);
    const seen: unknown[] = [];
    const target = {
      dispatchEvent: (event: Event) => {
        if (event instanceof CustomEvent) seen.push(event.detail);
        return true;
      },
      addEventListener: vi.fn(),
    };
    announceEip6963(provider, target as unknown as Window);
    expect(seen).toHaveLength(1);
    expect((seen[0] as { info: { rdns: string } }).info.rdns).toBe(DEV_WALLET_RDNS);
    expect(target.addEventListener).toHaveBeenCalledWith(
      'eip6963:requestProvider',
      expect.any(Function),
    );
  });
});
