/** In-memory EIP-1193 wallet + chain simulator (ADR-0016, ROADMAP 6.2).
 *
 * The demo wagmi config's only transport is `custom(provider)` over this object, and its only
 * connector wraps it, so every read (`eth_call`), write (`eth_sendTransaction`) and signature
 * request the unchanged feature code makes is answered here from `demoStore`. It opens no socket,
 * holds no key, and never forwards anything: signatures are deterministic fakes (a hash of the
 * payload), and transactions are applied by the pure reducers in `reducers.ts`. */
import {
  type Abi,
  type Address,
  decodeFunctionData,
  encodeAbiParameters,
  encodeFunctionResult,
  getAddress,
  type Hex,
  keccak256,
  numberToHex,
  stringToHex,
  toHex,
} from 'viem';

import type { ProtocolContract } from '../lib/deployments';
import { DEMO_ABIS } from './abis.generated';
import { demoNow } from './clock';
import { DEMO_CHAIN_ID, DEMO_CONTRACTS } from './deployment';
import { DEMO_PERSONAS } from './fixtures';
import { applyCall, type DemoCall, DemoRevert } from './reducers';
import { readCall } from './reads';
import type { demoStore } from './store';

type Store = Pick<typeof demoStore, 'get' | 'update'>;
type Listener = (...args: unknown[]) => void;

export interface Eip1193Request {
  method: string;
  params?: readonly unknown[] | object;
}

/** An EIP-1193 `ProviderRpcError`: `code` drives viem's error mapping (4001 rejected, 4200
 * unsupported, 3 execution reverted with ABI-encoded `Error(string)` in `data`). */
export class DemoProviderError extends Error {
  readonly code: number;
  readonly data?: Hex;
  constructor(code: number, message: string, data?: Hex) {
    super(message);
    this.name = 'DemoProviderError';
    this.code = code;
    if (data !== undefined) this.data = data;
  }
}

export interface DemoProvider {
  request(args: Eip1193Request): Promise<unknown>;
  on(event: string, listener: Listener): DemoProvider;
  removeListener(event: string, listener: Listener): DemoProvider;
  /** Current demo persona address (what `eth_accounts` returns once connected). */
  getAccount(): Address;
  /** Switch persona; emits `accountsChanged` when connected (persona switcher, later step). */
  setAccount(address: string): void;
}

interface DemoReceipt {
  hash: Hex;
  from: Address;
  to: Address;
  data: Hex;
  blockNumber: bigint;
  status: 'success' | 'reverted';
}

const CHAIN_ID_HEX = numberToHex(DEMO_CHAIN_ID);
const GAS = numberToHex(150_000);
const BASE_FEE = numberToHex(1_000_000); // 0.001 gwei — cosmetic, nobody pays gas in the demo.

/** Deterministic block height: one block per 2 s of demo time, so `eth_blockNumber` advances with
 * `demoNow()` and never runs backwards between a tx and its receipt. */
function blockNumberAt(now: number): bigint {
  return BigInt(Math.floor(now / 2));
}

function blockHash(n: bigint): Hex {
  return keccak256(stringToHex(`openad-demo-block-${n.toString()}`));
}

/** ABI-encoded `Error(string)`, as a Solidity/Vyper revert carries it. */
function revertData(reason: string): Hex {
  return `0x08c379a0${encodeAbiParameters([{ type: 'string' }], [reason]).slice(2)}` as Hex;
}

/** Deterministic fake 65-byte signature (r ‖ s ‖ v=27) derived from the payload. It never comes
 * from a key and would never verify on chain — demo mode checks no signatures. */
function fakeSignature(payload: string): Hex {
  const r = keccak256(stringToHex(`openad-demo-sig:${payload}`));
  const s = keccak256(r);
  return `${r}${s.slice(2)}1b` as Hex;
}

const CONTRACT_BY_ADDRESS = new Map<string, ProtocolContract>(
  (Object.entries(DEMO_CONTRACTS) as [ProtocolContract, Address][]).map(([name, address]) => [
    address.toLowerCase(),
    name,
  ]),
);

function paramsArray(params: Eip1193Request['params']): readonly unknown[] {
  return Array.isArray(params) ? params : [];
}

function decodeCall(to: unknown, data: unknown): { call: DemoCall; abi: Abi } {
  const contract = typeof to === 'string' ? CONTRACT_BY_ADDRESS.get(to.toLowerCase()) : undefined;
  if (!contract) throw new DemoProviderError(3, `execution reverted: demo: no contract at ${String(to)}`, revertData('demo: no contract'));
  const abi = DEMO_ABIS[contract] as unknown as Abi;
  const decoded = decodeFunctionData({ abi, data: data as Hex });
  return { call: { contract, functionName: decoded.functionName, args: decoded.args ?? [] }, abi };
}

function toProviderError(err: unknown): DemoProviderError {
  if (err instanceof DemoProviderError) return err;
  if (err instanceof DemoRevert) return new DemoProviderError(3, err.message, revertData(err.reason));
  const message = err instanceof Error ? err.message : String(err);
  return new DemoProviderError(3, `execution reverted: ${message}`, revertData(message));
}

/** Creates the simulator. `store` is `demoStore` in the app, an isolated store in tests. */
export function createDemoProvider(
  store: Store,
  options: { account?: string; connected?: boolean } = {},
): DemoProvider {
  let account: Address = getAddress(options.account ?? DEMO_PERSONAS.advertiserWallet.address);
  let connected = options.connected ?? false;
  let txCounter = 0;
  const receipts = new Map<string, DemoReceipt>();
  const listeners = new Map<string, Set<Listener>>();

  function emit(event: string, ...args: unknown[]): void {
    for (const fn of listeners.get(event) ?? []) fn(...args);
  }

  function requireSender(from: unknown): Address {
    if (!connected) throw new DemoProviderError(4100, 'Demo wallet is not connected');
    const sender = getAddress(String(from ?? account));
    if (sender !== account) throw new DemoProviderError(4100, `Demo wallet does not control ${sender}`);
    return sender;
  }

  function block(n: bigint) {
    const now = demoNow();
    return {
      number: numberToHex(n),
      hash: blockHash(n),
      parentHash: blockHash(n - 1n),
      timestamp: numberToHex(now),
      baseFeePerGas: BASE_FEE,
      gasLimit: numberToHex(30_000_000),
      gasUsed: '0x0',
      miner: '0x0000000000000000000000000000000000000000',
      nonce: '0x0000000000000000',
      difficulty: '0x0',
      totalDifficulty: '0x0',
      extraData: '0x',
      logsBloom: `0x${'0'.repeat(512)}`,
      sha3Uncles: `0x${'0'.repeat(64)}`,
      stateRoot: `0x${'0'.repeat(64)}`,
      receiptsRoot: `0x${'0'.repeat(64)}`,
      transactionsRoot: `0x${'0'.repeat(64)}`,
      mixHash: `0x${'0'.repeat(64)}`,
      size: '0x0',
      uncles: [],
      transactions: [],
    };
  }

  function txObject(r: DemoReceipt) {
    return {
      hash: r.hash,
      from: r.from,
      to: r.to,
      input: r.data,
      value: '0x0',
      gas: GAS,
      gasPrice: BASE_FEE,
      maxFeePerGas: BASE_FEE,
      maxPriorityFeePerGas: '0x0',
      nonce: '0x0',
      blockHash: blockHash(r.blockNumber),
      blockNumber: numberToHex(r.blockNumber),
      transactionIndex: '0x0',
      chainId: CHAIN_ID_HEX,
      type: '0x2',
      v: '0x0',
      r: `0x${'0'.repeat(64)}`,
      s: `0x${'0'.repeat(64)}`,
      yParity: '0x0',
      accessList: [],
    };
  }

  function receiptObject(r: DemoReceipt) {
    return {
      transactionHash: r.hash,
      transactionIndex: '0x0',
      blockHash: blockHash(r.blockNumber),
      blockNumber: numberToHex(r.blockNumber),
      from: r.from,
      to: r.to,
      contractAddress: null,
      cumulativeGasUsed: GAS,
      gasUsed: GAS,
      effectiveGasPrice: BASE_FEE,
      // The UI re-reads the (fixture) API after a write; it never parses logs.
      logs: [],
      logsBloom: `0x${'0'.repeat(512)}`,
      status: r.status === 'success' ? '0x1' : '0x0',
      type: '0x2',
    };
  }

  async function handle({ method, params }: Eip1193Request): Promise<unknown> {
    const p = paramsArray(params);
    switch (method) {
      case 'eth_chainId':
        return CHAIN_ID_HEX;
      case 'net_version':
        return String(DEMO_CHAIN_ID);
      case 'eth_accounts':
        return connected ? [account] : [];
      case 'eth_requestAccounts':
        if (!connected) {
          connected = true;
          emit('connect', { chainId: CHAIN_ID_HEX });
        }
        return [account];
      case 'wallet_revokePermissions':
        connected = false;
        emit('accountsChanged', []);
        return null;
      case 'wallet_switchEthereumChain': {
        const requested = (p[0] as { chainId?: string } | undefined)?.chainId;
        if (requested && Number(requested) !== DEMO_CHAIN_ID) {
          throw new DemoProviderError(4902, `Demo wallet only knows chain ${DEMO_CHAIN_ID}`);
        }
        return null;
      }
      case 'wallet_addEthereumChain':
        return null;
      case 'eth_blockNumber':
        return numberToHex(blockNumberAt(demoNow()));
      case 'eth_getBlockByNumber': {
        const tag = p[0];
        const n = typeof tag === 'string' && tag.startsWith('0x') ? BigInt(tag) : blockNumberAt(demoNow());
        return block(n);
      }
      case 'eth_getBlockByHash':
        return block(blockNumberAt(demoNow()));
      case 'eth_estimateGas':
        return GAS;
      case 'eth_gasPrice':
        return BASE_FEE;
      case 'eth_maxPriorityFeePerGas':
        return '0x0';
      case 'eth_feeHistory':
        return {
          oldestBlock: numberToHex(blockNumberAt(demoNow())),
          baseFeePerGas: [BASE_FEE, BASE_FEE],
          gasUsedRatio: [0],
          reward: [['0x0']],
        };
      case 'eth_getTransactionCount':
        return numberToHex(txCounter);
      case 'eth_getBalance':
        return numberToHex(10n ** 18n); // 1 ETH of fake gas money.
      case 'eth_getCode': {
        const addr = String(p[0] ?? '').toLowerCase();
        return CONTRACT_BY_ADDRESS.has(addr) ? '0x00' : '0x';
      }
      case 'eth_call': {
        const tx = (p[0] ?? {}) as { to?: string; data?: Hex; from?: string };
        try {
          const { call, abi } = decodeCall(tx.to, tx.data);
          const fn = abi.find((e) => e.type === 'function' && e.name === call.functionName);
          const isView = fn?.type === 'function' && (fn.stateMutability === 'view' || fn.stateMutability === 'pure');
          const now = demoNow();
          // A write sent as eth_call is a simulation: run the reducer on a copy, discard the state.
          const result = isView
            ? readCall(store.get(), call, now)
            : applyCall(store.get(), call, getAddress(tx.from ?? account), now).result;
          const hasOutputs = fn?.type === 'function' && fn.outputs.length > 0;
          if (!hasOutputs) return '0x';
          return encodeFunctionResult({ abi, functionName: call.functionName, result } as Parameters<typeof encodeFunctionResult>[0]);
        } catch (err) {
          throw toProviderError(err);
        }
      }
      case 'eth_sendTransaction': {
        const tx = (p[0] ?? {}) as { from?: string; to?: string; data?: Hex };
        const sender = requireSender(tx.from);
        let decoded: { call: DemoCall; abi: Abi };
        try {
          decoded = decodeCall(tx.to, tx.data);
          const now = demoNow();
          const { state } = applyCall(store.get(), decoded.call, sender, now);
          txCounter += 1;
          const hash = keccak256(toHex(txCounter));
          receipts.set(hash, {
            hash,
            from: sender,
            to: getAddress(String(tx.to)),
            data: tx.data ?? '0x',
            blockNumber: blockNumberAt(now),
            status: 'success',
          });
          store.update((live) => {
            Object.assign(live, state);
          });
          return hash;
        } catch (err) {
          // Like a wallet's pre-flight estimateGas: a reverting call never becomes a transaction.
          throw toProviderError(err);
        }
      }
      case 'eth_getTransactionReceipt': {
        const r = receipts.get(String(p[0]));
        return r ? receiptObject(r) : null;
      }
      case 'eth_getTransactionByHash': {
        const r = receipts.get(String(p[0]));
        return r ? txObject(r) : null;
      }
      case 'personal_sign': {
        requireSender(p[1]);
        return fakeSignature(`personal_sign:${String(p[0])}`);
      }
      case 'eth_signTypedData_v4': {
        requireSender(p[0]);
        return fakeSignature(`typed:${typeof p[1] === 'string' ? p[1] : JSON.stringify(p[1])}`);
      }
      default:
        // eth_subscribe, wallet_requestPermissions, wallet_getCapabilities, … — unsupported.
        throw new DemoProviderError(4200, `Demo wallet does not support ${method}`);
    }
  }

  const provider: DemoProvider = {
    request: handle,
    on(event, listener) {
      const set = listeners.get(event) ?? new Set<Listener>();
      set.add(listener);
      listeners.set(event, set);
      return provider;
    },
    removeListener(event, listener) {
      listeners.get(event)?.delete(listener);
      return provider;
    },
    getAccount: () => account,
    setAccount(address) {
      account = getAddress(address);
      if (connected) emit('accountsChanged', [account]);
    },
  };
  return provider;
}
