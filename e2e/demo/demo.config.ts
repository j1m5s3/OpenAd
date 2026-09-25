/** Playwright config for the demo-mode suite (ADR-0016, ROADMAP 6.2 step 12+13). Builds the
 * static `dist-demo` bundle (`npm run build:demo`: hash router, relative base) and serves it with
 * `e2e/demo/static-server.mjs` under a sub-path, **with no SPA fallback** — the same shape as a
 * static host with no server rewrite (e.g. the hosted demo Artifact). Every test drives the
 * in-memory demo wallet — no Anvil, API, or real wallet. Separate from the YAML suite
 * (`../playwright.config.ts`), which needs the local stack. */
import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const port = 4173;
const mountPath = '/openad-demo/';
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;

/** Maps an app route to its hash-router URL under the sub-path this suite serves from, e.g.
 * `demoPath('/why')` → `/openad-demo/#/why`. Every `page.goto` and URL assertion in
 * `flows.spec.ts` goes through this so the suite stays correct if the mount path ever changes. */
export function demoPath(route: string): string {
  return `${mountPath}#${route}`;
}

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts$/,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // One static server, and every test starts from a fresh page (the demo store is per page load).
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${port}${mountPath}`,
    trace: 'on-first-retry',
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  webServer: {
    command: `npm run build:demo -w web && node e2e/demo/static-server.mjs ${port} web/dist-demo ${mountPath}`,
    cwd: repoRoot,
    url: `http://localhost:${port}${mountPath}`,
    // Always build fresh: a reused server could be serving a stale bundle.
    reuseExistingServer: false,
    timeout: 240_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
