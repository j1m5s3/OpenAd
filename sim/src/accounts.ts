/** Public Foundry Anvil keys (ADR-0012). Never use outside local chain 31337. */

import type { Address, Hex } from 'viem';

export const SIM_CHAIN_ID = 31337;

/** Deployer / treasury. Used only to top up persona USDC. Never a sim persona. */
export const FUNDER = {
  address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Address,
  privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as Hex,
};

export type PersonaRole = 'publisher' | 'advertiser';

export type Persona = {
  id: string;
  role: PersonaRole;
  address: Address;
  privateKey: Hex;
};

/** #3–#5 publishers, #6–#9 advertisers. #1/#2 stay with e2e. */
export const PERSONAS: readonly Persona[] = [
  {
    id: 'pub-3',
    role: 'publisher',
    address: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
    privateKey: '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
  },
  {
    id: 'pub-4',
    role: 'publisher',
    address: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
    privateKey: '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a',
  },
  {
    id: 'pub-5',
    role: 'publisher',
    address: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc',
    privateKey: '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba',
  },
  {
    id: 'adv-6',
    role: 'advertiser',
    address: '0x976EA74026E726554dB657fA54763abd0C3a0aa9',
    privateKey: '0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e',
  },
  {
    id: 'adv-7',
    role: 'advertiser',
    address: '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955',
    privateKey: '0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356',
  },
  {
    id: 'adv-8',
    role: 'advertiser',
    address: '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f',
    privateKey: '0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97',
  },
  {
    id: 'adv-9',
    role: 'advertiser',
    address: '0xa0Ee7A142d267C1f36714E4a8F75612F20a79720',
    privateKey: '0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6',
  },
];

export function publishers(): Persona[] {
  return PERSONAS.filter((p) => p.role === 'publisher');
}

export function advertisers(): Persona[] {
  return PERSONAS.filter((p) => p.role === 'advertiser');
}

export function personaById(id: string): Persona | undefined {
  return PERSONAS.find((p) => p.id === id);
}

export function personaByAddress(address: string): Persona | undefined {
  const lower = address.toLowerCase();
  return PERSONAS.find((p) => p.address.toLowerCase() === lower);
}

export const SIM_ADDRESSES = new Set(PERSONAS.map((p) => p.address.toLowerCase()));
