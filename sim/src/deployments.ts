import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Abi, Address } from 'viem';

/** Repo root: `npm run -w sim` sets cwd to `sim/`, so relative paths must not use process.cwd(). */
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export type ProtocolName = 'AdSlot' | 'Marketplace' | 'CreativeRegistry' | 'USDC' | 'CampaignVault';

export type ProtocolContracts = Record<ProtocolName, { address: Address; abi: Abi }>;

type Artifact = {
  artifactVersion: number;
  chainId: number;
  contracts: Record<string, { address: string; abi: Abi }>;
};

export function loadProtocol(deploymentsDir: string, chainId: number): ProtocolContracts {
  const dir = isAbsolute(deploymentsDir) ? deploymentsDir : join(REPO_ROOT, deploymentsDir);
  const path = join(dir, `${chainId}.json`);
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    throw new Error(`No ${path}. Run .\\scripts\\setup.cmd first.`);
  }
  const parsed = JSON.parse(raw) as Artifact;
  if (parsed.artifactVersion !== 1 || parsed.chainId !== chainId) {
    throw new Error(`Malformed deployments artifact ${path} (artifactVersion/chainId)`);
  }
  const names: ProtocolName[] = ['AdSlot', 'Marketplace', 'CreativeRegistry', 'USDC', 'CampaignVault'];
  const out = {} as ProtocolContracts;
  for (const name of names) {
    const rec = parsed.contracts[name];
    if (!rec?.address || !rec.abi) {
      throw new Error(`Deployments artifact missing ${name}. Run .\\scripts\\setup.cmd.`);
    }
    out[name] = { address: rec.address as Address, abi: rec.abi };
  }
  return out;
}
