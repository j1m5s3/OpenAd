/**
 * Headed-MCP fallback: live DOM pass against the local stack (ADR-0013 injector).
 * Not CI. Run: node e2e/scripts/critique-pass.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '.tmp');
mkdirSync(root, { recursive: true });

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
const PUB3 = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';
const ADV6 = '0x976EA74026E726554dB657fA54763abd0C3a0aa9';

async function shot(page, name) {
  const path = join(root, `${name}.png`);
  await page.screenshot({ path, fullPage: true });
  return path;
}

async function waitConnected(page, ms = 5000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const visible = await page.getByRole('button', { name: /connect wallet/i }).isVisible().catch(() => false);
    if (!visible) return true;
    await page.waitForTimeout(250);
  }
  return false;
}

const notes = [];
const browser = await chromium.launch({ headless: true, channel: 'msedge' });

try {
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await desktop.newPage();
  page.on('pageerror', (err) => notes.push(`pageerror ${err.message}`));
  page.on('console', (msg) => {
    const t = msg.text();
    if (t.includes('devwallet') || msg.type() === 'error') notes.push(`console ${msg.type()} ${t}`);
  });

  await page.goto(`${BASE}/?devwallet=adv-6`, { waitUntil: 'networkidle' });
  notes.push(
    `discover eth=${JSON.stringify(await page.evaluate(() => ({ addr: window.ethereum?.selectedAddress, flag: window.ethereum?.isOpenAdDevWallet })))}`,
  );
  notes.push(`discover connected=${await waitConnected(page, 8000)}`);
  notes.push(`discover h1=${(await page.locator('h1').allTextContents()).join('|')}`);
  notes.push(`discover available now=${await page.getByRole('heading', { name: /available now/i }).count()}`);
  notes.push(`discover cpc filter=${await page.getByRole('button', { name: /^CPC$/ }).count()}`);
  notes.push(`discover body snippet=${(await page.locator('body').innerText()).slice(0, 900)}`);
  await shot(page, 'r2-discover-adv6');

  const href = await page.locator('a[href^="/slots/"]').first().getAttribute('href');
  if (href) {
    await page.goto(`${BASE}${href}${href.includes('?') ? '&' : '?'}devwallet=adv-6`, {
      waitUntil: 'networkidle',
    });
    await waitConnected(page, 8000);
    notes.push(`slot ${page.url()} text=${(await page.locator('body').innerText()).slice(0, 600)}`);
    await shot(page, 'r2-slot');
    const buy = page.getByRole('button', { name: /^Buy$/, exact: true }).first();
    if (await buy.isEnabled().catch(() => false)) {
      await buy.click();
      const dlg = page.getByRole('dialog');
      notes.push(`buy dialog=${(await dlg.innerText()).slice(0, 700)}`);
      await shot(page, 'r2-buy-dialog');
      await page.getByRole('button', { name: 'Close' }).click();
    } else {
      notes.push('buy disabled or missing');
    }
  }

  await page.goto(`${BASE}/campaigns?devwallet=adv-6`, { waitUntil: 'networkidle' });
  notes.push(`campaigns connected=${await waitConnected(page, 8000)}`);
  notes.push(`campaigns open=${await page.getByRole('button', { name: /open campaign/i }).count()}`);
  notes.push(`campaigns=${(await page.locator('body').innerText()).slice(0, 700)}`);
  await shot(page, 'r2-campaigns-adv6');

  await page.goto(`${BASE}/supply?devwallet=pub-3`, { waitUntil: 'networkidle' });
  notes.push(`supply connected=${await waitConnected(page, 8000)}`);
  notes.push(`supply eth expect ${PUB3} got ${await page.evaluate(() => window.ethereum?.selectedAddress)}`);
  notes.push(`supply=${(await page.locator('body').innerText()).slice(0, 900)}`);
  await shot(page, 'r2-supply-pub3');

  const mobile = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const mpage = await mobile.newPage();
  await mpage.goto(`${BASE}/?devwallet=adv-6`, { waitUntil: 'networkidle' });
  notes.push(`mobile search input=${await mpage.getByLabel('Search domain').count()}`);
  notes.push(`mobile wallet rail=${(await mpage.locator('aside').count())}`);
  await shot(mpage, 'r2-mobile-discover');
  await mobile.close();

  const embed = await fetch('http://localhost:5174/demo/').then((r) => r.status).catch((e) => String(e));
  notes.push(`embed demo status=${embed}`);

  await desktop.close();
} finally {
  await browser.close();
}

writeFileSync(join(root, 'r2-notes.txt'), notes.join('\n\n'), 'utf8');
console.log(notes.join('\n\n'));
console.log(`wrote ${root}`);
