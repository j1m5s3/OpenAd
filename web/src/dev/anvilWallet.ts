/** Dev-only EIP-1193 injector (ADR-0013). Addresses only — Anvil signs on 31337. */

export const ANVIL_CHAIN_ID = 31337;
export const ANVIL_CHAIN_HEX = '0x7a69';

/** Public Foundry Anvil addresses. Critique sessions wear pub-3…adv-9 only. */
export const DEV_WALLET_PERSONAS: Readonly<Record<string, `0x${string}`>> = {
  'pub-3': '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
  'pub-4': '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
  'pub-5': '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc',
  'adv-6': '0x976EA74026E726554dB657fA54763abd0C3a0aa9',
  'adv-7': '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955',
  'adv-8': '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f',
  'adv-9': '0xa0Ee7A142d267C1f36714E4a8F75612F20a79720',
  'e2e-publisher': '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  'e2e-advertiser': '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
};

export type DevWalletTarget = { id: string; address: `0x${string}` };

export type Eip1193RequestArguments = {
  method: string;
  params?: unknown;
};

type Listener = (...args: unknown[]) => void;

export function parseDevWalletId(search: string): string | null {
  const raw = search.startsWith('?') ? search.slice(1) : search;
  const id = new URLSearchParams(raw).get('devwallet');
  if (!id || !(id in DEV_WALLET_PERSONAS)) return null;
  return id;
}

export function isLocalHref(href: string): boolean {
  try {
    const url = new URL(href);
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

export function resolveChainId(envValue: string | undefined): number {
  const n = Number(envValue ?? ANVIL_CHAIN_ID);
  return Number.isFinite(n) ? n : ANVIL_CHAIN_ID;
}

export function shouldInstallDevWallet(opts: {
  isDev: boolean;
  href: string;
  chainId: number;
}): DevWalletTarget | null {
  if (!opts.isDev || opts.chainId !== ANVIL_CHAIN_ID || !isLocalHref(opts.href)) return null;
  const id = parseDevWalletId(new URL(opts.href).search);
  if (!id) return null;
  const address = DEV_WALLET_PERSONAS[id];
  if (!address) return null;
  return { id, address };
}

function asRpcParams(params: unknown): unknown[] {
  if (params === undefined || params === null) return [];
  if (Array.isArray(params)) return params;
  return [params];
}

export async function anvilRpc(
  method: string,
  params: unknown[] = [],
  rpcFetch: typeof fetch = fetch,
): Promise<unknown> {
  const res = await rpcFetch('/anvil', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = (await res.json()) as {
    result?: unknown;
    error?: { message?: string; code?: number };
  };
  if (json.error) {
    const err = new Error(json.error.message ?? 'anvil rpc error') as Error & { code?: number };
    if (json.error.code !== undefined) err.code = json.error.code;
    throw err;
  }
  return json.result;
}

export const DEV_WALLET_RDNS = 'dev.openad.anvil';
export const DEV_WALLET_UUID = '00130013-0ead-4013-b013-000000000013';
export const DEV_WALLET_ICON =
  'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect fill="%23c8f542" width="32" height="32" rx="8"/></svg>';

export type DevWalletProvider = {
  isOpenAdDevWallet: true;
  /** False so RainbowKit does not swap in the MetaMask SDK connector. */
  isMetaMask: false;
  isConnected: true;
  selectedAddress: `0x${string}`;
  chainId: typeof ANVIL_CHAIN_HEX;
  request: (args: Eip1193RequestArguments) => Promise<unknown>;
  on: (event: string, listener: Listener) => void;
  removeListener: (event: string, listener: Listener) => void;
  addListener: (event: string, listener: Listener) => void;
  off: (event: string, listener: Listener) => void;
};

export function createDevWalletProvider(
  address: `0x${string}`,
  rpcFetch: typeof fetch = fetch,
): DevWalletProvider {
  const listeners = new Map<string, Set<Listener>>();

  function on(event: string, listener: Listener): void {
    const set = listeners.get(event) ?? new Set<Listener>();
    set.add(listener);
    listeners.set(event, set);
  }

  function removeListener(event: string, listener: Listener): void {
    listeners.get(event)?.delete(listener);
  }

  async function request(args: Eip1193RequestArguments): Promise<unknown> {
    const { method } = args;
    const params = asRpcParams(args.params);
    if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [address];
    if (method === 'eth_chainId') return ANVIL_CHAIN_HEX;
    if (method === 'net_version') return String(ANVIL_CHAIN_ID);
    if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain') {
      return null;
    }
    if (method === 'wallet_requestPermissions' || method === 'wallet_getPermissions') {
      return [{ parentCapability: 'eth_accounts' }];
    }
    if (method === 'personal_sign') {
      try {
        return await anvilRpc('personal_sign', params, rpcFetch);
      } catch (first) {
        if (params.length >= 2) {
          try {
            return await anvilRpc('personal_sign', [params[1], params[0]], rpcFetch);
          } catch {
            throw first;
          }
        }
        throw first;
      }
    }
    return anvilRpc(method, params, rpcFetch);
  }

  return {
    isOpenAdDevWallet: true,
    isMetaMask: false,
    isConnected: true,
    selectedAddress: address,
    chainId: ANVIL_CHAIN_HEX,
    request,
    on,
    removeListener,
    addListener: on,
    off: removeListener,
  };
}

export function announceEip6963(
  provider: DevWalletProvider,
  target: Pick<Window, 'dispatchEvent' | 'addEventListener'> = window,
): void {
  const info = Object.freeze({
    uuid: DEV_WALLET_UUID,
    name: 'OpenAd Anvil',
    icon: DEV_WALLET_ICON,
    rdns: DEV_WALLET_RDNS,
  });
  const announce = () => {
    target.dispatchEvent(
      new CustomEvent('eip6963:announceProvider', {
        detail: Object.freeze({ info, provider }),
      }),
    );
  };
  announce();
  target.addEventListener('eip6963:requestProvider', announce);
}

export function installDevWallet(
  href = typeof window === 'undefined' ? '' : window.location.href,
  isDev = import.meta.env.DEV,
  chainId = resolveChainId(import.meta.env.VITE_CHAIN_ID),
): DevWalletTarget | null {
  const target = shouldInstallDevWallet({ isDev, href, chainId });
  if (!target || typeof window === 'undefined') return null;
  const provider = createDevWalletProvider(target.address);
  Object.defineProperty(window, 'ethereum', { value: provider, configurable: true });
  announceEip6963(provider);
  return target;
}
