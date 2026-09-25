/** Demo mode clock (ADR-0016).
 *
 * Every fixture time is generated relative to `demoNow()` instead of hard-coded Unix seconds, so
 * the seeded auctions, leases and campaigns never look stale no matter when the demo build is
 * opened. `setDemoNow` exists only so tests can pin a value and assert exact prices/derivations.
 */

let override: number | null = null;

/** Current demo time, in Unix seconds: the test override when one is set, otherwise the real
 * wall clock (so the demo build itself always tracks real time, not a value frozen at load). */
export function demoNow(): number {
  return override ?? Math.floor(Date.now() / 1000);
}

/** Test-only override of `demoNow()`. Pass no argument (or `null`) to clear it and go back to
 * tracking the real wall clock. */
export function setDemoNow(unixSeconds?: number | null): void {
  override = unixSeconds ?? null;
}
