import { describe, expect, it } from 'vitest';

import { isOpenAdDevWallet, pickDevWalletConnector } from './pickConnector';

describe('pickDevWalletConnector', () => {
  it('prefers injected over MetaMask SDK', () => {
    const picked = pickDevWalletConnector([
      { id: 'metaMask', name: 'MetaMask', type: 'metaMask' },
      { id: 'injected', name: 'Browser Wallet', type: 'injected' },
      { id: 'walletConnect', name: 'WalletConnect', type: 'walletConnect' },
    ]);
    expect(picked?.id).toBe('injected');
  });
});

describe('isOpenAdDevWallet', () => {
  it('requires the injector flag', () => {
    expect(isOpenAdDevWallet({ isOpenAdDevWallet: true })).toBe(true);
    expect(isOpenAdDevWallet({ isMetaMask: true })).toBe(false);
    expect(isOpenAdDevWallet(undefined)).toBe(false);
  });
});
