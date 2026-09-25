import { SIM_CHAIN_ID } from './accounts.js';
import { DEFAULT_WEB_ORIGIN } from './siwe.js';

export type SimConfig = {
  rpcUrl: string;
  apiUrl: string;
  /** Origin the personas sign in as. The API binds SIWE messages to its allowed web origins
   *  (ADR-0009 amendment), so this is the web app's origin, never the API's. */
  webOrigin: string;
  chainId: number;
  tickSeconds: number;
  controlPort: number;
  seed: number;
  deploymentsDir: string;
  usdcTarget: bigint;
};

function env(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.length > 0 ? v : fallback;
}

export function loadConfig(): SimConfig {
  const chainId = Number(env('OPENAD_SIM_CHAIN_ID', String(SIM_CHAIN_ID)));
  return {
    rpcUrl: env('OPENAD_SIM_RPC_URL', 'http://127.0.0.1:8545'),
    apiUrl: env('OPENAD_SIM_API_URL', 'http://localhost:8000').replace(/\/$/, ''),
    webOrigin: new URL(env('OPENAD_SIM_WEB_ORIGIN', DEFAULT_WEB_ORIGIN)).origin,
    chainId,
    tickSeconds: Number(env('OPENAD_SIM_TICK_SECONDS', '20')),
    controlPort: Number(env('OPENAD_SIM_CONTROL_PORT', '8610')),
    seed: Number(env('OPENAD_SIM_SEED', '1')),
    deploymentsDir: env('OPENAD_SIM_DEPLOYMENTS_DIR', 'contracts/deployments'),
    usdcTarget: BigInt(env('OPENAD_SIM_USDC_TARGET', '5000000000')),
  };
}

export function assertLocalChain(chainId: number): void {
  if (chainId !== SIM_CHAIN_ID) {
    throw new Error(
      `sim refuses chain id ${chainId}; only Anvil ${SIM_CHAIN_ID} is allowed (ADR-0012)`,
    );
  }
}
