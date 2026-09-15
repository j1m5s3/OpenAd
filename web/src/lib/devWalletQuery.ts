/** Preserve `?devwallet=` across in-app links (ADR-0013 critique sessions). */

export function withDevWalletParam(
  path: string,
  search = typeof window === 'undefined' ? '' : window.location.search,
): string {
  const raw = search.startsWith('?') ? search.slice(1) : search;
  const id = new URLSearchParams(raw).get('devwallet');
  if (!id) return path;
  const qIndex = path.indexOf('?');
  const pathname = qIndex === -1 ? path : path.slice(0, qIndex);
  const existing = qIndex === -1 ? '' : path.slice(qIndex + 1);
  const params = new URLSearchParams(existing);
  params.set('devwallet', id);
  return `${pathname}?${params.toString()}`;
}
