import { describe, expect, it } from 'vitest';

import { PERSONAS } from '../src/accounts.js';
import { choose, eligibleActions, openPeriodLeaseRatio } from '../src/planner/choose.js';
import { mulberry32 } from '../src/planner/rng.js';
import type { PersonaSnap, Snapshot } from '../src/planner/types.js';
import { usdcDeficit } from '../src/funding.js';

function personas(): PersonaSnap[] {
  return PERSONAS.map((p) => ({
    id: p.id,
    address: p.address,
    role: p.role,
    lastActionAt: {},
  }));
}

function emptySnap(): Snapshot {
  return { now: 1_000_000, slots: [], creatives: [], approvals: [], campaigns: [] };
}

describe('usdcDeficit', () => {
  it('is zero when already funded', () => {
    expect(usdcDeficit(5_000_000_000n, 5_000_000_000n)).toBe(0n);
    expect(usdcDeficit(1n, 10n)).toBe(9n);
  });
});

describe('choose', () => {
  it('is deterministic with a seeded rng', () => {
    const snap = emptySnap();
    const a = choose(snap, personas(), mulberry32(1));
    const b = choose(snap, personas(), mulberry32(1));
    expect(a).toEqual(b);
    expect(a?.action).toBe('mint_slot');
  });

  it('skips buy when open periods are mostly leased', () => {
    const pub = PERSONAS[0];
    const adv = PERSONAS[3];
    if (!pub || !adv) throw new Error('roster');
    const snap: Snapshot = {
      now: 1_000_000,
      slots: [
        {
          slotId: 10n,
          owner: pub.address,
          width: 300,
          height: 250,
          domain: 'a.example',
          periodSeconds: 3600,
          firstPeriodStart: 1_000_000,
          terms: {
            startPrice: 10n,
            floorPrice: 1n,
            leadSeconds: 3600,
            paused: false,
            approvalMode: 0,
            saleMode: 0,
            floorCpc: 0n,
          },
          periods: [
            {
              periodIndex: 0n,
              start: 1,
              end: 2,
              leased: true,
              sellable: false,
              reason: 'already leased',
              indicativePrice: 0n,
              creativeId: '1',
            },
            {
              periodIndex: 1n,
              start: 2,
              end: 3,
              leased: true,
              sellable: false,
              reason: 'already leased',
              indicativePrice: 0n,
              creativeId: '1',
            },
            {
              periodIndex: 3n,
              start: 4,
              end: 5,
              leased: true,
              sellable: false,
              reason: 'already leased',
              indicativePrice: 0n,
              creativeId: '1',
            },
            {
              periodIndex: 2n,
              start: 3,
              end: 4,
              leased: false,
              sellable: true,
              reason: '',
              indicativePrice: 1n,
              creativeId: null,
            },
          ],
        },
      ],
      creatives: [
        {
          creativeId: 1n,
          advertiser: adv.address,
          width: 300,
          height: 250,
          verificationStatus: 'verified',
        },
      ],
      approvals: [{ publisher: pub.address, creativeId: 1n, status: 2 }],
      campaigns: [],
    };
    expect(openPeriodLeaseRatio(snap)).toBeGreaterThan(0.69);
    const cand = eligibleActions(snap, personas());
    expect(cand.some((c) => c.action === 'buy')).toBe(false);
  });

  it('does not offer buy without a matching approved creative', () => {
    const pub = PERSONAS[0];
    if (!pub) throw new Error('roster');
    const snap: Snapshot = {
      now: 1_000_000,
      slots: [
        {
          slotId: 1n,
          owner: pub.address,
          width: 300,
          height: 250,
          domain: 'a.example',
          periodSeconds: 3600,
          firstPeriodStart: 1,
          terms: {
            startPrice: 10n,
            floorPrice: 1n,
            leadSeconds: 1,
            paused: false,
            approvalMode: 0,
            saleMode: 0,
            floorCpc: 0n,
          },
          periods: [
            {
              periodIndex: 0n,
              start: 1,
              end: 2,
              leased: false,
              sellable: true,
              reason: '',
              indicativePrice: 5n,
              creativeId: null,
            },
          ],
        },
      ],
      creatives: [],
      approvals: [],
      campaigns: [],
    };
    const cand = eligibleActions(snap, personas());
    expect(cand.some((c) => c.action === 'buy')).toBe(false);
  });

  it('skips buy on CPC slots and offers open_campaign', () => {
    const pub = PERSONAS[0];
    const adv = PERSONAS[3];
    if (!pub || !adv) throw new Error('roster');
    const snap: Snapshot = {
      now: 1_000_000,
      slots: [
        {
          slotId: 3n,
          owner: pub.address,
          width: 300,
          height: 250,
          domain: 'cpc.example',
          periodSeconds: 3600,
          firstPeriodStart: 1,
          terms: {
            startPrice: 0n,
            floorPrice: 0n,
            leadSeconds: 0,
            paused: false,
            approvalMode: 1,
            saleMode: 1,
            floorCpc: 100_000n,
          },
          periods: [
            {
              periodIndex: 0n,
              start: 1,
              end: 2,
              leased: false,
              sellable: true,
              reason: '',
              indicativePrice: 5n,
              creativeId: null,
            },
          ],
        },
      ],
      creatives: [
        {
          creativeId: 1n,
          advertiser: adv.address,
          width: 300,
          height: 250,
          verificationStatus: 'verified',
        },
      ],
      approvals: [],
      campaigns: [],
    };
    const cand = eligibleActions(snap, personas());
    expect(cand.some((c) => c.action === 'buy')).toBe(false);
    expect(cand.some((c) => c.action === 'open_campaign' && c.personaId === adv.id)).toBe(true);
  });
});
