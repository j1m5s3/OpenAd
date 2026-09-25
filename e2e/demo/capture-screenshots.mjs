// Generates the README / business-doc screenshots from the demo bundle (ROADMAP 6.7, step
// 30+31). This is a one-off capture script, not a Playwright test: it drives Playwright's
// library API directly against a fresh `npm run build:demo`, serving `web/dist-demo` under the
// same sub-path and no-SPA-fallback static server the demo Playwright suite uses
// (`demo.config.ts` / `static-server.mjs`), on a different port so it can run alongside that
// suite. Every screenshot is captured against the in-memory demo store only — no chain, no API,
// no outside request — with the demo clock frozen so the Dutch price shown is stable across runs.
//
// Usage: node e2e/demo/capture-screenshots.mjs
// (run after `npm run build:demo` — wired as `capture:screenshots` in `e2e/package.json`)
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const port = 4174; // distinct from demo.config.ts's 4173 so both can run concurrently
const mountPath = '/openad-demo/';
const outDir = path.join(repoRoot, 'docs/business/assets');
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
const VIEWPORT = { width: 1280, height: 800 };
const PUBLISHER_LABEL = 'Publisher — Basecamp Weekly (newsletter)';
// A fixed epoch (not `new Date()`) so re-runs of this script produce byte-for-byte identical
// "now"-derived state (the Dutch price, analytics windows, etc.) across machines and days.
const FROZEN_NOW = new Date('2026-06-01T00:00:00Z');

function demoUrl(route) {
  return `http://localhost:${port}${mountPath}#${route}`;
}

async function waitForServer(url, timeoutMs = 30_000) {
  const start = Date.now();
  for (;;) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      // Not listening yet.
    }
    if (Date.now() - start > timeoutMs) throw new Error(`static server did not start at ${url}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

async function connect(page) {
  await page.goto(demoUrl('/'));
  await page
    .getByRole('button', { name: /connect wallet/i })
    .first()
    .click();
  await page.getByText('OpenAd Demo Wallet').first().click();
  await page.keyboard.press('Escape');
  await page.getByText('Signed in', { exact: true }).waitFor();
}

async function shoot(page, name) {
  const dest = path.join(outDir, name);
  await page.screenshot({ path: dest, type: 'png' });
  console.log(`wrote ${path.relative(repoRoot, dest)}`);
}

async function main() {
  mkdirSync(outDir, { recursive: true });

  const server = spawn(
    process.execPath,
    ['e2e/demo/static-server.mjs', String(port), 'web/dist-demo', mountPath],
    { cwd: repoRoot, stdio: 'inherit' },
  );
  const closeServer = () => server.kill();
  process.on('exit', closeServer);

  try {
    await waitForServer(`http://localhost:${port}${mountPath}`);

    const browser = await chromium.launch(executablePath ? { executablePath } : {});
    try {
      const page = await browser.newPage({ viewport: VIEWPORT });
      // Freeze the demo clock at a constant epoch so the Dutch price (and every other
      // "now"-derived value) is not just stable but identical between runs, the same technique
      // `flows.spec.ts` uses (which freezes at the real "now" instead, since it only needs
      // internal consistency within one run).
      await page.clock.setFixedTime(FROZEN_NOW);

      // 1. Discover, connected as the default persona (advertiser).
      await connect(page);
      await shoot(page, 'discover.png');

      // 2. Slot page: the Dutch price falling.
      await page.locator('a[href="#/slots/0"]').first().click();
      await page.getByText('Slot #0').waitFor();
      await shoot(page, 'slot-dutch-price.png');

      // 3. Buy the first sellable period. The dialog re-quotes the (now sold) period the instant
      // it closes ("0.00 USDC / Not sellable"), so the confirmation moment itself is not a stable
      // screenshot subject; instead close the dialog and capture the slot table showing the
      // period as Leased, alongside the wallet balance that dropped by the quote.
      const buyButton = page.getByRole('button', { name: 'Buy', exact: true }).first();
      const periodIndex = (
        (await page.locator('tbody tr', { has: buyButton }).locator('td').first().textContent()) ??
        ''
      ).trim();
      // Rows list periods 0..n in order, so the row stays addressable by index after its button
      // changes from "Buy" to "Leased" (the same technique `flows.spec.ts`'s `buyFirstPeriod`
      // uses — a `has: buyButton` filter would stop matching once the button disappears).
      const row = page.locator('tbody tr').nth(Number(periodIndex));
      await buyButton.click();
      const dialog = page.getByRole('dialog');
      await dialog.locator('p.text-2xl').waitFor();
      await dialog.getByRole('button', { name: 'Next' }).click();
      await dialog.getByRole('button', { name: 'Next' }).click();
      await dialog.getByRole('button', { name: 'Buy with permit' }).click();
      await dialog.getByText('Confirmed on chain').waitFor();
      await dialog.getByRole('button', { name: 'Close' }).click();
      await row.getByRole('button', { name: 'Leased' }).waitFor();
      await shoot(page, 'buy-leased.png');

      // 4. Publisher performance panel (Supply, switched persona). Wait past the "Loading
      // performance…" placeholder for a real tile (eCPM) to render before capturing.
      await page.getByLabel('Viewing as').selectOption({ label: PUBLISHER_LABEL });
      await page.getByText('Signed in', { exact: true }).waitFor();
      await page
        .getByRole('navigation')
        .first()
        .getByRole('link', { name: 'Supply', exact: true })
        .click();
      await page.getByText('Loading performance…').waitFor({ state: 'detached' });
      await page.getByText('eCPM', { exact: true }).waitFor();
      await shoot(page, 'publisher-supply-performance.png');

      // 5. Embed demo: the real <open-ad> element rendering a creative.
      await page.goto(demoUrl('/embed-demo'));
      await page.getByRole('heading', { name: 'See the embed live' }).waitFor();
      await page.getByLabel('Slot').selectOption('0');
      await page.locator('open-ad[slot-id="0"] img').first().waitFor();
      await shoot(page, 'embed-demo.png');

      // 6. /why earnings calculator, filled in. An element screenshot of just the calculator
      // section (not the full, scrolled page) so the "OpenAd payout" result is actually visible.
      await page.goto(demoUrl('/why'));
      await page.getByLabel('Monthly impressions').fill('1000000');
      await page.getByLabel('eCPM (USD)').fill('5.00');
      await page.getByText('OpenAd payout').waitFor();
      const calculator = page.locator('section', { hasText: 'Earnings calculator' });
      await calculator.scrollIntoViewIfNeeded();
      await calculator.screenshot({ path: path.join(outDir, 'why-calculator.png'), type: 'png' });
      console.log(`wrote ${path.relative(repoRoot, path.join(outDir, 'why-calculator.png'))}`);
    } finally {
      await browser.close();
    }
  } finally {
    closeServer();
    process.off('exit', closeServer);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
