// Boots a *built* web image's page in headless Chromium and checks it actually rendered — and
// stays rendered — rather than crashing before, or shortly after, React paints anything (ROADMAP
// 6.11 / ADR-0017's images). CI's `docker` job runs this against the non-demo web image and the
// web-demo image alike, right after each one is built and started as a container — this is the
// regression test for "an unset WalletConnect project id throws at startup and the real app
// boots to a blank page" (RainbowKit's `getWalletConnectConnector` throws synchronously, during
// config construction, if given a falsy `projectId` — see `web/src/lib/wagmi.ts`).
//
// A first coat of paint is not proof the page is healthy: a page can render fine and then throw
// and blank `#root` a few seconds later (e.g. a component that only notices a problem once some
// SDK finishes initializing). So after `#root` first renders, this script also waits for the
// network to go idle (or a timeout, whichever comes first) plus a further fixed wait, then
// checks `#root` again and re-examines every pageerror/console message collected since load —
// not just whatever had already happened at first paint.
//
// Neither image runs next to a live API in CI, and nothing here exercises an interactive flow
// (e.g. actually connecting a wallet), so a failed network request (a 404 fetch, an unreachable
// relay) is expected on its own and not itself a failure — deliberately not checked. This fails
// only on:
//   - any uncaught page error, at any point from load through the final settle check below;
//   - `#root` having no element children or no visible text, either at first paint or again
//     after the settle wait;
//   - a console message matching /projectId/i (RainbowKit's own "No projectId found" message,
//     the exact regression this guards), at any point.
//
// Usage: node e2e/scripts/web-boot-check.mjs <url> [--out <dir>]  (flags and the url may be
//                                                                  given in either order)
//   <url>        the running container's page, e.g. http://127.0.0.1:5181/
//   --out <dir>  where to save a screenshot if the check fails (default: cwd)
import { mkdirSync } from 'node:fs';
import path from 'node:path';

import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
let url;
let outDir = process.cwd();
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out') {
    outDir = args[++i];
  } else if (!args[i].startsWith('--')) {
    url = args[i];
  }
}

if (!url) {
  console.error('usage: node e2e/scripts/web-boot-check.mjs <url> [--out <dir>]');
  process.exit(2);
}

// e2e/demo/demo.config.ts and e2e/demo/capture-screenshots.mjs launch Chromium the same way: an
// explicit PLAYWRIGHT_CHROMIUM_PATH picks a pinned build, and leaving it unset falls back to
// Playwright's own managed browser.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
const PROJECT_ID_MESSAGE = /projectId/i;
const FIRST_PAINT_TIMEOUT_MS = 10_000;
const NETWORK_IDLE_TIMEOUT_MS = 8_000;
const SETTLE_WAIT_MS = 3_000;

// Runs inside the page (via waitForFunction/evaluate below), so it can only touch the DOM.
function isRootRendered() {
  const root = document.getElementById('root');
  return Boolean(root) && root.children.length > 0 && (root.innerText ?? '').trim().length > 0;
}

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

    const loaded = !problems.some((p) => p.startsWith('failed to load'));
    if (loaded) {
      let renderedAtFirstPaint = true;
      try {
        await page.waitForFunction(isRootRendered, undefined, {
          timeout: FIRST_PAINT_TIMEOUT_MS,
        });
      } catch {
        renderedAtFirstPaint = false;
        problems.push(
          `#root has no element children or no visible text ${FIRST_PAINT_TIMEOUT_MS / 1000}s after load`,
        );
      }

      // It painted once — now make sure it's still standing a few seconds later, and let any
      // pageerror/console listener above catch whatever happens while we wait.
      if (renderedAtFirstPaint) {
        await page
          .waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS })
          .catch(() => {});
        await page.waitForTimeout(SETTLE_WAIT_MS);
        const stillRendered = await page.evaluate(isRootRendered).catch(() => false);
        if (!stillRendered) {
          problems.push(
            `#root has no element children or no visible text ${SETTLE_WAIT_MS / 1000}s after settling`,
          );
        }
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
