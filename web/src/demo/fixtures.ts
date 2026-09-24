/** Demo mode seed fixtures (ADR-0016).
 *
 * `seedDemoState(now)` builds a deterministic, self-consistent snapshot of the read model that
 * `web/src/lib/api.ts` would otherwise fetch from the real API — same shapes (see
 * `web/src/generated/openapi.ts`), same units (integer USDC base-unit strings, Unix seconds), and
 * the same Dutch/remainder price + fee-split math as the protocol (`web/src/lib/auction.ts`).
 *
 * Everything here is content, not identity: personas, publishers and advertisers are fictional
 * (glossary terms only — never "sell a slot").
 */
import { getAddress } from 'viem';

import { dutchPrice, feeSplit, remainderPrice } from '../lib/auction';
import type {
  AdvertiserOut,
  ApprovalOut,
  CreativeOut,
  PublisherOut,
  SlotOut,
} from '../lib/api';

// ---------------------------------------------------------------------------------------------
// Personas
// ---------------------------------------------------------------------------------------------

/** Deterministic, obviously-fake checksummed address: `0xDe00…000n`. Never a real wallet. */
function demoAddress(n: number): string {
  const suffix = n.toString(16).padStart(4, '0');
  return getAddress(`0xDe00${'0'.repeat(32)}${suffix}`);
}

export interface DemoPersona {
  address: string;
  role: 'publisher' | 'advertiser';
  label: string;
}

/** Fictional demo personas (ADR-0016 D3): 3 publishers, 2 advertisers. Named after invented
 * products, not any real company. */
export const DEMO_PERSONAS = {
  publisherNewsletter: {
    address: demoAddress(1),
    role: 'publisher',
    label: 'Basecamp Weekly (newsletter)',
  },
  publisherDocs: {
    address: demoAddress(2),
    role: 'publisher',
    label: 'Voidkit Docs (dev-tool docs)',
  },
  publisherExplorer: {
    address: demoAddress(3),
    role: 'publisher',
    label: 'ChainScope Explorer (dashboard)',
  },
  advertiserWallet: {
    address: demoAddress(4),
    role: 'advertiser',
    label: 'Nimbus Wallet',
  },
  advertiserL2: {
    address: demoAddress(5),
    role: 'advertiser',
    label: 'Fastlane L2',
  },
} as const satisfies Record<string, DemoPersona>;

const PUB_NEWSLETTER = DEMO_PERSONAS.publisherNewsletter.address;
const PUB_DOCS = DEMO_PERSONAS.publisherDocs.address;
const PUB_EXPLORER = DEMO_PERSONAS.publisherExplorer.address;
const ADV_WALLET = DEMO_PERSONAS.advertiserWallet.address;
const ADV_L2 = DEMO_PERSONAS.advertiserL2.address;

// ---------------------------------------------------------------------------------------------
// Periods (computed, not stored — mirrors `api/src/openad/services/periods.py`)
// ---------------------------------------------------------------------------------------------

/** A period actually leased in the fixture timeline, keyed by `period_index`. `price` is the
 * historical sale price (never exposed by the real `PeriodOut` — it never re-reveals a leased
 * period's price — but tracked here so fixtures can prove `publisherAmount + fee == price`). */
export interface DemoLeaseRecord {
  lessee: string;
  creativeId: string;
  price: string;
}

export interface ComputedPeriod {
  periodIndex: string;
  start: number;
  end: number;
  leased: boolean;
  lessee: string | null;
  creativeId: string | null;
  sellable: boolean;
  reason: string;
  indicativePrice: string;
}

/** Same rule as `periods_service.list_periods` / `dutch_price` (PROTOCOL §4.2): computed from the
 * slot's calendar + terms + any lease at `idx`, never stored as static JSON, so the demo never
 * drifts from "now". Slots with no calendar (`calendarVersion === 0`) have no periods. */
export function computePeriod(
  slot: SlotOut,
  leases: Readonly<Record<number, DemoLeaseRecord>>,
  idx: number,
  now: number,
): ComputedPeriod {
  const { periodSeconds, firstPeriodStart, terms } = slot;
  if (slot.calendarVersion === 0 || periodSeconds == null || firstPeriodStart == null) {
    throw new Error(`slot ${slot.slotId} has no calendar`);
  }
  const start = firstPeriodStart + idx * periodSeconds;
  const end = start + periodSeconds;
  const lease = leases[idx];
  let sellable = false;
  let reason = 'no terms';
  let price = 0n;
  if (terms && terms.leadSeconds > 0) {
    if (terms.paused) {
      reason = 'paused';
    } else if (terms.saleEnd !== 0 && end > terms.saleEnd) {
      reason = 'beyond sale end';
    } else if (lease) {
      reason = 'already leased';
    } else {
      const openAt = start > terms.leadSeconds ? start - terms.leadSeconds : 0;
      if (now < openAt) {
        reason = 'not open';
      } else if (now >= end) {
        reason = 'closed';
      } else if (now < start) {
        sellable = true;
        reason = '';
        price = dutchPrice(BigInt(terms.startPrice), BigInt(terms.floorPrice), terms.leadSeconds, start, now);
      } else {
        sellable = true;
        reason = 'remainder';
        price = remainderPrice(BigInt(terms.floorPrice), periodSeconds, end, now);
      }
    }
  }
  return {
    periodIndex: String(idx),
    start,
    end,
    leased: Boolean(lease),
    lessee: lease?.lessee ?? null,
    creativeId: lease?.creativeId ?? null,
    sellable,
    reason,
    indicativePrice: price.toString(),
  };
}

// ---------------------------------------------------------------------------------------------
// Full state
// ---------------------------------------------------------------------------------------------

export interface DemoHouseAd {
  slotId: string;
  mediaUrl: string;
  clickUrl: string;
}

export interface DemoDomainVerification {
  slotId: string;
  method: string;
  token: string;
  verifiedAt: number | null;
}

export interface DemoCampaign {
  campaignId: string;
  slotId: string;
  creativeId: string;
  advertiser: string;
  maxCpc: string;
  remaining: string;
  budget: string;
  paused: boolean;
  closed: boolean;
  closeAfter: number;
  serves: number;
  settlements: { batchId: string; charged: string; fee: string; payableClicks: number; slotId: string }[];
}

export interface DemoSlotFixture {
  slot: SlotOut;
  /** Leased periods, keyed by `period_index`; absent indices are computed live. */
  leases: Record<number, DemoLeaseRecord>;
}

export interface DemoState {
  slots: DemoSlotFixture[];
  creatives: Record<string, CreativeOut>;
  approvals: ApprovalOut[];
  campaigns: Record<string, DemoCampaign>;
  houseAds: Record<string, DemoHouseAd>;
  domainVerifications: Record<string, DemoDomainVerification>;
  connectedAddress: string | null;
}

const DAY = 86_400;

function terms(
  startPrice: string,
  floorPrice: string,
  leadSeconds: number,
  approvalMode: number,
  saleMode: number,
  floorCpc: string,
  paused: boolean,
): NonNullable<SlotOut['terms']> {
  return {
    startPrice,
    floorPrice,
    leadSeconds,
    saleEnd: 0,
    approvalMode,
    saleMode,
    floorCpc,
    paused,
  };
}

/** Builds the full seeded demo state for a given "now". Deterministic: the same `now` always
 * produces the same content (fixed persona addresses, ids, prices — only the calendar anchors
 * move with `now`, so a currently-auctioning period stays currently auctioning). */
export function seedDemoState(now: number): DemoState {
  // first_period_start, anchored a half-period off a clean multiple of `DAY` so index 3 straddles
  // "now" at its midpoint: its remainder-phase price lands strictly between floor and 0, and
  // index 4 (Dutch phase, leadSeconds == periodSeconds) lands strictly between floor and start —
  // both mid-decay, not at an endpoint.
  const fps = now - 3 * DAY - DAY / 2;

  const slots: DemoSlotFixture[] = [
    {
      // Newsletter header banner — LEASE, domain-verified, active auction demo.
      slot: {
        slotId: '0',
        owner: PUB_NEWSLETTER,
        width: 728,
        height: 90,
        kind: 1,
        domain: 'basecampweekly.example',
        calendarVersion: 1,
        periodSeconds: DAY,
        firstPeriodStart: fps,
        terms: terms('5000000', '1000000', DAY, 0, 0, '0', false),
      },
      leases: {
        0: { lessee: ADV_L2, creativeId: '2', price: '3000000' }, // past leased
        3: { lessee: ADV_WALLET, creativeId: '1', price: '2000000' }, // current leased
      },
    },
    {
      // Newsletter sidebar — CPC.
      slot: {
        slotId: '1',
        owner: PUB_NEWSLETTER,
        width: 300,
        height: 250,
        kind: 1,
        domain: 'basecampweekly.example',
        calendarVersion: 0,
        periodSeconds: null,
        firstPeriodStart: null,
        terms: terms('0', '0', 0, 1, 1, '20000', false),
      },
      leases: {},
    },
    {
      // Docs site rail — LEASE, unsold-remainder demo (current period never bought).
      slot: {
        slotId: '2',
        owner: PUB_DOCS,
        width: 320,
        height: 50,
        kind: 0,
        domain: 'voidkitdocs.example',
        calendarVersion: 1,
        periodSeconds: DAY,
        firstPeriodStart: fps,
        terms: terms('2000000', '500000', DAY, 0, 0, '0', false),
      },
      leases: {
        0: { lessee: ADV_L2, creativeId: '2', price: '1200000' }, // past leased
      },
    },
    {
      // Docs site footer — CPC.
      slot: {
        slotId: '3',
        owner: PUB_DOCS,
        width: 728,
        height: 90,
        kind: 0,
        domain: 'voidkitdocs.example',
        calendarVersion: 0,
        periodSeconds: null,
        firstPeriodStart: null,
        terms: terms('0', '0', 0, 0, 1, '15000', false),
      },
      leases: {},
    },
    {
      // Explorer dashboard tile — LEASE, upcoming/currently-auctioning demo.
      slot: {
        slotId: '4',
        owner: PUB_EXPLORER,
        width: 300,
        height: 250,
        kind: 0,
        domain: 'chainscope.example',
        calendarVersion: 1,
        periodSeconds: DAY,
        firstPeriodStart: fps,
        terms: terms('8000000', '2000000', DAY, 0, 0, '0', false),
      },
      leases: {
        0: { lessee: ADV_WALLET, creativeId: '3', price: '5000000' }, // past leased
      },
    },
    {
      // Explorer footer strip — LEASE, paused.
      slot: {
        slotId: '5',
        owner: PUB_EXPLORER,
        width: 320,
        height: 50,
        kind: 0,
        domain: 'chainscope.example',
        calendarVersion: 1,
        periodSeconds: DAY,
        firstPeriodStart: fps,
        terms: terms('1500000', '400000', DAY, 1, 0, '0', true),
      },
      leases: {
        0: { lessee: ADV_L2, creativeId: '4', price: '800000' }, // past leased
      },
    },
  ];

  const creatives: Record<string, CreativeOut> = {
    '1': {
      creativeId: '1',
      advertiser: ADV_WALLET,
      kind: 0,
      uri: '/demo/creatives/nimbus-728x90.svg',
      contentHash: `0x${'a'.repeat(64)}`,
      mime: 'image/svg+xml',
      width: 728,
      height: 90,
      clickUrl: 'https://nimbuswallet.example/demo-landing',
      revoked: false,
      verificationStatus: 'verified',
    },
    '2': {
      creativeId: '2',
      advertiser: ADV_L2,
      kind: 0,
      uri: '/demo/creatives/fastlane-320x50.svg',
      contentHash: `0x${'b'.repeat(64)}`,
      mime: 'image/svg+xml',
      width: 320,
      height: 50,
      clickUrl: 'https://fastlanel2.example/demo-landing',
      revoked: false,
      verificationStatus: 'verified',
    },
    '3': {
      creativeId: '3',
      advertiser: ADV_WALLET,
      kind: 0,
      uri: '/demo/creatives/nimbus-300x250.svg',
      contentHash: `0x${'c'.repeat(64)}`,
      mime: 'image/svg+xml',
      width: 300,
      height: 250,
      clickUrl: 'https://nimbuswallet.example/demo-landing',
      revoked: false,
      verificationStatus: 'verified',
    },
    '4': {
      creativeId: '4',
      advertiser: ADV_L2,
      kind: 0,
      uri: '/demo/creatives/fastlane-728x90.svg',
      contentHash: `0x${'d'.repeat(64)}`,
      mime: 'image/svg+xml',
      width: 728,
      height: 90,
      clickUrl: 'https://fastlanel2.example/demo-landing',
      revoked: false,
      verificationStatus: 'pending',
    },
    '5': {
      creativeId: '5',
      advertiser: ADV_WALLET,
      kind: 0,
      uri: '/demo/creatives/nimbus-320x50.svg',
      contentHash: `0x${'e'.repeat(64)}`,
      mime: 'image/svg+xml',
      width: 320,
      height: 50,
      clickUrl: 'https://nimbuswallet.example/demo-landing',
      revoked: true,
      verificationStatus: 'verified',
    },
  };

  const approvals: ApprovalOut[] = [
    { publisher: PUB_NEWSLETTER, creativeId: '1', status: 2, advertiser: ADV_WALLET },
    { publisher: PUB_NEWSLETTER, creativeId: '4', status: 1, advertiser: ADV_L2 },
    { publisher: PUB_DOCS, creativeId: '2', status: 2, advertiser: ADV_L2 },
    { publisher: PUB_DOCS, creativeId: '5', status: 4, advertiser: ADV_WALLET },
    { publisher: PUB_EXPLORER, creativeId: '3', status: 2, advertiser: ADV_WALLET },
  ];

  // Each settlement's fee is derived from `charged` via the same 250 bps split the protocol
  // applies (PROTOCOL §11 `settle_batch`: `fee = charged * fee_bps / 10_000`), and every
  // `charged / payableClicks` stays at or below the campaign's `maxCpc` (a GSP settlement can
  // never charge above the winner's own max). `budget == remaining + Σcharged` for every
  // campaign (CampaignVault invariant: nothing but `remaining` and paid-out settlements came out
  // of the escrowed budget).
  function settlement(batchId: string, slotId: string, charged: string, payableClicks: number) {
    return { batchId, slotId, charged, payableClicks, fee: feeSplit(BigInt(charged)).fee.toString() };
  }

  const campaigns: Record<string, DemoCampaign> = {
    '1': {
      campaignId: '1',
      slotId: '1',
      creativeId: '3',
      advertiser: ADV_WALLET,
      maxCpc: '50000',
      remaining: '3500000', // 5,000,000 budget - 1,500,000 charged
      budget: '5000000',
      paused: false,
      closed: false,
      closeAfter: 0,
      serves: 120,
      settlements: [settlement('1', '1', '1500000', 30)], // 1,500,000 / 30 = 50,000 == maxCpc
    },
    '2': {
      campaignId: '2',
      slotId: '3',
      creativeId: '2',
      advertiser: ADV_L2,
      maxCpc: '30000',
      remaining: '0', // fully spent: 2,000,000 budget - 2,000,000 charged
      budget: '2000000',
      paused: false,
      closed: true,
      closeAfter: now - 3600,
      serves: 80,
      settlements: [settlement('2', '3', '2000000', 67)], // 2,000,000 / 67 ≈ 29,850 <= maxCpc
    },
    '3': {
      campaignId: '3',
      slotId: '1',
      creativeId: '1',
      advertiser: ADV_WALLET,
      maxCpc: '40000',
      remaining: '1000000', // nothing settled yet: remaining == budget
      budget: '1000000',
      paused: true,
      closed: false,
      closeAfter: 0,
      serves: 10,
      settlements: [],
    },
  };

  return {
    slots,
    creatives,
    approvals,
    campaigns,
    houseAds: {},
    domainVerifications: {},
    connectedAddress: null,
  };
}

// ---------------------------------------------------------------------------------------------
// Derived read-model builders (used by `demoApi.ts`; pure functions of the state above)
// ---------------------------------------------------------------------------------------------

function slotEarnings(state: DemoState, slotId: string): bigint {
  const fixture = state.slots.find((s) => s.slot.slotId === slotId);
  let total = 0n;
  if (fixture) {
    for (const record of Object.values(fixture.leases)) {
      total += feeSplit(BigInt(record.price)).publisherAmount;
    }
  }
  for (const campaign of Object.values(state.campaigns)) {
    if (campaign.slotId !== slotId) continue;
    for (const settlement of campaign.settlements) {
      total += BigInt(settlement.charged) - BigInt(settlement.fee);
    }
  }
  return total;
}

export function buildPublisherOut(state: DemoState, address: string): PublisherOut {
  const addr = address.toLowerCase();
  const slotIds = state.slots.filter((s) => s.slot.owner.toLowerCase() === addr).map((s) => s.slot.slotId);
  const pendingApprovals = state.approvals.filter(
    (a) => a.publisher.toLowerCase() === addr && a.status === 1,
  ).length;
  const earningsUsdc = slotIds.reduce((sum, slotId) => sum + slotEarnings(state, slotId), 0n);
  return {
    address,
    slotIds,
    pendingApprovals,
    earningsUsdc: earningsUsdc.toString(),
  };
}

export function buildAdvertiserOut(state: DemoState, address: string): AdvertiserOut {
  const addr = address.toLowerCase();
  const creativeIds = Object.values(state.creatives)
    .filter((c) => c.advertiser.toLowerCase() === addr)
    .map((c) => c.creativeId);
  const delivery: AdvertiserOut['delivery'] = [];
  let leaseCount = 0;
  for (const fixture of state.slots) {
    for (const [idx, record] of Object.entries(fixture.leases)) {
      if (record.lessee.toLowerCase() !== addr) continue;
      leaseCount += 1;
      // Deterministic, plausible serve count derived from the fixture, not random.
      const serves = 150 * (Number(idx) + 1) + Number(fixture.slot.slotId) * 50;
      delivery.push({ slotId: fixture.slot.slotId, periodIndex: idx, serves });
    }
  }
  const campaigns = Object.values(state.campaigns)
    .filter((c) => c.advertiser.toLowerCase() === addr)
    .map((c) => ({
      campaignId: c.campaignId,
      slotId: c.slotId,
      creativeId: c.creativeId,
      maxCpc: c.maxCpc,
      remaining: c.remaining,
      budget: c.budget,
      paused: c.paused,
      closed: c.closed,
      closeAfter: c.closeAfter,
      serves: c.serves,
      settlements: c.settlements,
    }));
  return { address, creativeIds, leaseCount, delivery, campaigns };
}

export function suggestPrices(state: DemoState, slotId: string, now: number): Record<string, string> {
  const fixture = state.slots.find((s) => s.slot.slotId === slotId);
  const t = fixture?.slot.terms;
  const sold = fixture ? Object.values(fixture.leases).map((l) => BigInt(l.price)) : [];
  const avg = sold.length
    ? sold.reduce((a, b) => a + b, 0n) / BigInt(sold.length)
    : BigInt(t?.startPrice ?? '0');
  const floor = BigInt(t?.floorPrice ?? '0');
  const suggestedStart = avg > floor ? avg : floor;
  const suggestedFloor = floor < suggestedStart ? floor : suggestedStart;
  return {
    suggestedStartPrice: suggestedStart.toString(),
    suggestedFloorPrice: suggestedFloor.toString(),
    soldPeriods: String(sold.length),
    asOf: String(now),
  };
}
