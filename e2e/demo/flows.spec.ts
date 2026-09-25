/** Demo-mode end-to-end flows (ADR-0016, ROADMAP 6.2 step 8+9, 12+13). Every test runs against
 * the static `dist-demo` bundle, served under a sub-path with **no SPA fallback**
 * (`demo.config.ts`), and asserts, after it finishes, that nothing left the server's origin: no
 * outside request, no WebSocket, no console error, no page error, no network-guard block, no
 * HTTP error (which would also catch a 404 from the no-fallback static server).
 *
 * Navigation after the first `goto` is always client-side (clicking links): a full reload
 * re-seeds the in-memory demo store and disconnects the demo wallet, by design. Every route is
 * reached through `demoPath`, which maps it to its hash-router URL under the mount path
 * (`demo.config.ts`); an in-page anchor's own `href` is just `#/path` (the hash router has no
 * `basename`, so it never carries the mount path). */
import { expect, test as base, type Page } from '@playwright/test';

import { demoPath } from './demo.config';

const ORIGIN = 'http://localhost:4173';
const USDC = 1_000_000n;
const FEE_BPS = 250n;

const ADVERTISER = 'Advertiser — Nimbus Wallet';
const PUBLISHER = 'Publisher — Basecamp Weekly (newsletter)';
const PUBLISHER_ADDRESS = '0xde00000000000000000000000000000000000001';

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
      page.on('response', (r) => {
        if (r.status() >= 400) problems.push(`HTTP ${r.status()}: ${r.url()}`);
      });
      page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
      // Freeze Date.now (timers keep running) so a Dutch price cannot decay between the quote
      // the dialog shows and the transaction — "USDC drops by exactly the quote" is exact.
      await page.clock.setFixedTime(new Date());
      await use();
      expect(problems, 'demo must stay on its own origin with a clean console').toEqual([]);
    },
    { auto: true },
  ],
});

/** Parses a `formatUsdc` string ("1,000.00 USDC", "4.9875 USDC") into base units. */
function usdc(text: string): bigint {
  const m = /([\d,]+)\.(\d+)/.exec(text);
  if (!m) throw new Error(`no USDC amount in "${text}"`);
  const whole = (m[1] ?? '0').replaceAll(',', '');
  const frac = (m[2] ?? '').padEnd(6, '0');
  return BigInt(whole) * USDC + BigInt(frac);
}

function publisherShare(price: bigint): bigint {
  return price - (price * FEE_BPS) / 10_000n;
}

async function connect(page: Page): Promise<void> {
  await page.goto(demoPath('/'));
  await expect(page.getByRole('status').filter({ hasText: 'simulated data' })).toBeVisible();
  await page
    .getByRole('button', { name: /connect wallet/i })
    .first()
    .click();
  await page.getByText('OpenAd Demo Wallet').first().click();
  await expect(page.getByRole('button', { name: /connect wallet/i })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(rail(page)).toContainText('USDC');
  await expectSignedIn(page);
}

/** The persona switcher shows "Signed in" once the demo SIWE round trip (fake `personal_sign` +
 * demo `authVerify`) has set the session for the selected persona. */
async function expectSignedIn(page: Page): Promise<void> {
  await expect(page.getByText('Signed in', { exact: true })).toBeVisible();
}

function rail(page: Page) {
  return page.locator('aside').filter({ hasText: 'Wallet' });
}

async function walletBalance(page: Page): Promise<bigint> {
  const text = (await rail(page).locator('p', { hasText: 'USDC' }).first().textContent()) ?? '';
  return usdc(text);
}

async function switchPersona(page: Page, label: string): Promise<void> {
  await page.getByLabel('Viewing as').selectOption({ label });
  await expectSignedIn(page);
}

async function nav(page: Page, name: 'Discover' | 'Supply' | 'Campaigns'): Promise<void> {
  await page.getByRole('navigation').first().getByRole('link', { name, exact: true }).click();
}

async function openSlot(page: Page, slotId: string): Promise<void> {
  await nav(page, 'Discover');
  await page.locator(`a[href="#/slots/${slotId}"]`).first().click();
  await expect(page.getByText(`Slot #${slotId}`)).toBeVisible();
}

/** Buys the first sellable period on the open slot page; returns the quoted price. */
async function buyFirstPeriod(page: Page): Promise<{ price: bigint; periodIndex: string }> {
  const buyButton = page.getByRole('button', { name: 'Buy', exact: true }).first();
  const periodIndex = (
    (await page.locator('tbody tr', { has: buyButton }).locator('td').first().textContent()) ?? ''
  ).trim();
  // Rows list periods 0..n in order, so the row stays addressable after its button changes.
  const row = page.locator('tbody tr').nth(Number(periodIndex));
  await buyButton.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('p.text-2xl')).toContainText('USDC');
  await dialog.getByRole('button', { name: 'Next' }).click();
  await dialog.getByRole('button', { name: 'Next' }).click();
  const price = usdc((await dialog.locator('p.text-2xl').textContent()) ?? '');
  expect(price).toBeGreaterThan(0n);
  await dialog.getByRole('button', { name: 'Buy with permit' }).click();
  await expect(dialog).toContainText('Confirmed on chain');
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(row.getByRole('button', { name: 'Leased' })).toBeVisible();
  return { price, periodIndex };
}

test('advertiser: discover → slot → buy a Dutch period with permit → lease on dashboard', async ({
  page,
}) => {
  await connect(page);
  // Discover filters.
  await page.getByRole('button', { name: 'CPC', exact: true }).click();
  await expect(page.locator('a[href="#/slots/1"]')).toBeVisible();
  await expect(page.locator('a[href="#/slots/0"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'paused', exact: true }).click();
  await expect(page.locator('a[href="#/slots/5"]')).toBeVisible();
  await page.getByRole('button', { name: 'all', exact: true }).click();
  await expect(page.locator('a[href^="#/slots/"]')).toHaveCount(6);

  await expect(rail(page)).toContainText('Leases 2');
  const before = await walletBalance(page);
  await openSlot(page, '0');
  const { price, periodIndex } = await buyFirstPeriod(page);
  await expect.poll(() => walletBalance(page)).toBe(before - price);
  await expect(rail(page)).toContainText('Leases 3');

  await nav(page, 'Campaigns');
  await expect(page.getByText(`Slot 0 period ${periodIndex}:`)).toBeVisible();
  await expect(page.getByText(/leases 3/)).toBeVisible();
});

test('advertiser CPC: register creative → request approval → open, top up and pause a campaign', async ({
  page,
}) => {
  await connect(page);
  await nav(page, 'Campaigns');

  // Register a media creative (hashed in the browser; the URI is a same-origin demo asset).
  await page.locator('input[type="file"]').setInputFiles({
    name: 'nimbus-300x250.png',
    mimeType: 'image/png',
    buffer: Buffer.from('openad demo creative'),
  });
  await expect(page.getByText(/keccak: 0x[0-9a-f]{64}/)).toBeVisible();
  await page.getByLabel('Public URI').fill('demo/creatives/nimbus-300x250.svg');
  await page.getByLabel('Click URL').fill('https://nimbuswallet.example/demo-landing');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await expect(page.getByText('Creative registered')).toBeVisible();
  await expect(page.getByText(/Creatives: 1, 3, 5, 6/)).toBeVisible();

  // Request approval from the newsletter publisher.
  await page.getByRole('button', { name: 'Request approval', exact: true }).click();
  await page.getByLabel('Publisher').fill(PUBLISHER_ADDRESS);
  await page.locator('select[name="creativeId"]').selectOption('6');
  await page.getByRole('button', { name: 'Request', exact: true }).click();
  await expect(page.getByText('Approval requested')).toBeVisible();

  // Open a CPC campaign on slot 1 (approval waived) with the new creative.
  await page.getByRole('button', { name: 'Open campaign' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('input').first().fill('1');
  await dialog.locator('select').selectOption('6');
  await dialog.getByRole('button', { name: 'Next' }).click();
  await dialog.getByRole('button', { name: 'Next' }).click();
  await dialog.getByRole('button', { name: 'Fund with permit' }).last().click();
  await expect(dialog).toContainText('Confirmed on chain');
  await dialog.getByRole('button', { name: 'Close' }).click();

  const campaign = page.locator('li', { hasText: 'Campaign 4 · slot 1 · creative 6' });
  await expect(campaign).toContainText('Open');
  await expect(campaign).toContainText('remaining 10.00 USDC of 10.00 USDC');

  await campaign.getByRole('button', { name: 'Top up' }).click();
  const topUp = page.getByRole('dialog');
  await topUp.getByRole('button', { name: 'Top up with permit' }).click();
  await expect(topUp).toContainText('Confirmed on chain');
  await topUp.getByRole('button', { name: 'Close' }).click();
  await expect(campaign).toContainText('remaining 15.00 USDC of 15.00 USDC');

  await campaign.getByRole('button', { name: 'Pause' }).click();
  await expect(campaign.getByRole('button', { name: 'Unpause' })).toBeVisible();
  await expect(campaign).toContainText('Paused');

  // A CPC slot has no period buy.
  await openSlot(page, '1');
  await expect(page.getByText('This slot is CPC')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Buy', exact: true })).toHaveCount(0);
});

test('publisher: SIWE → supply dashboard → mint, calendar, terms → approve → off-chain tools', async ({
  page,
}) => {
  await connect(page);
  await switchPersona(page, PUBLISHER);
  await expect(rail(page)).toContainText('Slots 2');
  await nav(page, 'Supply');
  await expect(page.getByText('Slots: 0, 1')).toBeVisible();
  // 97.5% of the two seeded leases (3 + 2 USDC) + the settled CPC batch (1.5 USDC - fee).
  await expect(page.locator('section', { hasText: 'Earnings' }).locator('p.text-2xl')).toHaveText(
    '6.3375 USDC',
  );

  // Pricing suggestion (SIWE-guarded API route).
  const pricing = page.locator('form', { hasText: 'Pricing suggestion' });
  await pricing.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByText(/Suggested start \d+ floor \d+/)).toBeVisible();

  // Mint → calendar → LEASE terms on the new slot.
  const wizard = page
    .locator('div', { has: page.getByRole('button', { name: 'Mint slot' }) })
    .last();
  await wizard.getByLabel('Domain').fill('pressroom.example');
  await wizard.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByText('Mint submitted')).toBeVisible();
  await expect(page.getByText('Slots: 0, 1, 6')).toBeVisible();

  await wizard.getByRole('button', { name: 'Calendar', exact: true }).click();
  await expect(wizard.getByLabel('Slot id')).toHaveValue('6');
  await wizard.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByText('Calendar submitted')).toBeVisible();

  await wizard.getByRole('button', { name: 'Terms', exact: true }).click();
  await expect(wizard.getByLabel('Slot id')).toHaveValue('6');
  await wizard.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByText('Terms submitted')).toBeVisible();

  // CPC terms with a new floor on the existing CPC slot 1.
  await wizard.getByLabel('Slot id').fill('1');
  await wizard.locator('select[name="saleMode"]').selectOption({ label: 'CPC' });
  await wizard.getByLabel('Floor CPC (USDC)').fill('0.05');
  await wizard.locator('select[name="approvalMode"]').selectOption({ label: 'Waived' });
  await wizard.getByRole('button', { name: 'Submit' }).click();

  // Approve the advertiser's pending creative.
  const pending = page.locator('li', { hasText: 'Creative 4 ·' });
  await expect(pending).toContainText('Requested');
  await pending.getByRole('button', { name: 'Approve creative' }).click();
  await expect(pending).toContainText('Approved');

  // House ad + domain verification (SIWE-guarded API routes).
  const house = page.locator('form', { hasText: 'House ad' });
  await house.getByLabel('Media URL').fill('/demo/creatives/nimbus-300x250.svg');
  await house.getByLabel('Click URL').fill('https://basecampweekly.example/advertise');
  await house.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByText('House ad saved')).toBeVisible();
  await page
    .locator('form', { hasText: 'Domain verification' })
    .getByRole('button', { name: 'Submit' })
    .click();
  await expect(page.getByText(/Verification token [0-9a-f]{32}/)).toBeVisible();
  await expect(page.getByText(/^Sign-in:/)).toHaveCount(0);

  // The new slot is on Discover and live; slot 1 shows the new CPC floor.
  await nav(page, 'Discover');
  const card = page.locator('a[href="#/slots/6"]');
  await expect(card).toContainText('pressroom.example');
  await expect(card).toContainText('live');
  await openSlot(page, '1');
  await expect(page.getByText(/floor 0\.05 USDC/)).toBeVisible();
});

test('switching persona keeps the in-memory store (lease → publisher earnings, pause → advertiser)', async ({
  page,
}) => {
  await connect(page);
  await openSlot(page, '0');
  const { price } = await buyFirstPeriod(page);

  await switchPersona(page, PUBLISHER);
  await nav(page, 'Supply');
  const seeded = 6_337_500n;
  const expected = seeded + publisherShare(price);
  await expect(page.locator('section', { hasText: 'Earnings' }).locator('p.text-2xl')).toHaveText(
    formatUsdc(expected),
  );

  const pause = page.locator('form', { hasText: 'Pause sales' });
  await pause.getByLabel('Slot id').fill('0');
  await pause.getByRole('checkbox').check();
  await pause.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByText('Pause submitted')).toBeVisible();

  await switchPersona(page, ADVERTISER);
  await expect(rail(page)).toContainText('Leases 3');
  await openSlot(page, '0');
  await expect(page.getByRole('button', { name: 'Buy', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'paused' }).first()).toBeVisible();
});

test('guided tour: Take the tour walks both personas through Discover → slot → Supply → Campaigns → embed → /why', async ({
  page,
}) => {
  await connect(page);
  await page.getByRole('button', { name: 'Take the tour' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Tour 1 of 6');
  await expect(dialog).toContainText('Discover, as the advertiser');
  await dialog.getByRole('button', { name: 'Next' }).click();

  await expect(page).toHaveURL(/\/slots\/0$/);
  await expect(dialog).toContainText('Tour 2 of 6');
  await dialog.getByRole('button', { name: 'Next' }).click();
  await expect(dialog).toContainText('Tour 3 of 6');
  await dialog.getByRole('button', { name: 'Back' }).click();
  await expect(dialog).toContainText('Tour 2 of 6');
  await dialog.getByRole('button', { name: 'Next' }).click();
  await dialog.getByRole('button', { name: 'Next' }).click();

  await expect(page).toHaveURL(/\/supply$/);
  await expect(dialog).toContainText('Tour 4 of 6');
  await expect(dialog).toContainText('Switch to the publisher');
  // The persona switch went through the demo wallet's setAccount, same as the manual switcher.
  await expectSignedIn(page);
  await expect(page.getByLabel('Viewing as')).toHaveValue(PUBLISHER_ADDRESS);
  await dialog.getByRole('button', { name: 'Next' }).click();

  await expect(page).toHaveURL(/\/campaigns$/);
  await expect(dialog).toContainText('Tour 5 of 6');
  await dialog.getByRole('button', { name: 'Next' }).click();

  await expect(page).toHaveURL(/\/embed-demo$/);
  await expect(dialog).toContainText('Tour 6 of 6');
  await dialog.getByRole('button', { name: 'Finish' }).click();

  await expect(page).toHaveURL(/\/why$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('embed-demo: the real <open-ad> element renders a demo creative with no outside request, and updates after a buy', async ({
  page,
}) => {
  await connect(page);
  // Client-side navigation only: /embed-demo is reached from /why, not the main nav, and a full
  // reload would re-seed the store and disconnect the demo wallet (see the file header).
  await page
    .getByRole('navigation')
    .first()
    .getByRole('link', { name: 'Why OpenAd', exact: true })
    .click();
  await page.getByRole('link', { name: 'See the embed live' }).click();
  await expect(page.getByRole('heading', { name: 'See the embed live' })).toBeVisible();

  const select = page.getByLabel('Slot');
  await select.selectOption('0');
  const embed = page.locator('open-ad[slot-id="0"]').first();
  await expect(embed).toBeVisible();
  const img = embed.locator('img');
  await expect
    .poll(async () => img.evaluate((el: HTMLImageElement) => el.getAttribute('src')))
    .toMatch(/^http:\/\/localhost:4173\/openad-demo\/demo\/creatives\//);

  // Slot 0's current period is already leased in the fixture; switch to a slot whose current
  // period is still open so a buy visibly changes what the embed serves.
  await select.selectOption('4');
  const embed4 = page.locator('open-ad[slot-id="4"]').first();
  const before = await embed4
    .locator('img')
    .evaluate((el: HTMLImageElement) => el.getAttribute('src'));

  await page.getByRole('link', { name: 'Buy the next period as the advertiser →' }).click();
  // Buy period 3 specifically: it is slot 4's *current* period (remainder phase, unsold in the
  // fixture), so buying it is what changes what the embed serves right now. Its dialog ends in a
  // "Buy remainder" button, not "Buy with permit" (`buyFirstPeriod` assumes the latter — a Dutch
  // buy — so this is inlined rather than reusing it).
  const period3Row = page
    .locator('tbody tr', { has: page.getByRole('cell', { name: '3', exact: true }) })
    .first();
  await period3Row.getByRole('button', { name: 'Buy', exact: true }).click();
  const buyDialog = page.getByRole('dialog');
  await expect(buyDialog.locator('p.text-2xl')).toContainText('USDC');
  await buyDialog.getByRole('button', { name: 'Next' }).click();
  // Slot 4 is 300×250; the advertiser's default creative (#1) is 728×90, so pick the matching one
  // (the dialog's "Creative" field has no <label htmlFor>, so select by its lone <select>).
  await buyDialog.locator('select').selectOption('3');
  await buyDialog.getByRole('button', { name: 'Next' }).click();
  await buyDialog.getByRole('button', { name: 'Buy remainder' }).click();
  await expect(buyDialog).toContainText('Confirmed on chain');
  await buyDialog.getByRole('button', { name: 'Close' }).click();
  await expect(period3Row.getByRole('button', { name: 'Leased' })).toBeVisible();
  await page.goBack();
  await select.selectOption('4');
  const after = page.locator('open-ad[slot-id="4"]').first().locator('img');
  await expect
    .poll(() => after.evaluate((el: HTMLImageElement) => el.getAttribute('src')))
    .not.toBe(before);
});

test('cold deep link: .../openad-demo/#/embed-demo loads with no server fallback, and the embed image resolves under the sub-path', async ({
  page,
}) => {
  // A fresh navigation straight to the hash route — no prior page load, so there is nothing for
  // the static server (which serves no SPA fallback) to redirect: it must serve index.html for
  // the mount path itself, and the hash router must then render /embed-demo client-side. This is
  // exactly what a static host with no rewrite rule (e.g. the hosted demo Artifact) does.
  await page.goto(demoPath('/embed-demo'));
  await expect(page.getByRole('heading', { name: 'See the embed live' })).toBeVisible();

  const select = page.getByLabel('Slot');
  await select.selectOption('0');
  const embed = page.locator('open-ad[slot-id="0"]').first();
  await expect(embed).toBeVisible();
  await expect
    .poll(async () =>
      embed.locator('img').evaluate((el: HTMLImageElement) => el.getAttribute('src')),
    )
    .toMatch(/^http:\/\/localhost:4173\/openad-demo\/demo\/creatives\//);
});

test('/why: the earnings calculator updates with integer USDC and shows the disclaimer', async ({
  page,
}) => {
  await page.goto(demoPath('/why'));
  await expect(page.getByRole('heading', { name: /Keep about 97.5%/ })).toBeVisible();
  await expect(
    page
      .getByText(/Illustrative\. Network take rates are approximate public ranges and vary\./)
      .first(),
  ).toBeVisible();

  const impressions = page.getByLabel('Monthly impressions');
  const ecpm = page.getByLabel('eCPM (USD)');
  await impressions.fill('1000000');
  await ecpm.fill('5.00');
  await expect(page.getByText('OpenAd payout')).toBeVisible();
  const openAdPayout = page.getByText('OpenAd payout').locator('xpath=following-sibling::p[1]');
  await expect(openAdPayout).toHaveText('4,875.00 USDC');
});

/** A `StatTile`'s value, found by its label text (PLAN 21+22). */
function statValue(page: Page, label: string) {
  return page
    .locator('p.text-xs.text-muted', { hasText: new RegExp(`^${label}$`) })
    .locator('xpath=following-sibling::p[1]');
}

test('performance: buying a period moves Campaigns spend and Supply earnings by exactly the quote', async ({
  page,
}) => {
  await connect(page); // default persona: advertiser (Nimbus Wallet)
  await nav(page, 'Campaigns');
  await expect(statValue(page, 'Spend')).not.toHaveText('');
  const spendBefore = usdc((await statValue(page, 'Spend').textContent()) ?? '');

  await switchPersona(page, PUBLISHER);
  await nav(page, 'Supply');
  await page.getByRole('combobox', { name: 'Slot' }).selectOption('0');
  await expect(statValue(page, 'Earnings')).not.toHaveText('');
  const earningsBefore = usdc((await statValue(page, 'Earnings').textContent()) ?? '');

  await switchPersona(page, ADVERTISER);
  await openSlot(page, '0');
  const { price } = await buyFirstPeriod(page);

  // The only buyable period right now is the live Dutch auction, which starts *after* "now" —
  // analytics attribute LEASE spend to the day of the period's start (PLAN D4), not the buy tx,
  // so it will not appear in a window ending "now" until that day arrives. Advance the frozen
  // clock past it so the assertion below observes the real, documented behaviour rather than an
  // artifact of buying a not-yet-started period.
  const nowMs = await page.evaluate(() => Date.now());
  await page.clock.setFixedTime(new Date(nowMs + 2 * 24 * 60 * 60 * 1000));

  await nav(page, 'Campaigns');
  await expect
    .poll(async () => usdc((await statValue(page, 'Spend').textContent()) ?? ''))
    .toBe(spendBefore + price);

  await switchPersona(page, PUBLISHER);
  await nav(page, 'Supply');
  await page.getByRole('combobox', { name: 'Slot' }).selectOption('0');
  await expect
    .poll(async () => usdc((await statValue(page, 'Earnings').textContent()) ?? ''))
    .toBe(earningsBefore + publisherShare(price));
  // Settled and accrued CPC are never summed: the tile is shown, separately labelled.
  await expect(page.getByText('unsettled — not yet earnings')).toBeVisible();
});

/** Same output as `web/src/lib/format.ts` `formatUsdc` (kept local: e2e does not import web). */
function formatUsdc(baseUnits: bigint): string {
  const whole = baseUnits / USDC;
  const frac = (baseUnits % USDC).toString().padStart(6, '0').replace(/0+$/, '');
  const cents = frac.length === 0 ? '00' : frac.length === 1 ? `${frac}0` : frac;
  return `${whole.toLocaleString('en-US')}.${cents} USDC`;
}
