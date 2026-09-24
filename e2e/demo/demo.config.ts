/** Playwright config for the demo-mode suite (ADR-0016, ROADMAP 6.2). Builds the web app with
 * `VITE_DEMO_MODE=1`, serves it with `vite preview`, and drives both personas through the
 * in-memory demo wallet — no Anvil, API, or real wallet. Separate from the YAML suite
 * (`../playwright.config.ts`), which needs the local stack. */
import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const port = 4173;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts$/,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // One preview server, and every test starts from a fresh page (the demo store is per page load).
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'on-first-retry',
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  webServer: {
    command: `npm run build -w web && npm run preview -w web -- --port ${port} --strictPort`,
    cwd: repoRoot,
    env: { VITE_DEMO_MODE: '1' },
    url: `http://localhost:${port}`,
    // Always build fresh: a reused server could be serving a normal (non-demo) bundle.
    reuseExistingServer: false,
    timeout: 240_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
