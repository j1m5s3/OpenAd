import { afterEach, describe, expect, it, vi } from 'vitest';
import { connect, readContract, writeContract } from 'wagmi/actions';

import { getContract, hasCampaignVault, hasProtocol } from '../lib/deployments';
import { setDemoNow } from './clock';
import { createDemoProvider } from './demoChain';
import { DEMO_CHAIN_ID, DEMO_CONTRACTS, registerDemoDeployment } from './deployment';
import { DEMO_PERSONAS } from './fixtures';
import { demoStore } from './store';
import { createDemoWagmiConfig, DEMO_WALLET_NAME } from './wagmiDemo';

const NOW = 1_800_000_000;

afterEach(() => {
  setDemoNow();
  vi.restoreAllMocks();
});

describe('createDemoWagmiConfig', () => {
  it('has one chain, one custom (never http) transport, and only the demo wallet', () => {
    const config = createDemoWagmiConfig(createDemoProvider(demoStore));
    expect(config.chains.map((c) => c.id)).toEqual([DEMO_CHAIN_ID]);
    expect(config.getClient().transport.type).toBe('custom');
    expect(config.connectors.map((c) => c.name)).toEqual([DEMO_WALLET_NAME]);
  });

  it('connects the demo wallet and runs feature-style reads and writes through wagmi actions', async () => {
    setDemoNow(NOW);
    demoStore.reset(NOW);
    registerDemoDeployment();
    expect(hasProtocol(DEMO_CHAIN_ID) && hasCampaignVault(DEMO_CHAIN_ID)).toBe(true);
    const fetchSpy = vi.spyOn(window, 'fetch');
    const config = createDemoWagmiConfig(createDemoProvider(demoStore));
    const connector = config.connectors[0];
    if (!connector) throw new Error('no demo connector');
    const { accounts } = await connect(config, { connector });
    expect(accounts).toEqual([DEMO_PERSONAS.advertiserWallet.address]);

    const usdc = getContract(DEMO_CHAIN_ID, 'USDC');
    expect(usdc.address).toBe(DEMO_CONTRACTS.USDC);
    const balance = await readContract(config, {
      ...usdc,
      functionName: 'balanceOf',
      args: [accounts[0]],
    });
    expect(typeof balance).toBe('bigint');

    const registry = getContract(DEMO_CHAIN_ID, 'CreativeRegistry');
    await writeContract(config, {
      ...registry,
      functionName: 'register_media',
      args: ['/demo/x.svg', `0x${'f'.repeat(64)}`, 'image/svg+xml', 300, 250, 'https://x.example'],
    });
    expect(Object.values(demoStore.get().creatives).some((c) => c.uri === '/demo/x.svg')).toBe(
      true,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
