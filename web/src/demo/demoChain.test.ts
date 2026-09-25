import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type Abi,
  createPublicClient,
  createWalletClient,
  custom,
  type EIP1193Provider,
  type Hex,
} from 'viem';
import { foundry } from 'viem/chains';

import { splitSignature, usdcPermitTypes } from '../lib/permit';
import { DEMO_ABIS } from './abis.generated';
import { setDemoNow } from './clock';
import { createDemoProvider } from './demoChain';
import { DEMO_CONTRACTS } from './deployment';
import { DEMO_PERSONAS, type DemoState, seedDemoState } from './fixtures';
import { balanceOf, findSlot } from './reducers';
import { DEMO_USDC_NAME } from './reads';

const NOW = 1_800_000_000;
const ADV = DEMO_PERSONAS.advertiserWallet.address as `0x${string}`;
const marketAbi = DEMO_ABIS.Marketplace as unknown as Abi;
const usdcAbi = DEMO_ABIS.USDC as unknown as Abi;

function memoryStore() {
  let state: DemoState = seedDemoState(NOW);
  return {
    get: () => structuredClone(state),
    update: (fn: (s: DemoState) => void) => {
      fn(state);
    },
    replace: (next: DemoState) => {
      state = next;
    },
  };
}

function setup() {
  const store = memoryStore();
  const provider = createDemoProvider(store, { account: ADV, connected: true });
  const transport = custom(provider as unknown as EIP1193Provider, { retryCount: 0 });
  const publicClient = createPublicClient({ chain: foundry, transport, pollingInterval: 10 });
  const walletClient = createWalletClient({ chain: foundry, transport, account: ADV });
  return { store, provider, publicClient, walletClient };
}

let fetchSpy: { mock: { calls: unknown[] } };
let wsSpy: { mock: { calls: unknown[] } };

beforeEach(() => {
  setDemoNow(NOW);
  fetchSpy = vi.spyOn(window, 'fetch');
  wsSpy = vi.spyOn(window, 'WebSocket');
});

afterEach(() => {
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(wsSpy).not.toHaveBeenCalled();
  setDemoNow();
  vi.restoreAllMocks();
});

describe('createDemoProvider (viem over custom transport)', () => {
  it('answers USDC balanceOf from the store', async () => {
    const { store, publicClient } = setup();
    const balance = await publicClient.readContract({
      address: DEMO_CONTRACTS.USDC,
      abi: usdcAbi,
      functionName: 'balanceOf',
      args: [ADV],
    });
    expect(balance).toBe(balanceOf(store.get(), ADV));
    expect(await publicClient.getChainId()).toBe(31337);
  });

  it('runs a full buy_with_permit round trip: quote → permit signature → write → receipt', async () => {
    const { store, publicClient, walletClient } = setup();
    const q = (await publicClient.readContract({
      address: DEMO_CONTRACTS.Marketplace,
      abi: marketAbi,
      functionName: 'quote',
      args: [4n, 4n],
    })) as { sellable: boolean; price: bigint; fee: bigint };
    expect(q.sellable).toBe(true);

    const name = await publicClient.readContract({
      address: DEMO_CONTRACTS.USDC,
      abi: usdcAbi,
      functionName: 'name',
    });
    expect(name).toBe(DEMO_USDC_NAME);
    const deadline = BigInt(NOW + 3600);
    const signature = await walletClient.signTypedData({
      domain: {
        name: DEMO_USDC_NAME,
        version: '2',
        chainId: 31337,
        verifyingContract: DEMO_CONTRACTS.USDC,
      },
      types: usdcPermitTypes,
      primaryType: 'Permit',
      message: {
        owner: ADV,
        spender: DEMO_CONTRACTS.Marketplace,
        value: q.price,
        nonce: 0n,
        deadline,
      },
    });
    expect(signature).toMatch(/^0x[0-9a-f]{130}$/);

    const before = balanceOf(store.get(), ADV);
    const { v, r, s } = splitSignature(signature as Hex);
    const hash = await walletClient.writeContract({
      address: DEMO_CONTRACTS.Marketplace,
      abi: marketAbi,
      functionName: 'buy_with_permit',
      args: [4n, 4n, 3n, q.price, deadline, v, r, s],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe('success');
    expect(findSlot(store.get(), '4')?.leases[4]?.lessee).toBe(ADV);
    expect(balanceOf(store.get(), ADV)).toBe(before - q.price);
    expect(balanceOf(store.get(), DEMO_CONTRACTS.Marketplace)).toBe(0n);
  });

  it('surfaces a contract revert reason ("cpc mode") and records no transaction', async () => {
    const { store, walletClient } = setup();
    const before = store.get();
    await expect(
      walletClient.writeContract({
        address: DEMO_CONTRACTS.Marketplace,
        abi: marketAbi,
        functionName: 'buy_with_permit',
        args: [
          1n,
          0n,
          3n,
          1n,
          BigInt(NOW + 3600),
          27,
          `0x${'1'.repeat(64)}`,
          `0x${'2'.repeat(64)}`,
        ],
      }),
    ).rejects.toThrow(/cpc mode/);
    expect(store.get()).toEqual(before);
  });

  it('signs SIWE messages with a deterministic fake signature', async () => {
    const { walletClient } = setup();
    const a = await walletClient.signMessage({ message: 'hello' });
    const b = await walletClient.signMessage({ message: 'hello' });
    expect(a).toMatch(/^0x[0-9a-f]{130}$/);
    expect(a).toBe(b);
  });

  it('rejects unknown methods with EIP-1193 code 4200', async () => {
    const { provider } = setup();
    await expect(
      provider.request({ method: 'eth_subscribe', params: ['newHeads'] }),
    ).rejects.toMatchObject({
      code: 4200,
    });
  });

  it('exposes no accounts until connected, then the persona; setAccount emits accountsChanged', async () => {
    const store = memoryStore();
    const provider = createDemoProvider(store);
    expect(await provider.request({ method: 'eth_accounts' })).toEqual([]);
    expect(await provider.request({ method: 'eth_requestAccounts' })).toEqual([ADV]);
    const seen: unknown[] = [];
    provider.on('accountsChanged', (accounts) => seen.push(accounts));
    provider.setAccount(DEMO_PERSONAS.publisherDocs.address);
    expect(seen).toEqual([[DEMO_PERSONAS.publisherDocs.address]]);
  });
});
