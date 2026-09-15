/** Copy for the health banner. Serving never reads the chain; lag is indexer-only. */
export function indexerLagCopy(lag: number | null | undefined, reachable: boolean): string {
  if (!reachable) {
    return 'Indexer lag unavailable (reorg-safe cursor waits on the API).';
  }
  if (lag == null) {
    return 'Indexer lag unknown (reorg-safe rewind still applies).';
  }
  if (lag === 0) {
    return 'Indexer lag: 0 blocks (reorg-safe).';
  }
  return `Indexer lag: ${lag} blocks (reorg-safe rewind).`;
}
