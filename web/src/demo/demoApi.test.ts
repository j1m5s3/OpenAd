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

    const suggestion = await api.pricingSuggestion(DEMO_PERSONAS.publisherNewsletter.address, '0');
    expect(suggestion.suggestedStartPrice).toMatch(/^\d+$/);

    const nonce = await api.authNonce();
    expect(nonce.nonce.length).toBeGreaterThan(0);

    const verified = await api.authVerify(
      `sign in as ${DEMO_PERSONAS.advertiserWallet.address}`,
      '0xdeadbeef',
    );
    expect(verified.address).toBe(DEMO_PERSONAS.advertiserWallet.address);

    const loggedOut = await api.authLogout();
    expect(loggedOut.ok).toBe(true);

    const houseAd = await api.putHouseAd('0', {
      mediaUrl: '/demo/creatives/nimbus-728x90.svg',
      clickUrl: 'https://nimbuswallet.example',
    });
    expect(houseAd.mediaUrl).toBe('/demo/creatives/nimbus-728x90.svg');

    const verification = await api.startDomainVerification('0', 'meta_tag');
    expect(verification.verified).toBe(true);

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
});
