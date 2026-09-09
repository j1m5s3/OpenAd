// Addresses + ABIs per chain from the deployments artifact (docs/ARCHITECTURE.md §4.1).
// `src/generated/deployments` is produced by `npm run sync:deployments`.
import type { Abi, Address } from 'viem';

import { deployments } from '../generated/deployments';

export interface ContractArtifact {
  address: string;
  startBlock: number;
  abi: Abi;
}

export interface DeploymentsArtifact {
  artifactVersion: 1;
  chainId: number;
  network: string;
  deployedAt: string;
  deployer: string;
  contracts: Record<string, ContractArtifact>;
}

export type ProtocolContract = 'AdSlot' | 'Marketplace' | 'CreativeRegistry' | 'USDC';

export function getDeployment(chainId: number): DeploymentsArtifact | undefined {
  return deployments[chainId];
}

export function hasProtocol(chainId: number): boolean {
  const d = deployments[chainId];
  return !!d && ['AdSlot', 'Marketplace', 'CreativeRegistry'].every((n) => n in d.contracts);
}

export function getContract(
  chainId: number,
  name: ProtocolContract,
): { address: Address; abi: Abi } {
  const artifact = deployments[chainId]?.contracts[name];
  if (!artifact) {
    throw new Error(
      `No deployment for ${name} on chain ${chainId}. Run the deploy script and \`npm run sync:deployments\`.`,
    );
  }
  return { address: artifact.address as Address, abi: artifact.abi };
}
