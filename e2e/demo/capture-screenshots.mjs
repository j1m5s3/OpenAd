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

async function shoot(page, name, options = {}) {
  const dest = path.join(outDir, name);
  await page.screenshot({ path: dest, type: 'png', ...options });
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

      // 1b. Discover, filtered to a category with listing badges visible (ROADMAP 6.3 step 16).
      // Slots 0 and 1 are both tagged "defi" in the fixtures, so the filtered grid still shows
      // slot 0 (used by the next step) without navigating away first. Slot 0's own summary is
      // already on screen before the click (it matches every filter), so waiting on it alone
      // raced the demo API's fixed 120ms fetch delay (demoApi.ts's `demoDelay`) and made this
      // screenshot non-deterministic; wait for a non-matching slot's summary (slot 2, tagged
      // "developer-tools"/"infrastructure", never "defi") to leave the DOM instead, which is
      // only true once the filtered result has actually rendered.
      await page.getByRole('button', { name: 'DeFi', exact: true }).click();
      await page.getByText('Dev-tool docs rail, high dwell time.').waitFor({ state: 'detached' });
      await page.getByText('Weekly crypto market recap, 40k opens.').waitFor();
      // Full-page, not viewport-only: the heading, description and three filter rows above the
      // grid push both matching cards (and their listing-summary/category-badge lines) below the
      // 800px fold at this viewport width, and cropping any of those rows out would misrepresent
      // the real page. The "DeFi" filter narrows to exactly 2 of the fixture's slots, so the full
      // page is still short — one card row, not a long scroll.
      await shoot(page, 'discover-categories.png', { fullPage: true });

      // 2. Slot page: the Dutch price falling. The "About this audience" listing and "Share
      // this slot" sections above the table (ROADMAP 6.3) push every period row below the fold
      // at this viewport height, on a fresh page load, before any click — scroll the first
      // buyable row into view before shooting. This is the same position Playwright's own
      // auto-scroll-before-click puts it at anyway, so reusing it for the click in step 3 below
      // is safe (and avoids scrolling twice to the same place).
      await page.locator('a[href="#/slots/0"]').first().click();
      await page.getByText('Slot #0').waitFor();
      const buyButton = page.getByRole('button', { name: 'Buy', exact: true }).first();
      await buyButton.scrollIntoViewIfNeeded();
      await shoot(page, 'slot-dutch-price.png');

      // 3. Buy the first sellable period. Capture the confirmation moment itself (3a, below) —
      // step 35's frozen `Snapshot` keeps it stable — then close the dialog and capture the slot
      // table showing the period as Leased, alongside the wallet balance that dropped by the
      // quote. (The dialog re-quotes the period the instant it closes, to "0.00 USDC / Not
      // sellable", so that specific instant right after close is not itself a stable subject;
      // waiting for the row's own button to read "Leased" is what makes buy-leased.png
      // reproducible.)
      const periodIndex = (
        (await page.locator('tbody tr', { has: buyButton }).locator('td').first().textContent()) ??
        ''
      ).trim();
      // Found by its period-index cell, not row position (ROADMAP 6.7): the slot page's periods
      // window can start at the slot's current period instead of always 0, so DOM order and
      // period index can diverge — the same technique `flows.spec.ts`'s `buyFirstPeriod` uses (a
      // `has: buyButton` filter alone would stop matching once the button becomes "Leased").
      const row = page
        .locator('tbody tr', { has: page.getByRole('cell', { name: periodIndex, exact: true }) })
        .first();
      await buyButton.click();
      const dialog = page.getByRole('dialog');
      await dialog.locator('p.text-2xl').waitFor();
      await dialog.getByRole('button', { name: 'Next' }).click();
      await dialog.getByRole('button', { name: 'Next' }).click();
      // WalletRail's balance is a separate `useReadContract` from the dialog's own frozen
      // Snapshot, refetched only after the write settles — so it can still show the pre-buy
      // amount for a tick after the dialog itself already reads "Lease confirmed". Recorded here,
      // before the click, so the wait below can detect the change (a fresh read after the click
      // would race the update it's trying to observe).
      const walletBalance = page.locator('aside p.text-sm').first();
      const balanceBeforeBuy = (await walletBalance.textContent())?.trim();
      await dialog.getByRole('button', { name: 'Buy with permit' }).click();
      await dialog.getByText('Lease confirmed').waitFor();
      // Wait for the header wallet balance to actually settle too, not just the dialog: without
      // this, buy-receipt.png was non-deterministic (about 1 run in 3 still showed the pre-buy
      // balance behind the dialog).
      await page.waitForFunction(
        ({ selector, before }) => {
          const el = document.querySelector(selector);
          return el != null && el.textContent?.trim() !== before;
        },
        { selector: 'aside p.text-sm', before: balanceBeforeBuy },
      );
      // 3a. The receipt itself (price paid, fee split, tx hash, "View slot"), before it closes —
      // step 35's frozen `Snapshot` keeps this stable even though closing re-quotes the period.
      // (The dialog is a fixed-position overlay, so the page's own scroll position underneath —
      // wherever step 2 left it — doesn't affect this shot.)
      await shoot(page, 'buy-receipt.png');
      await dialog.getByRole('button', { name: 'Close' }).click();
      await row.getByRole('button', { name: 'Leased' }).waitFor();
      // Scroll back to the top first: the scroll position from step 2's "scroll the Buy row into
      // view" is still in effect here (closing the dialog doesn't reset it, and this is a
      // client-side SPA — there's no page reload to reset it either). Shoot full-page, not just
      // the viewport: the listing/share sections above the table push the Leased row below the
      // 800px fold, so only a full-page capture actually shows the Leased row alongside the
      // wallet balance, as the name promises.
      await page.evaluate(() => window.scrollTo(0, 0));
      await shoot(page, 'buy-leased.png', { fullPage: true });

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
      // Scroll back to the top: the scroll position step 2 left behind (see above) is still in
      // effect on this new route too — a client-side nav, not a page reload — and would hide
      // the stat tiles under the sticky header otherwise.
      await page.evaluate(() => window.scrollTo(0, 0));
      await shoot(page, 'publisher-supply-performance.png');

      // 5. Embed demo: the real <open-ad> element rendering a creative.
      await page.goto(demoUrl('/embed-demo'));
      await page.getByRole('heading', { name: 'See the embed live' }).waitFor();
      await page.getByLabel('Slot').selectOption('0');
      await page.locator('open-ad[slot-id="0"] img').first().waitFor();
      // The above only waits for the <img> to attach and become visible, not for its pixels to
      // be ready: `open-ad.ts` sets `loading = 'lazy'` and `decoding = 'async'`, so the element
      // can be on-screen before the image is actually decoded and painted, which made
      // embed-demo.png occasionally capture that not-yet-painted frame. Wait for the real image
      // to finish loading (`shadowRoot` because the <img> lives in the element's open shadow
      // root, which a plain `document.querySelector` does not pierce).
      await page.waitForFunction(() => {
        const host = document.querySelector('open-ad[slot-id="0"]');
        const img = host?.shadowRoot?.querySelector('img');
        return Boolean(img && img.complete && img.naturalWidth > 0);
      });
      // `page.goto` to a new hash route doesn't reload the document (same SPA) and doesn't reset
      // scroll either, so the same leftover offset would otherwise cut off the heading and the
      // leaderboard creative here too.
      await page.evaluate(() => window.scrollTo(0, 0));
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
