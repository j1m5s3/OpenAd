import type { ApiClient, ApprovalJson, CampaignJson, CreativeJson, PeriodJson, SlotJson } from '../api.js';
import type { CampaignSnap, Snapshot, SlotSnap } from './types.js';

function mapSlot(s: SlotJson, periods: PeriodJson[]): SlotSnap {
  return {
    slotId: BigInt(s.slotId),
    owner: s.owner,
    width: s.width,
    height: s.height,
    domain: s.domain,
    periodSeconds: s.periodSeconds,
    firstPeriodStart: s.firstPeriodStart,
    terms: s.terms
      ? {
          startPrice: BigInt(s.terms.startPrice),
          floorPrice: BigInt(s.terms.floorPrice),
          leadSeconds: s.terms.leadSeconds,
          paused: s.terms.paused,
          approvalMode: s.terms.approvalMode,
          saleMode: s.terms.saleMode ?? 0,
          floorCpc: BigInt(s.terms.floorCpc ?? '0'),
        }
      : null,
    periods: periods.map((p) => ({
      periodIndex: BigInt(p.periodIndex),
      start: p.start,
      end: p.end,
      leased: p.leased,
      sellable: p.sellable,
      reason: p.reason,
      indicativePrice: BigInt(p.indicativePrice || '0'),
      creativeId: p.creativeId,
    })),
  };
}

export async function loadSnapshot(
  api: ApiClient,
  extraCreatives: CreativeJson[],
  extraApprovals: ApprovalJson[],
  extraCampaigns: CampaignJson[] = [],
): Promise<Snapshot> {
  const slots = await api.listSlots();
  const mapped: SlotSnap[] = [];
  for (const s of slots) {
    let periods: PeriodJson[] = [];
    try {
      periods = (await api.listPeriods(s.slotId, 0, 4)).items;
    } catch {
      periods = [];
    }
    mapped.push(mapSlot(s, periods));
  }
  return {
    now: Math.floor(Date.now() / 1000),
    slots: mapped,
    creatives: extraCreatives.map((c) => ({
      creativeId: BigInt(c.creativeId),
      advertiser: c.advertiser,
      width: c.width,
      height: c.height,
      verificationStatus: c.verificationStatus,
    })),
    approvals: extraApprovals.map((a) => ({
      publisher: a.publisher,
      creativeId: BigInt(a.creativeId),
      status: a.status,
    })),
    campaigns: extraCampaigns.map(
      (c): CampaignSnap => ({
        campaignId: BigInt(c.campaignId),
        advertiser: c.advertiser,
        slotId: BigInt(c.slotId),
        creativeId: BigInt(c.creativeId),
        maxCpc: BigInt(c.maxCpc || '0'),
        remaining: BigInt(c.remaining || '0'),
        paused: c.paused,
        closed: c.closed,
      }),
    ),
  };
}
