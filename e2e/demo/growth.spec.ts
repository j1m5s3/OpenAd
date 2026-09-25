/** Publisher-growth demo flows (ROADMAP 6.3, step 14+15): the embed code panel, the versioned
 * embed script the static build ships, the "Advertise here" badge, and the slot page's Share
 * row. Separate from `flows.spec.ts` (which slice D extends) — see this suite's own header for
 * the shared guard/connect pattern this file mirrors. */
import { expect, test as base, type Page } from '@playwright/test';

import { demoPath } from './demo.config';

const ORIGIN = 'http://localhost:4173';
const PUBLISHER = 'Publisher — Basecamp Weekly (newsletter)';

const test = base.extend<{ guard: void }>({
  guard: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on('request', (r) => {
        const url = r.url();
        if (!url.startsWith(ORIGIN) && !url.startsWith('data:'))
          problems.push(`outside request: ${url}`);
      });
      page.on('websocket', (ws) => problems.push(`websocket: ${ws.url()}`));
      page.on('console', (m) => {
        if (m.type() === 'error') problems.push(`console error: ${m.text()}`);
        if (/DemoNetworkError/.test(m.text())) problems.push(`network guard: ${m.text()}`);
      });
      page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
      await use();
      expect(problems, 'demo must stay on its own origin with a clean console').toEqual([]);
    },
    { auto: true },
  ],
});

async function connectAsPublisher(page: Page): Promise<void> {
  await page.goto(demoPath('/'));
  await expect(page.getByRole('status').filter({ hasText: 'simulated data' })).toBeVisible();
  await page
    .getByRole('button', { name: /connect wallet/i })
    .first()
    .click();
  await page.getByText('OpenAd Demo Wallet').first().click();
  await expect(page.getByRole('button', { name: /connect wallet/i })).toHaveCount(0);
  await page.keyboard.press('Escape');
  // Wait for the default persona's own SIWE round trip to settle before switching — racing the
  // switch against it can leave a stale "account not found" error and no "Signed in" text.
  await expect(page.getByText('Signed in', { exact: true })).toBeVisible();
  await page.getByLabel('Viewing as').selectOption({ label: PUBLISHER });
  await expect(page.getByText('Signed in', { exact: true })).toBeVisible();
}

async function nav(page: Page, name: 'Discover' | 'Supply' | 'Campaigns'): Promise<void> {
  await page.getByRole('navigation').first().getByRole('link', { name, exact: true }).click();
}

test('publisher: embed code panel snippet references the versioned embed script', async ({
  page,
}) => {
  await connectAsPublisher(page);
  await nav(page, 'Supply');

  const panel = page.locator('section', { hasText: 'Embed code' });
  await expect(panel).toBeVisible();
  const snippet = panel.locator('pre').first();
  await expect(snippet).toContainText('embed/open-ad.v1.js');
  await expect(snippet).toContainText('slot-id=');

  // Clipboard write in a headless Chromium context needs an explicit grant.
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await panel.getByRole('button', { name: 'Copy' }).click();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toContain('embed/open-ad.v1.js');
  expect(clipboard).toContain('slot-id=');
});

test('the versioned embed script is served with a JS content type', async ({ page }) => {
  await connectAsPublisher(page);
  await nav(page, 'Supply');
  const snippet = page.locator('section', { hasText: 'Embed code' }).locator('pre').first();
  const src = (await snippet.textContent()) ?? '';
  const match = /src="([^"]+open-ad\.v1\.js)"/.exec(src);
  expect(match, 'snippet must contain a script src').not.toBeNull();
  const scriptUrl = new URL(match![1]!, page.url()).href;
  const res = await page.request.get(scriptUrl);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type'] ?? '').toMatch(/javascript/);
});

test('the "Advertise here" badge SVG loads', async ({ page }) => {
  await connectAsPublisher(page);
  await nav(page, 'Supply');
  const panel = page.locator('section', { hasText: 'Embed code' });
  await panel.getByRole('button', { name: 'Badge' }).click();
  const badgeSnippet = panel.locator('pre').first();
  const html = (await badgeSnippet.textContent()) ?? '';
  const match = /src="([^"]+advertise-here\.svg)"/.exec(html);
  expect(match, 'badge snippet must contain an img src').not.toBeNull();
  const badgeUrl = new URL(match![1]!, page.url()).href;
  const res = await page.request.get(badgeUrl);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type'] ?? '').toMatch(/svg/);
});

test('slot page shows the Share row with an absolute, copyable link', async ({ page }) => {
  await connectAsPublisher(page);
  await nav(page, 'Discover');
  await page.locator('a[href="#/slots/0"]').first().click();
  await expect(page.getByText('Slot #0')).toBeVisible();

  const share = page.locator('section', { hasText: 'Share this slot' });
  await expect(share).toBeVisible();
  const link = share.getByLabel('Slot page URL');
  await expect(link).toHaveValue(/^https?:\/\/.*\/slots\/0$/);
  await expect(share.getByRole('link', { name: 'Share on X' })).toHaveAttribute(
    'href',
    /twitter\.com\/intent\/tweet/,
  );
  await expect(share.getByRole('link', { name: 'Share on Farcaster' })).toHaveAttribute(
    'href',
    /warpcast\.com\/~\/compose/,
  );
});

test('publisher edits a slot listing, and advertisers can filter Discover by its category', async ({
  page,
}) => {
  await connectAsPublisher(page);
  await nav(page, 'Supply');

  const listing = page.locator('section', { hasText: 'Listing' }).first();
  await expect(listing).toBeVisible();
  await listing.getByLabel('Slot to describe').selectOption({ label: 'Slot #1' });
  // Wait for slot #1's fixture listing (web/src/demo/fixtures.ts) to hydrate before typing: the
  // controls stay disabled until then, and text typed earlier would be overwritten (L1).
  const summary = listing.getByPlaceholder('One-line pitch for advertisers');
  await expect(summary).toBeEnabled();
  await expect(summary).toHaveValue('Newsletter sidebar, high-intent readers.');
  await summary.fill('Sidebar reaching security-conscious devs');
  await listing
    .getByPlaceholder("Who reads this page, and what it's about")
    .fill('Security researchers and auditors reading our weekly digest.');
  await listing.getByRole('button', { name: 'Security' }).click();
  await listing.getByRole('button', { name: 'Save' }).click();
  await expect(listing.getByText('Listing saved')).toBeVisible();

  await nav(page, 'Discover');
  await page.getByRole('button', { name: 'Security' }).click();
  await expect(page.getByText('Sidebar reaching security-conscious devs')).toBeVisible();
});
