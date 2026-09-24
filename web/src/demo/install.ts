/** Demo mode installer (ADR-0016). Called once from `main.tsx` before `App` is imported, so it
 * never runs — and its module is never bundled — outside a `VITE_DEMO_MODE=1` build. */
import { installNetworkGuard } from './networkGuard';

/** Installs the fixture-backed `lib/api.ts` request handler (ROADMAP 6.2 step 6,
 * `web/src/demo/demoApi.ts`). A no-op today: kept as a named step so `installDemo` already
 * calls the full sequence that step 6 fills in, in place, without changing this call site. */
function installDemoRequestHandler(): void {}

/** Installs the in-memory EIP-1193 simulator behind the wagmi `mock` connector (ROADMAP 6.2
 * step 7, `web/src/demo/demoChain.ts`). A no-op today, for the same reason as
 * `installDemoRequestHandler` above. */
function installDemoWalletConnector(): void {}

/** Mounts the persistent `DemoBanner`. `app/Layout.tsx` renders it directly behind the
 * `DEMO_MODE` flag (ROADMAP 6.2 step 8); this hook is a no-op placeholder kept for symmetry with
 * the other install steps and for any non-Layout entry point demo mode later needs. */
function mountDemoBanner(): void {
  // Layout.tsx renders <DemoBanner /> directly when DEMO_MODE is true.
}

/** Installs demo mode: the network guard first (so any leak from what follows fails loudly),
 * then the read/write seams later steps fill in. */
export function installDemo(): void {
  installNetworkGuard();
  installDemoRequestHandler();
  installDemoWalletConnector();
  mountDemoBanner();
}
