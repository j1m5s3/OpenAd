/** Optional Turnkey / AppKit path (ADR-0011). RainbowKit remains the default. */

export function turnkeyConfigured(): boolean {
  return Boolean(
    import.meta.env.VITE_TURNKEY_ORGANIZATION_ID &&
      import.meta.env.VITE_TURNKEY_AUTH_PROXY_CONFIG_ID,
  );
}

/** Gas sponsorship is a Base paymaster concern; Anvil is pre-funded and skips it. */
export function gasSponsorshipActive(chainId: number): boolean {
  return turnkeyConfigured() && chainId === 8453;
}
