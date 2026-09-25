/** Synthetic demo deployment (ADR-0016). Static and CI builds have an empty
 * `src/generated/deployments` (the real `31337.json` and `contracts/out` are git-ignored), so demo
 * mode registers its own chain-31337 artifact: obviously-fake addresses plus the committed
 * `DEMO_ABIS`. Nothing at these addresses exists on any chain; the in-memory simulator
 * (`demoChain.ts`) is the only thing that ever "answers" them. */
import type { Abi, Address } from 'viem';
import { foundry } from 'viem/chains';

import { deployments } from '../generated/deployments';
import type { ProtocolContract } from '../lib/deployments';
import { DEMO_ABIS } from './abis.generated';

/** Anvil/foundry chain id — already in `supportedChains`, so no chain config changes. */
export const DEMO_CHAIN_ID = foundry.id;

/** Fixed, obviously-fake contract addresses (`0xde00…0a0n`, EIP-55 checksummed). */
export const DEMO_CONTRACTS = {
  AdSlot: '0xde00000000000000000000000000000000000a01',
  Marketplace: '0xDE00000000000000000000000000000000000A02',
  CreativeRegistry: '0xdE00000000000000000000000000000000000A03',
  USDC: '0xDE00000000000000000000000000000000000A04',
  CampaignVault: '0xDE00000000000000000000000000000000000a05',
} as const satisfies Record<ProtocolContract, Address>;

/** Owner-settable protocol treasury in the demo (receives `fee_bps` of every sale/settlement). */
export const DEMO_TREASURY: Address = '0xdE00000000000000000000000000000000000A0F';

/** Registers the synthetic deployment on the (mutable) generated deployments map so
 * `hasProtocol` / `hasCampaignVault` / `getContract` resolve on chain 31337. Overwrites any local
 * `31337.json`: demo mode must never point at a real Anvil deployment. Idempotent. */
export function registerDemoDeployment(): void {
  const contracts = Object.fromEntries(
    (Object.keys(DEMO_CONTRACTS) as ProtocolContract[]).map((name) => [
      name,
      { address: DEMO_CONTRACTS[name], startBlock: 0, abi: DEMO_ABIS[name] as unknown as Abi },
    ]),
  );
  deployments[DEMO_CHAIN_ID] = {
    artifactVersion: 1,
    chainId: DEMO_CHAIN_ID,
    network: 'demo',
    deployedAt: '1970-01-01T00:00:00Z',
    deployer: DEMO_TREASURY,
    contracts,
  };
}
