/** Persistent demo-mode banner (ADR-0016). Rendered whenever `DEMO_MODE` is on, so nobody
 * mistakes the seeded fixtures and simulated wallet for real funds or a real chain. */
export function DemoBanner() {
  return (
    <p
      role="status"
      className="border-b border-accent/40 bg-accent/10 px-4 py-1.5 text-center text-xs font-medium text-ink"
    >
      Demo — simulated data, no real funds or chain
    </p>
  );
}
