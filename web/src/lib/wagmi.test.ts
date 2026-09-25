import { afterEach, describe, expect, it, vi } from 'vitest';

import { createRealConfig, walletConnectProjectId, walletGroups } from './wagmi';

describe('walletConnectProjectId', () => {
  it('treats an unset, empty or blank build input as no project id', () => {
    // An unset `--build-arg`/Cloud Build substitution bakes the env var in as "", not undefined —
    // Vite always defines the identifier — so both must resolve the same way.
    expect(walletConnectProjectId(undefined)).toBeUndefined();
    expect(walletConnectProjectId('')).toBeUndefined();
    expect(walletConnectProjectId('   ')).toBeUndefined();
  });

  it('trims and keeps a real project id', () => {
    expect(walletConnectProjectId('abc')).toBe('abc');
    expect(walletConnectProjectId('  abc  ')).toBe('abc');
  });
});

describe('walletGroups', () => {
  // `wallets` entries are unwrapped factory functions (RainbowKit's `CreateWalletFn`), each named
  // after the wallet it builds (e.g. `injectedWallet`, `walletConnectWallet`) — checking `.name`
  // tells us which wallets are listed without invoking a factory and constructing connectors.
  const names = (groups: ReturnType<typeof walletGroups>) =>
    groups.flatMap((group) => group.wallets.map((wallet) => wallet.name));

  it('holds only the injected (browser) wallet without a project id', () => {
    expect(names(walletGroups(undefined, false))).toEqual(['injectedWallet']);
  });

  it('holds only the injected (browser) wallet in DEV, even with a project id', () => {
    expect(names(walletGroups('abc', true))).toEqual(['injectedWallet']);
  });

  it('adds the default RainbowKit wallets, including WalletConnect, with a real id outside DEV', () => {
    expect(names(walletGroups('abc', false))).toContain('walletConnectWallet');
  });
});

describe('createRealConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('does not throw when the WalletConnect build input is empty (the regression)', () => {
    // This is the exact shape of the broken production build (item 5's CI check): no
    // WalletConnect id, and `DEV` false the way a real Cloud Build/Docker build runs. Before this
    // fix, `getWalletConnectConnector` threw synchronously here, during config construction.
    vi.stubEnv('VITE_WALLETCONNECT_PROJECT_ID', '');
    vi.stubEnv('DEV', false);

    expect(() => createRealConfig()).not.toThrow();
  });
});
