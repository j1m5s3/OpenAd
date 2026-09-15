import type { Address } from 'viem';

export function buildSiweMessage(params: {
  domain: string;
  address: Address;
  uri: string;
  chainId: number;
  nonce: string;
  issuedAt?: string;
}): string {
  const issuedAt = params.issuedAt ?? new Date().toISOString();
  return [
    `${params.domain} wants you to sign in with your Ethereum account:`,
    params.address,
    '',
    'URI: ' + params.uri,
    'Version: 1',
    `Chain ID: ${params.chainId}`,
    `Nonce: ${params.nonce}`,
    `Issued At: ${issuedAt}`,
  ].join('\n');
}

export function siweLooksValid(message: string, chainId: number): boolean {
  return (
    /0x[a-fA-F0-9]{40}/.test(message) &&
    /Nonce: [a-zA-Z0-9]+/.test(message) &&
    message.includes(`Chain ID: ${chainId}`)
  );
}
