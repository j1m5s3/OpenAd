type ConnectorHint = { id: string; name: string; type: string };

/** Prefer RainbowKit `injectedWallet`; never the MetaMask SDK connector. */
export function pickDevWalletConnector<T extends ConnectorHint>(
  connectors: readonly T[],
): T | undefined {
  return (
    connectors.find((c) => c.id === 'injected') ??
    connectors.find((c) => c.type === 'injected' && c.id !== 'metaMask')
  );
}

export function isOpenAdDevWallet(value: unknown): boolean {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'isOpenAdDevWallet' in value &&
      (value as { isOpenAdDevWallet?: boolean }).isOpenAdDevWallet,
  );
}
