/** Demo mode installer (ADR-0016). Called once from `main.tsx` before `App` is imported, so it
 * never runs — and its module is never bundled — outside a `VITE_DEMO_MODE=1` build. */
import { setRequestHandler } from '../lib/api';
import { createDemoProvider, type DemoProvider } from './demoChain';
import { createDemoRequestHandler } from './demoApi';
import { registerDemoDeployment } from './deployment';
import { installNetworkGuard } from './networkGuard';
import { demoStore } from './store';

/** Installs the fixture-backed `lib/api.ts` request handler (ROADMAP 6.2 step 6,
 * `web/src/demo/demoApi.ts`), so every `api.*` call resolves from `demoStore` instead of
 * reaching the network. */
function installDemoRequestHandler(): void {
  setRequestHandler(createDemoRequestHandler(demoStore));
}

let demoProvider: DemoProvider | null = null;

/** Registers the synthetic chain-31337 deployment (so `hasProtocol`/`getContract` resolve to the
 * demo addresses) and creates the in-memory EIP-1193 simulator (`demoChain.ts`) that
 * `wagmiDemo.ts` wires in as the only transport and the only wallet (ROADMAP 6.2 step 7). Must run
 * before `App` renders. */
function installDemoWalletConnector(): void {
  registerDemoDeployment();
  demoProvider ??= createDemoProvider(demoStore);
}

/** The simulator `installDemo()` created. Throws if called before `installDemo()`. */
export function getDemoProvider(): DemoProvider {
  if (!demoProvider) throw new Error('installDemo() must run before the demo wagmi config is built');
  return demoProvider;
}

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
