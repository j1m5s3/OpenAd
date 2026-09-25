import type { Address, Hex } from 'viem';
import { createSiweMessage } from 'viem/siwe';

import { formatUsdc } from './format';

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

export function permitDeadline(nowSeconds = Math.floor(Date.now() / 1000)): bigint {
  return BigInt(nowSeconds + 3600);
}

export function buyCtaLabel(sellable: boolean, remainder: boolean): string {
  if (remainder) return 'Buy remainder';
  if (sellable) return 'Buy with permit';
  return 'Not sellable';
}

export function quoteFeeCopy(price: bigint, fee: bigint): { net: bigint; line: string } {
  const net = price > fee ? price - fee : 0n;
  return {
    net,
    line: `${formatUsdc(fee)} protocol fee · ${formatUsdc(net)} to the publisher`,
  };
}

/**
 * The EIP-4361 sign-in message, built by viem's `createSiweMessage`: the exact layout the API
 * parses (`address LF LF [statement LF] LF "URI: "…`), with the address EIP-55 checksummed
 * (ADR-0009 amendment). viem throws on a field EIP-4361 does not allow, such as a nonce that is
 * not 8+ alphanumerics.
 */
export function buildSiweMessage(params: {
  domain: string;
  address: Address;
  uri: string;
  chainId: number;
  nonce: string;
  issuedAt?: string;
}): string {
  return createSiweMessage({
    domain: params.domain,
    address: params.address,
    uri: params.uri,
    chainId: params.chainId,
    nonce: params.nonce,
    version: '1',
    issuedAt: params.issuedAt === undefined ? new Date() : new Date(params.issuedAt),
  });
}
