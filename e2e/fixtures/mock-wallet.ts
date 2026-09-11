import type { Page } from '@playwright/test';

import { type Persona, personas } from './accounts';

/** Inject a minimal EIP-1193 provider so RainbowKit sees an injected wallet. */
export async function installMockWallet(page: Page, persona: Persona): Promise<void> {
  const { address } = personas[persona];
  await page.addInitScript((addr: string) => {
    const provider = {
      isMetaMask: true,
      selectedAddress: addr,
      chainId: '0x7a69',
      request: async ({ method }: { method: string }) => {
        if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [addr];
        if (method === 'eth_chainId') return '0x7a69';
        if (method === 'net_version') return '31337';
        if (method === 'wallet_switchEthereumChain') return null;
        if (method === 'personal_sign' || method === 'eth_signTypedData_v4') {
          throw new Error('signing is stubbed in e2e mock wallet');
        }
        return null;
      },
      on() {
        return provider;
      },
      removeListener() {
        return provider;
      },
    };
    Object.defineProperty(window, 'ethereum', { value: provider, configurable: true });
  }, address);
}
