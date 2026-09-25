import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, api, setRequestHandler } from '../lib/api';
import { setDemoNow } from './clock';
import { createDemoRequestHandler } from './demoApi';
import { DEMO_PERSONAS } from './fixtures';
import { demoStore } from './store';

const NOW = 1_800_000_000; // fixed instant so fixture-derived assertions are stable

beforeEach(() => {
  setDemoNow(NOW);
  demoStore.reset(NOW);
  setRequestHandler(createDemoRequestHandler(demoStore));
});

afterEach(() => {
  setDemoNow();
  setRequestHandler();
  vi.restoreAllMocks();
});

describe('createDemoRequestHandler', () => {
  it('never calls fetch', async () => {
    const fetchSpy = vi.spyOn(window, 'fetch');
    await api.health();
    await api.listSlots();
    await api.getSlot('0');
    await api.listPeriods('0');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('resolves every api.* method with a typed, non-empty result, and never calls fetch', async () => {
    // Spied here too (not only in the dedicated "never calls fetch" test above) so a method
    // added below without a matching demo route can't silently fall through to a real fetch.
    const fetchSpy = vi.spyOn(window, 'fetch');
    const health = await api.health();
    expect(health.status).toBe('ok');

    const slotList = await api.listSlots();
    expect(slotList.items.length).toBeGreaterThan(0);
    expect(slotList.total).toBe(slotList.items.length);

    const slot = await api.getSlot('0');
    expect(slot.slotId).toBe('0');

    const periods = await api.listPeriods('0', 0, 5);
    expect(periods.items.length).toBe(6);

    const creative = await api.getCreative('1');
    expect(creative.creativeId).toBe('1');

    const publisher = await api.publisher(DEMO_PERSONAS.publisherNewsletter.address);
    expect(publisher.slotIds.length).toBeGreaterThan(0);

    const approvals = await api.publisherApprovals(DEMO_PERSONAS.publisherNewsletter.address);
    expect(approvals.length).toBeGreaterThan(0);

    const advertiser = await api.advertiser(DEMO_PERSONAS.advertiserWallet.address);
    expect(advertiser.creativeIds.length).toBeGreaterThan(0);

    const slotAnalytics = await api.slotAnalytics('0');
    expect(slotAnalytics.slotId).toBe('0');

    const advertiserAnalytics = await api.advertiserAnalytics(
      DEMO_PERSONAS.advertiserWallet.address,
    );
    expect(advertiserAnalytics.address).toBe(DEMO_PERSONAS.advertiserWallet.address.toLowerCase());

    const nonce = await api.authNonce();
    expect(nonce.nonce.length).toBeGreaterThan(0);

    const newsletter = DEMO_PERSONAS.publisherNewsletter.address;
    const verified = await api.authVerify(`sign in as ${newsletter}`, '0xdeadbeef');
    expect(verified.address).toBe(newsletter.toLowerCase());

    const suggestion = await api.pricingSuggestion(newsletter, '0');
    expect(suggestion.suggestedStartPrice).toMatch(/^\d+$/);

    const houseAd = await api.putHouseAd('0', {
      mediaUrl: '/demo/creatives/nimbus-728x90.svg',
      clickUrl: 'https://nimbuswallet.example',
    });
    expect(houseAd.mediaUrl).toBe('/demo/creatives/nimbus-728x90.svg');

    const verification = await api.startDomainVerification('0', 'meta_tag');
    expect(verification.verified).toBe(false);
    expect(String(verification.token)).toMatch(/^[0-9a-f]{32}$/);

    const loggedOut = await api.authLogout();
    expect(loggedOut.ok).toBe(true);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('filters listSlots by domain and kind', async () => {
    const byDomain = await api.listSlots({ domain: 'basecampweekly.example' });
    expect(byDomain.items.every((s) => s.domain === 'basecampweekly.example')).toBe(true);
    expect(byDomain.items.length).toBeGreaterThan(0);

    const byKind = await api.listSlots({ kind: 1 });
    expect(byKind.items.every((s) => s.kind === 1)).toBe(true);
    expect(byKind.items.length).toBeGreaterThan(0);
  });

  it('rejects an unknown path with a 404 ApiError', async () => {
    const handler = createDemoRequestHandler(demoStore);
    await expect(handler('/v1/not-a-real-route')).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
      code: 'demo_not_found',
    });
    await expect(handler('/v1/not-a-real-route')).rejects.toBeInstanceOf(ApiError);
  });

  it('404s a missing slot or creative', async () => {
    await expect(api.getSlot('999')).rejects.toMatchObject({ status: 404 });
    await expect(api.getCreative('999')).rejects.toMatchObject({ status: 404 });
  });

  it('returns clones: mutating one response never changes the next', async () => {
    const first = await api.getSlot('0');
    first.domain = 'tampered.example';
    const second = await api.getSlot('0');
    expect(second.domain).not.toBe('tampered.example');
  });

  it('authVerify returns the lowercase session address, like the real API (useSiwe compares lowercase)', async () => {
    const addr = DEMO_PERSONAS.advertiserWallet.address;
    const rec = await api.authVerify(
      `localhost wants you to sign in:\n${addr}\nNonce: demo-1`,
      '0x',
    );
    expect(rec.address).toBe(addr.toLowerCase());
    expect(demoStore.get().connectedAddress).toBe(addr.toLowerCase());
  });

  it('off-chain publisher routes require a SIWE session that owns the slot', async () => {
    const body = { mediaUrl: '/demo/creatives/nimbus-300x250.svg', clickUrl: 'https://x.example' };
    const newsletter = DEMO_PERSONAS.publisherNewsletter.address;
    await expect(api.putHouseAd('1', body)).rejects.toMatchObject({ status: 401 });
    await expect(api.startDomainVerification('1')).rejects.toMatchObject({ status: 401 });
    await expect(api.pricingSuggestion(newsletter, '1')).rejects.toMatchObject({ status: 401 });

    // Signed in as an advertiser: not the slot owner.
    await api.authVerify(`as ${DEMO_PERSONAS.advertiserWallet.address}`, '0x');
    await expect(api.putHouseAd('1', body)).rejects.toMatchObject({ status: 403 });
    await expect(api.pricingSuggestion(newsletter, '1')).rejects.toMatchObject({ status: 403 });

    // Signed in as the owner: allowed; another publisher's slot is still forbidden.
    await api.authVerify(`as ${newsletter}`, '0x');
    await expect(api.putHouseAd('1', body)).resolves.toMatchObject({ slotId: '1' });
    expect(demoStore.get().houseAds['1']?.mediaUrl).toBe(body.mediaUrl);
    await expect(api.startDomainVerification('2')).rejects.toMatchObject({ status: 403 });
    await expect(api.startDomainVerification('99')).rejects.toMatchObject({ status: 404 });
  });
});
