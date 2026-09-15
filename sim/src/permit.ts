import type { Hex } from 'viem';

export const usdcPermitTypes = {
  Permit: [
    { name: 'owner', type: 'address' },
    { name: 'spender', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

export function splitSignature(signature: Hex): { v: number; r: Hex; s: Hex } {
  const hex = signature.slice(2);
  const r = `0x${hex.slice(0, 64)}` as Hex;
  const s = `0x${hex.slice(64, 128)}` as Hex;
  let v = Number.parseInt(hex.slice(128, 130), 16);
  if (v < 27) v += 27;
  return { v, r, s };
}
