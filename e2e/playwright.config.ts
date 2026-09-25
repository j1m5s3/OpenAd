import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173';
// Same local-dev convenience as e2e/demo/demo.config.ts: unset in CI, so CI behaviour is
// unchanged there.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;

export default defineConfig({
  testDir: './specs',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  webServer: {
    command: 'npm run dev -w web',
    cwd: repoRoot,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
