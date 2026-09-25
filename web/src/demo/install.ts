/** Demo mode installer (ADR-0016). Called once from `main.tsx` before `App` is imported, so it
 * never runs — and its module is never bundled — outside a `VITE_DEMO_MODE=1` build. */
import { setRequestHandler } from '../lib/api';
import { createDemoProvider, type DemoProvider } from './demoChain';
import { createDemoRequestHandler } from './demoApi';
import { buildServeResponse } from './demoServe';
import { registerDemoDeployment } from './deployment';
import { demoNow } from './clock';
import { installNetworkGuard, registerDemoResponder } from './networkGuard';
import { demoStore } from './store';

/** Installs the fixture-backed `lib/api.ts` request handler (ROADMAP 6.2 step 6,
 * `web/src/demo/demoApi.ts`), so every `api.*` call resolves from `demoStore` instead of
 * reaching the network. */
function installDemoRequestHandler(): void {
  setRequestHandler(createDemoRequestHandler(demoStore));
}

/** Matches exactly `GET /v1/serve/{id}` — one path segment after `serve`, nothing more (rules
 * out `POST /v1/serve/0`, a trailing sub-path like `/v1/serve/0/x`, and a near-miss route like
 * `/v1/serves/0`). Exported so it is unit-tested directly (`networkGuard.test.ts`), separately
 * from the guard's own same-origin check (`isAllowedDemoUrl`), which is what actually rules out a
 * cross-origin request before this matcher is ever consulted. */
export function isServeRoute(method: string, pathname: string): boolean {
  return method === 'GET' && /^\/v1\/serve\/[^/]+$/.test(pathname);
}

/** The network guard's only same-origin exception (ROADMAP 6.2 step 10+11, `/embed-demo`): the
 * real `<open-ad>` element calls `fetch("{origin}/v1/serve/{id}")`, and the guard would otherwise
 * deny every `/v1` path. Answers that one `GET` route in-process from `demoStore`; every other
 * `/v1` path, and any cross-origin request, stays denied (`networkGuard.ts`). */
function installDemoServeResponder(): void {
  registerDemoResponder(isServeRoute, (url) => {
    const slotId = decodeURIComponent(url.pathname.split('/').pop() ?? '');
    const body = buildServeResponse(demoStore.get(), slotId, demoNow());
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
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
  installDemoServeResponder();
  installDemoRequestHandler();
  installDemoWalletConnector();
  mountDemoBanner();
}
