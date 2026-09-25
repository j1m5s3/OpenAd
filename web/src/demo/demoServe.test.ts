import { describe, expect, it } from 'vitest';

import { applyCall } from './reducers';
import { buildServeResponse } from './demoServe';
import { DEMO_PERSONAS, seedDemoState } from './fixtures';

const NOW = 1_800_000_000;

describe('buildServeResponse', () => {
  it('matches the ServeResponse keys the real API returns', () => {
    const state = seedDemoState(NOW);
    const res = buildServeResponse(state, '0', NOW);
    expect(Object.keys(res).sort()).toEqual(['campaign', 'creative', 'lease', 'slotId', 'status', 'ttl'].sort());
  });

  it('prefers an active lease over a campaign', () => {
    const state = seedDemoState(NOW);
    // Slot 0 has a current lease seeded at period index 3 covering `now` (see fixtures.ts).
    const res = buildServeResponse(state, '0', NOW);
    expect(res.status).toBe('lease');
    expect(res.creative).not.toBeNull();
  });

  it('falls back to the top campaign when there is no active lease', () => {
    const state = seedDemoState(NOW);
    // Slot 1 is CPC-only (no calendar), with an open, unpaused campaign (campaign 1, maxCpc 50000).
    const res = buildServeResponse(state, '1', NOW);
    expect(res.status).toBe('campaign');
    expect(res.campaign?.campaignId).toBe('1');
  });

  it('falls back to house, then empty, when neither a lease nor a campaign applies', () => {
    const state = seedDemoState(NOW);
    // Slot 3 is CPC with no campaigns seeded → empty.
    expect(buildServeResponse(state, '3', NOW).status).toBe('empty');

    state.houseAds['3'] = { slotId: '3', mediaUrl: '/demo/creatives/house.svg', clickUrl: 'https://example.test' };
    expect(buildServeResponse(state, '3', NOW).status).toBe('house');
  });

  it('returns unknown for a slot id that does not exist', () => {
    const res = buildServeResponse(seedDemoState(NOW), '999', NOW);
    expect(res.status).toBe('unknown');
    expect(res.creative).toBeNull();
  });

  it('the served creative changes after a buy applies a new lease', () => {
    const state = seedDemoState(NOW);
    const advertiser = DEMO_PERSONAS.advertiserWallet.address;
    // Slot 4 (LEASE) has no lease covering `now` in the fixture (only a past one at index 0); its
    // current period is index 3, open for the Dutch auction, so a buy at `now` is sellable.
    const before = buildServeResponse(state, '4', NOW);
    expect(before.status).not.toBe('lease');
    const { state: after } = applyCall(
      state,
      { contract: 'Marketplace', functionName: 'buy_with_permit', args: [4n, 3n, 3n, 8_000_000n, BigInt(NOW + 3600)] },
      advertiser,
      NOW,
    );
    const served = buildServeResponse(after, '4', NOW);
    expect(served.status).toBe('lease');
    expect(served.lease?.advertiser.toLowerCase()).toBe(advertiser.toLowerCase());
  });
});
