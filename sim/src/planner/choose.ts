import { SIM_ADDRESSES } from '../accounts.js';
import {
  COOLDOWNS,
  FAMILY_BUY,
  LEASED_OPEN_CAP,
  MAX_SIM_SLOTS,
  WEIGHTS,
  type ActionName,
  type ChosenAction,
  type PersonaSnap,
  type Snapshot,
  type SlotSnap,
} from './types.js';
import { pickWeighted } from './rng.js';

const APPROVAL_REQUESTED = 1;
const APPROVAL_NONE = 0;
const APPROVAL_REJECTED = 3;

function cooledDown(p: PersonaSnap, action: ActionName, now: number): boolean {
  const family = FAMILY_BUY.has(action) ? 'buy' : action;
  const wait = COOLDOWNS[action] ?? 0;
  const last = p.lastActionAt[family] ?? 0;
  return now - last >= wait;
}

function simSlotCount(snap: Snapshot): number {
  return snap.slots.filter((s) => SIM_ADDRESSES.has(s.owner.toLowerCase())).length;
}

export function openPeriodLeaseRatio(snap: Snapshot): number {
  let open = 0;
  let leased = 0;
  for (const s of snap.slots) {
    if (s.terms?.saleMode === 1) continue;
    for (const p of s.periods) {
      if (p.sellable || p.leased) {
        open += 1;
        if (p.leased) leased += 1;
      }
    }
  }
  if (open === 0) return 0;
  return leased / open;
}

function slotsOf(snap: Snapshot, owner: string): SlotSnap[] {
  const o = owner.toLowerCase();
  return snap.slots.filter((s) => s.owner.toLowerCase() === o);
}

type Candidate = ChosenAction & { weight: number };

function campaignOpenParams(snap: Snapshot, advertiser: string): Record<string, string> | null {
  const mine = snap.creatives.filter((c) => c.advertiser.toLowerCase() === advertiser.toLowerCase());
  if (mine.length === 0) return null;
  const addr = advertiser.toLowerCase();
  for (const slot of snap.slots) {
    if (!slot.terms || slot.terms.paused || slot.terms.saleMode !== 1) continue;
    const already = snap.campaigns.some(
      (c) =>
        !c.closed &&
        c.advertiser.toLowerCase() === addr &&
        c.slotId === slot.slotId,
    );
    if (already) continue;
    const creative = mine.find((c) => c.width === slot.width && c.height === slot.height);
    if (!creative) continue;
    const needApproval = slot.terms.approvalMode === 0;
    if (needApproval) {
      const st =
        snap.approvals.find(
          (a) =>
            a.publisher.toLowerCase() === slot.owner.toLowerCase() &&
            a.creativeId === creative.creativeId,
        )?.status ?? APPROVAL_NONE;
      if (st !== 2) continue;
    }
    const floor = slot.terms.floorCpc;
    const bump = BigInt(parseInt(addr.slice(-2), 16) % 8) * 20_000n;
    const maxCpc = floor + 20_000n + bump;
    const budget = 10_000_000n;
    return {
      slotId: slot.slotId.toString(),
      creativeId: creative.creativeId.toString(),
      maxCpc: maxCpc.toString(),
      budget: budget.toString(),
    };
  }
  return null;
}

function topUpParams(snap: Snapshot, advertiser: string): Record<string, string> | null {
  const addr = advertiser.toLowerCase();
  const camp = snap.campaigns.find(
    (c) => !c.closed && !c.paused && c.advertiser.toLowerCase() === addr && c.remaining < c.maxCpc * 20n,
  );
  if (!camp) return null;
  return { campaignId: camp.campaignId.toString(), amount: '5000000' };
}

function buyParams(snap: Snapshot, advertiser: string): Record<string, string> | null {
  const mine = snap.creatives.filter((c) => c.advertiser.toLowerCase() === advertiser.toLowerCase());
  if (mine.length === 0) return null;
  for (const slot of snap.slots) {
    if (!slot.terms || slot.terms.paused || slot.terms.saleMode === 1) continue;
    const period = slot.periods.find((p) => p.sellable && !p.leased);
    if (!period) continue;
    const creative = mine.find((c) => c.width === slot.width && c.height === slot.height);
    if (!creative) continue;
    const needApproval = slot.terms.approvalMode === 0;
    if (needApproval) {
      const st =
        snap.approvals.find(
          (a) =>
            a.publisher.toLowerCase() === slot.owner.toLowerCase() &&
            a.creativeId === creative.creativeId,
        )?.status ?? APPROVAL_NONE;
      if (st !== 2) continue;
    }
    return {
      slotId: slot.slotId.toString(),
      periodIndex: period.periodIndex.toString(),
      creativeId: creative.creativeId.toString(),
      maxPrice: period.indicativePrice.toString(),
    };
  }
  return null;
}

export function eligibleActions(
  snap: Snapshot,
  personas: PersonaSnap[],
): Candidate[] {
  const out: Candidate[] = [];
  const leasedRatio = openPeriodLeaseRatio(snap);
  const mintCapped = simSlotCount(snap) >= MAX_SIM_SLOTS;

  for (const p of personas) {
    const addr = p.address.toLowerCase();
    if (p.role === 'publisher') {
      const mine = slotsOf(snap, addr);
      if (!mintCapped && cooledDown(p, 'mint_slot', snap.now)) {
        const w = mine.length === 0 ? 40 : WEIGHTS.mint_slot;
        out.push({
          personaId: p.id,
          action: 'mint_slot',
          params: {},
          weight: w,
        });
      }
      if (mine.length > 0 && cooledDown(p, 'set_terms', snap.now)) {
        const slot = mine.find((s) => {
          const open = snap.campaigns.some((c) => !c.closed && c.slotId === s.slotId);
          return !open;
        });
        if (slot) {
          out.push({
            personaId: p.id,
            action: 'set_terms',
            params: { slotId: slot.slotId.toString() },
            weight: WEIGHTS.set_terms,
          });
        }
      }
      if (mine.length > 0 && cooledDown(p, 'set_house_ad', snap.now)) {
        const slot = mine[0];
        if (slot) {
          out.push({
            personaId: p.id,
            action: 'set_house_ad',
            params: { slotId: slot.slotId.toString() },
            weight: WEIGHTS.set_house_ad,
          });
        }
      }
      const pending = snap.approvals.filter(
        (a) => a.publisher.toLowerCase() === addr && a.status === APPROVAL_REQUESTED,
      );
      if (pending.length > 0 && cooledDown(p, 'set_approval', snap.now)) {
        const row = pending[0];
        if (row) {
          out.push({
            personaId: p.id,
            action: 'set_approval',
            params: { creativeId: row.creativeId.toString(), approved: 'true' },
            weight: WEIGHTS.set_approval,
          });
        }
      }
      const paused = mine.filter((s) => s.terms?.paused);
      const live = mine.filter((s) => s.terms && !s.terms.paused);
      if (cooledDown(p, 'set_paused', snap.now)) {
        if (paused.length > 0) {
          const slot = paused[0];
          if (slot) {
            out.push({
              personaId: p.id,
              action: 'set_paused',
              params: { slotId: slot.slotId.toString(), paused: 'false' },
              weight: 20,
            });
          }
        } else if (live.length > 1) {
          const slot = live[0];
          if (slot) {
            out.push({
              personaId: p.id,
              action: 'set_paused',
              params: { slotId: slot.slotId.toString(), paused: 'true' },
              weight: WEIGHTS.set_paused,
            });
          }
        }
      }
    } else {
      if (cooledDown(p, 'register_media', snap.now)) {
        out.push({
          personaId: p.id,
          action: 'register_media',
          params: {},
          weight: WEIGHTS.register_media,
        });
      }
      const mineC = snap.creatives.filter((c) => c.advertiser.toLowerCase() === addr);
      if (mineC.length > 0 && cooledDown(p, 'request_approval', snap.now)) {
        const pubs = snap.slots
          .map((s) => s.owner.toLowerCase())
          .filter((o, i, arr) => SIM_ADDRESSES.has(o) && arr.indexOf(o) === i);
        const creative = mineC[0];
        const publisher = pubs.find((pub) => {
          const st =
            snap.approvals.find(
              (a) => a.publisher.toLowerCase() === pub && a.creativeId === creative?.creativeId,
            )?.status ?? APPROVAL_NONE;
          return st === APPROVAL_NONE || st === APPROVAL_REJECTED;
        });
        if (creative && publisher) {
          out.push({
            personaId: p.id,
            action: 'request_approval',
            params: { publisher, creativeId: creative.creativeId.toString() },
            weight: WEIGHTS.request_approval,
          });
        }
      }
      if (leasedRatio < LEASED_OPEN_CAP && cooledDown(p, 'buy', snap.now)) {
        const params = buyParams(snap, addr);
        if (params) {
          out.push({
            personaId: p.id,
            action: 'buy',
            params,
            weight: WEIGHTS.buy,
          });
          out.push({
            personaId: p.id,
            action: 'buy_with_permit',
            params,
            weight: WEIGHTS.buy_with_permit,
          });
        }
      }
      if (cooledDown(p, 'open_campaign', snap.now)) {
        const params = campaignOpenParams(snap, addr);
        if (params) {
          out.push({
            personaId: p.id,
            action: 'open_campaign',
            params,
            weight: WEIGHTS.open_campaign,
          });
        }
      }
      if (cooledDown(p, 'top_up_campaign', snap.now)) {
        const params = topUpParams(snap, addr);
        if (params) {
          out.push({
            personaId: p.id,
            action: 'top_up_campaign',
            params,
            weight: WEIGHTS.top_up_campaign,
          });
        }
      }
    }
  }
  return out;
}

export function choose(
  snap: Snapshot,
  personas: PersonaSnap[],
  rng: () => number,
): ChosenAction | null {
  const cand = eligibleActions(snap, personas);
  if (cand.length === 0) return null;
  const picked = pickWeighted(cand, cand.map((c) => c.weight), rng);
  if (!picked) return null;
  return { personaId: picked.personaId, action: picked.action, params: picked.params };
}
