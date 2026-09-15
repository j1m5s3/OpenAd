/**
 * ADR-0013 smoke: SIWE as pub-3, then mint/waive terms, then adv-6 register + buy_with_permit.
 * Not CI. Run: node e2e/scripts/smoke-devwallet.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '.tmp');
mkdirSync(root, { recursive: true });

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
const API = process.env.E2E_API_URL ?? 'http://127.0.0.1:8000';
const RPC = process.env.E2E_RPC_URL ?? 'http://127.0.0.1:8545';
const PUB3 = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';
const ADV6 = '0x976EA74026E726554dB657fA54763abd0C3a0aa9';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const pngPath = join(root, 'smoke.png');
writeFileSync(pngPath, PNG);

const notes = [];
const domain = `smoke-${Date.now()}.example`;

async function shot(page, name) {
  const path = join(root, `${name}.png`);
  await page.screenshot({ path, fullPage: true });
  return path;
}

function fail(msg) {
  notes.push(`FAIL ${msg}`);
  writeFileSync(join(root, 'smoke-notes.txt'), notes.join('\n\n'), 'utf8');
  console.error(notes.join('\n\n'));
  throw new Error(msg);
}

async function rpc(method, params = []) {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? `${method} failed`);
  return json.result;
}

async function chainSupply() {
  const hex = await rpc('eth_call', [
    { to: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9', data: '0x18160ddd' },
    'latest',
  ]);
  return Number.parseInt(hex, 16);
}

async function mine(blocks = 4) {
  for (let i = 0; i < blocks; i += 1) {
    await rpc('evm_mine', []);
  }
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function pollJson(url, ok, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await (await fetch(url)).json();
    if (ok(last)) return last;
    await sleep(800);
  }
  return last;
}

function toDatetimeLocal(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function openSeat(browser, path, persona, expectAddr) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const auth = { nonce: false, verify: false, verifyStatus: 0, verifyBody: '' };
  page.on('pageerror', (err) => notes.push(`pageerror ${persona} ${err.message}`));
  page.on('response', async (res) => {
    const url = res.url();
    if (url.includes('/v1/auth/nonce') && res.ok()) auth.nonce = true;
    if (url.includes('/v1/auth/verify')) {
      auth.verifyStatus = res.status();
      auth.verify = auth.verify || res.ok();
      try {
        auth.verifyBody = await res.text();
      } catch {
        auth.verifyBody = '';
      }
    }
  });
  page.on('console', (msg) => {
    const t = msg.text();
    if (t.includes('devwallet') || msg.type() === 'error') {
      notes.push(`console ${persona} ${msg.type()} ${t}`);
    }
  });
  await page.goto(`${BASE}${path}${path.includes('?') ? '&' : '?'}devwallet=${persona}`, {
    waitUntil: 'networkidle',
  });
  const deadline = Date.now() + 15_000;
  let rail = '';
  let connected = false;
  while (Date.now() < deadline) {
    const connectVisible = await page
      .getByRole('button', { name: /connect wallet/i })
      .isVisible()
      .catch(() => false);
    rail = await page.locator('aside').innerText().catch(() => '');
    connected = !connectVisible && rail.toLowerCase().includes(expectAddr.slice(2, 6).toLowerCase());
    if (connected) break;
    await page.waitForTimeout(250);
  }
  notes.push(
    `${persona} eth=${JSON.stringify(await page.evaluate(() => ({ addr: window.ethereum?.selectedAddress, flag: window.ethereum?.isOpenAdDevWallet })))}`,
  );
  notes.push(`${persona} connected=${connected} rail=${rail.slice(0, 240)}`);
  await page.waitForTimeout(1200);
  notes.push(
    `${persona} siwe nonce=${auth.nonce} verify=${auth.verify} status=${auth.verifyStatus} body=${auth.verifyBody}`,
  );
  return { ctx, page, auth, connected, rail };
}

const browser = await chromium.launch({ headless: true, channel: 'msedge' });

try {
  const pub = await openSeat(browser, '/supply', 'pub-3', PUB3);
  await shot(pub.page, 'smoke-supply-pub3');
  if (!pub.connected) fail('pub-3 did not auto-connect as pub-3');
  if (await pub.page.locator('text=Sign-in:').count()) fail('pub-3 SIWE error banner visible');
  if (!pub.auth.verify) fail(`pub-3 SIWE verify did not succeed (status ${pub.auth.verifyStatus})`);

  const mintForm = pub.page.locator('form').filter({ has: pub.page.locator('input[name=domain]') });
  let slot = null;
  for (let attempt = 0; attempt < 6 && !slot; attempt += 1) {
    const attemptDomain = `smoke-${Date.now()}-${attempt}.example`;
    const before = await chainSupply();
    await mintForm.locator('input[name=domain]').fill(attemptDomain);
    await mintForm.getByRole('button', { name: 'Submit' }).click();
    const minedDeadline = Date.now() + 20_000;
    while (Date.now() < minedDeadline && (await chainSupply()) <= before) {
      await sleep(250);
    }
    await mine();
    const listed = await pollJson(
      `${API}/v1/slots?limit=200`,
      (j) => (j.items ?? []).some((s) => s.domain === attemptDomain),
      12_000,
    );
    slot = (listed?.items ?? []).find((s) => s.domain === attemptDomain) ?? null;
    notes.push(`mint attempt ${attempt} domain=${attemptDomain} supply=${await chainSupply()} indexed=${Boolean(slot)}`);
  }
  notes.push(`minted ${JSON.stringify(slot)}`);
  if (!slot) fail('minted slot not indexed (stale Postgres slot ids 3–7 need a fresh id)');
  const slotId = slot.slotId;
  const domainUsed = slot.domain;

  const firstStart = toDatetimeLocal(new Date(Date.now() + 20 * 60 * 1000));
  await pub.page.getByRole('button', { name: 'Calendar', exact: true }).click();
  const calForm = pub.page.locator('form').filter({ has: pub.page.locator('input[name=periodSeconds]') });
  await calForm.locator('input[name=slotId]').fill(slotId);
  await calForm.locator('input[name=periodSeconds]').fill('86400');
  await calForm.locator('input[name=firstStart]').fill(firstStart);
  await calForm.getByRole('button', { name: 'Submit' }).click();
  await pub.page.getByText('Calendar submitted').waitFor({ timeout: 30_000 });

  await pub.page.getByRole('button', { name: 'Terms', exact: true }).click();
  const termsForm = pub.page.locator('form').filter({ has: pub.page.locator('select[name=saleMode]') });
  await termsForm.locator('input[name=slotId]').fill(slotId);
  await termsForm.locator('select[name=approvalMode]').selectOption('1');
  await termsForm.getByRole('button', { name: 'Submit' }).click();
  await pub.page.getByText('Terms submitted').waitFor({ timeout: 30_000 });
  await mine();
  const periods = await pollJson(
    `${API}/v1/slots/${slotId}/periods`,
    (j) => (j.items ?? []).some((p) => p.sellable),
  );
  const sellable = (periods?.items ?? []).find((p) => p.sellable);
  notes.push(`sellable ${JSON.stringify(sellable)}`);
  if (!sellable) fail('new slot has no sellable period after terms');
  await pub.ctx.close();

  const adv = await openSeat(browser, '/campaigns', 'adv-6', ADV6);
  await shot(adv.page, 'smoke-campaigns-adv6');
  if (!adv.connected) fail('adv-6 did not auto-connect as adv-6');
  if (!adv.auth.verify) fail(`adv-6 SIWE verify did not succeed (status ${adv.auth.verifyStatus})`);

  await adv.page.locator('input[type=file]').setInputFiles(pngPath);
  await adv.page.getByText(/keccak: 0x/).waitFor({ timeout: 10_000 });
  await adv.page.locator('input[name=uri]').fill('https://openad.example/smoke.png');
  await adv.page.locator('input[name=clickUrl]').first().fill('https://openad.example');
  await adv.page.getByRole('button', { name: 'Register', exact: true }).click();
  await adv.page.getByText('Creative registered').waitFor({ timeout: 30_000 });
  await mine();
  const dash = await pollJson(
    `${API}/v1/advertisers/${ADV6}`,
    (j) => Array.isArray(j.creativeIds) && j.creativeIds.length > 0,
  );
  notes.push(`adv-6 creatives=${JSON.stringify(dash?.creativeIds)}`);
  if (!dash?.creativeIds?.length) fail('adv-6 creative not indexed');

  await adv.page.goto(`${BASE}/slots/${slotId}?devwallet=adv-6`, { waitUntil: 'networkidle' });
  await shot(adv.page, 'smoke-slot-adv6');
  const buyBtn = adv.page.getByRole('button', { name: /^Buy$/, exact: true }).first();
  await buyBtn.waitFor({ timeout: 15_000 });
  if (!(await buyBtn.isEnabled())) {
    notes.push(`slot body=${(await adv.page.locator('body').innerText()).slice(0, 800)}`);
    fail('Buy button not enabled on waived smoke slot');
  }
  await buyBtn.click();
  const dlg = adv.page.getByRole('dialog');
  await dlg.waitFor({ state: 'visible' });
  await dlg.getByRole('button', { name: 'Next' }).click();
  await dlg.getByRole('button', { name: 'Next' }).click();
  await adv.page.waitForTimeout(2000);
  notes.push(`buy dialog=${(await dlg.innerText()).slice(0, 900)}`);
  await shot(adv.page, 'smoke-buy-dialog');
  const cta = dlg.getByRole('button', { name: /buy with permit|buy remainder/i });
  const ctaDeadline = Date.now() + 15_000;
  let ctaEnabled = false;
  while (Date.now() < ctaDeadline) {
    ctaEnabled = await cta.isEnabled().catch(() => false);
    if (ctaEnabled) break;
    await sleep(250);
  }
  if (!ctaEnabled) fail('buy CTA disabled in dialog');
  await cta.click();
  const confirmed = await adv.page
    .locator('text=Confirmed on chain')
    .waitFor({ timeout: 45_000 })
    .then(() => true)
    .catch(() => false);
  notes.push(`buy confirmed=${confirmed} status=${await dlg.innerText()}`);
  await shot(adv.page, 'smoke-buy-result');
  if (!confirmed) fail('buy_with_permit did not confirm');
  await mine();

  const leased = await pollJson(`${API}/v1/slots/${slotId}/periods`, (j) =>
    (j.items ?? []).some((p) => p.leased),
  );
  const row = (leased?.items ?? []).find((p) => p.leased);
  notes.push(`indexed lease ${JSON.stringify(row)}`);
  if (!row) fail('indexer did not show lease after buy');
  await adv.ctx.close();

  notes.push('SMOKE OK');
  writeFileSync(join(root, 'smoke-notes.txt'), notes.join('\n\n'), 'utf8');
  console.log(notes.join('\n\n'));
} finally {
  await browser.close();
}
