// Boots a *built* web image's page in headless Chromium and checks it actually rendered, rather
// than crashing before React ever paints anything (ROADMAP 6.11 / ADR-0017's images). CI's
// `docker` job runs this against the non-demo web image and the web-demo image alike, right after
// each one is built and started as a container — this is the regression test for "an unset
// WalletConnect project id throws at startup and the real app boots to a blank page"
// (RainbowKit's `getWalletConnectConnector` throws synchronously, during config construction, if
// given a falsy `projectId` — see `web/src/lib/wagmi.ts`).
//
// Neither image ships an API in CI, so a failed network request (a 404 fetch, a WalletConnect
// relay this sandbox can't reach) is expected and NOT a failure — deliberately not checked here.
// This fails only on:
//   - any uncaught page error;
//   - `#root` still having no element children or no visible text 10 s after load;
//   - a console message matching /projectId/i (RainbowKit's own "No projectId found" message,
//     the exact regression this guards).
//
// Usage: node e2e/scripts/web-boot-check.mjs <url> [--out <dir>]
//   <url>        the running container's page, e.g. http://127.0.0.1:5181/
//   --out <dir>  where to save a screenshot if the check fails (default: cwd)
import { mkdirSync } from 'node:fs';
import path from 'node:path';

import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith('--'));
const outFlagIndex = args.indexOf('--out');
const outDir = outFlagIndex !== -1 ? args[outFlagIndex + 1] : process.cwd();

if (!url) {
  console.error('usage: node e2e/scripts/web-boot-check.mjs <url> [--out <dir>]');
  process.exit(2);
}

// As e2e/demo/demo.config.ts and e2e/demo/capture-screenshots.mjs do: honour a pinned Chromium
// build (never `playwright install` in this environment) and fall back to Playwright's own
// managed browser when unset.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
const PROJECT_ID_MESSAGE = /projectId/i;
const RENDERED_TIMEOUT_MS = 10_000;

async function main() {
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  const problems = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));
    page.on('console', (msg) => {
      if (PROJECT_ID_MESSAGE.test(msg.text())) {
        problems.push(`console ${msg.type()}: ${msg.text()}`);
      }
    });

    try {
      await page.goto(url);
    } catch (err) {
      problems.push(`failed to load ${url}: ${err.message}`);
    }

    if (!problems.some((p) => p.startsWith('failed to load'))) {
      try {
        await page.waitForFunction(
          () => {
            const root = document.getElementById('root');
            return (
              Boolean(root) && root.children.length > 0 && (root.innerText ?? '').trim().length > 0
            );
          },
          undefined,
          { timeout: RENDERED_TIMEOUT_MS },
        );
      } catch {
        problems.push(
          `#root has no element children or no visible text ${RENDERED_TIMEOUT_MS / 1000}s after load`,
        );
      }
    }

    if (problems.length > 0) {
      mkdirSync(outDir, { recursive: true });
      const shotPath = path.join(outDir, 'web-boot-check-failure.png');
      await page.screenshot({ path: shotPath, fullPage: true }).catch(() => {});
      console.error(`web-boot-check: ${problems.length} problem(s) at ${url}`);
      for (const problem of problems) console.error(`  - ${problem}`);
      console.error(`  screenshot: ${shotPath}`);
      process.exitCode = 1;
      return;
    }
    console.log(`web-boot-check: ok (${url})`);
  } finally {
    await browser.close();
  }
}

await main();
