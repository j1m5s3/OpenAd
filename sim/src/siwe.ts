import { type Address, getAddress } from 'viem';
import { createSiweMessage } from 'viem/siwe';

/** The EIP-4361 message, built like the web app's (`web/src/lib/permit.ts`): viem's
 *  `createSiweMessage`, so the layout and the EIP-55 address are exactly what the API parses. */
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

/** The web app's default dev origin: the first entry of the API's default OPENAD_CORS_ORIGINS. */
export const DEFAULT_WEB_ORIGIN = 'http://localhost:5173';

/** Sign-in fields for `webOrigin`: EIP-4361 `domain` is the authority (host and port) and
 *  `uri` the origin itself, exactly what the web app sends from `window.location`. */
export function siweOrigin(webOrigin: string): { domain: string; uri: string } {
  const url = new URL(webOrigin);
  return { domain: url.host, uri: url.origin };
}

function isChecksummed(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address) && getAddress(address) === address;
}

/**
 * Client-side mirror of the API's strict EIP-4361 checks (api/src/openad/siwe.py) for the
 * message the sim sends (no statement, no optional fields): EIP-4361's two empty lines after
 * the address, an EIP-55 address, a `domain` and `URI` bound to `webOrigin`, the chain id,
 * `Version: 1` and a nonce of 8 to 64 alphanumerics.
 */
export function siweLooksValid(message: string, chainId: number, webOrigin: string): boolean {
  const { domain, uri } = siweOrigin(webOrigin);
  const lines = message.split('\n');
  return (
    !message.includes('\r') &&
    lines.length === 9 &&
    lines[0] === `${domain} wants you to sign in with your Ethereum account:` &&
    isChecksummed(lines[1] ?? '') &&
    lines[2] === '' &&
    lines[3] === '' &&
    lines[4] === `URI: ${uri}` &&
    lines[5] === 'Version: 1' &&
    lines[6] === `Chain ID: ${chainId}` &&
    /^Nonce: [a-zA-Z0-9]{8,64}$/.test(lines[7] ?? '') &&
    /^Issued At: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(lines[8] ?? '')
  );
}
