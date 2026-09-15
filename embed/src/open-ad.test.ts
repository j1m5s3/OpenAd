import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { define } from './index';
import type { OpenAdElement } from './open-ad';
import type { ServeResponse } from './types';

const LEASE: ServeResponse = {
  slotId: '1',
  status: 'lease',
  creative: {
    kind: 'image',
    mediaUrl: 'http://api.test/v1/serve/1/media?v=0xabc',
    clickUrl: 'https://advertiser.example/landing',
    width: 300,
    height: 250,
    alt: 'Sponsored',
  },
  lease: { advertiser: '0x' + 'bb'.repeat(20), expiresAt: '2026-09-15T00:00:00Z' },
  campaign: null,
  ttl: 30,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function mount(attrs: Record<string, string>): OpenAdElement {
  const el = document.createElement('open-ad') as OpenAdElement;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.append(el);
  return el;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeAll(() => define());
afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('<open-ad>', () => {
  it('renders a lease creative from the serve endpoint and links with sponsored rel', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(LEASE));
    const events: string[] = [];
    document.body.addEventListener('openad:render', (e) =>
      events.push((e as CustomEvent<{ status: string }>).detail.status),
    );

    const el = mount({ 'slot-id': '1', api: 'http://api.test/', width: '300', height: '250' });
    await flush();
    await flush();

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/v1/serve/1',
      expect.objectContaining({ credentials: 'omit', mode: 'cors' }),
    );
    const a = el.shadowRoot!.querySelector('a')!;
    const img = el.shadowRoot!.querySelector('img')!;
    expect(img.getAttribute('src')).toBe(LEASE.creative!.mediaUrl);
    expect(a.getAttribute('href')).toBe(LEASE.creative!.clickUrl);
    expect(a.rel).toContain('sponsored');
    expect(a.target).toBe('_blank');
    expect(el.style.width).toBe('300px');
    expect(events).toEqual(['lease']);
  });

  it('renders a campaign creative the same as a lease', async () => {
    const campaign: ServeResponse = {
      ...LEASE,
      status: 'campaign',
      lease: null,
      campaign: { advertiser: LEASE.lease!.advertiser, campaignId: '3' },
      creative: {
        ...LEASE.creative!,
        clickUrl: 'http://api.test/v1/c/tok',
      },
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(campaign));
    const el = mount({ 'slot-id': '1', api: 'http://api.test' });
    await flush();
    await flush();
    expect(el.shadowRoot!.querySelector('a')!.getAttribute('href')).toBe('http://api.test/v1/c/tok');
    expect(el.shadowRoot!.querySelector('img')!.getAttribute('src')).toBe(campaign.creative!.mediaUrl);
  });

  it('falls back to house attributes when fetch fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'));
    const onError = vi.fn();
    document.body.addEventListener('openad:error', onError);

    const el = mount({
      'slot-id': '7',
      api: 'http://api.test',
      'house-src': 'https://pub.example/house.png',
      'house-href': 'https://pub.example/',
    });
    await flush();
    await flush();

    const a = el.shadowRoot!.querySelector('a')!;
    expect(el.shadowRoot!.querySelector('img')!.getAttribute('src')).toBe(
      'https://pub.example/house.png',
    );
    expect(a.getAttribute('href')).toBe('https://pub.example/');
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('hides the link when the slot is empty and no house ad is configured', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ slotId: '3', status: 'empty', creative: null, lease: null, campaign: null, ttl: 30 }),
    );
    const el = mount({ 'slot-id': '3', api: 'http://api.test' });
    await flush();
    await flush();
    expect(el.shadowRoot!.querySelector('a')!.hidden).toBe(true);
  });

  it('rejects non-http click urls', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ ...LEASE, creative: { ...LEASE.creative!, clickUrl: 'javascript:alert(1)' } }),
    );
    const el = mount({ 'slot-id': '1', api: 'http://api.test' });
    await flush();
    await flush();
    expect(el.shadowRoot!.querySelector('a')!.hasAttribute('href')).toBe(false);
  });
});
