import { advertisers, PERSONAS, publishers, type Persona } from './accounts.js';
import type { ApiClient, ApprovalJson, CampaignJson, CreativeJson } from './api.js';
import { choose } from './planner/choose.js';
import { execute, type Runtime } from './planner/execute.js';
import { loadSnapshot } from './planner/snapshot.js';
import type { ActionName, ChosenAction, PersonaSnap } from './planner/types.js';
import { FAMILY_BUY } from './planner/types.js';

export type LogLine = {
  at: number;
  personaId: string;
  action: string;
  ok: boolean;
  detail: string;
  tx?: string;
};

export type EngineState = {
  paused: boolean;
  ticks: number;
  last: LogLine[];
  nudge: ChosenAction | null;
  lastActionAt: Map<string, Record<string, number>>;
};

const RING = 100;

export function createEngineState(): EngineState {
  return {
    paused: false,
    ticks: 0,
    last: [],
    nudge: null,
    lastActionAt: new Map(PERSONAS.map((p) => [p.id, {}])),
  };
}

function personaSnaps(state: EngineState): PersonaSnap[] {
  return PERSONAS.map((p) => ({
    id: p.id,
    address: p.address,
    role: p.role,
    lastActionAt: state.lastActionAt.get(p.id) ?? {},
  }));
}

function markCooldown(state: EngineState, personaId: string, action: ActionName, now: number): void {
  const rec = { ...(state.lastActionAt.get(personaId) ?? {}) };
  const family = FAMILY_BUY.has(action) ? 'buy' : action;
  rec[family] = now;
  state.lastActionAt.set(personaId, rec);
}

async function collectCreatives(api: ApiClient): Promise<{
  creatives: CreativeJson[];
  approvals: ApprovalJson[];
  campaigns: CampaignJson[];
}> {
  const creatives: CreativeJson[] = [];
  const approvals: ApprovalJson[] = [];
  const campaigns: CampaignJson[] = [];
  for (const p of advertisers()) {
    try {
      const dash = await api.advertiser(p.address);
      for (const camp of dash.campaigns ?? []) {
        campaigns.push({ ...camp, advertiser: dash.address || p.address });
      }
      for (const id of dash.creativeIds) {
        try {
          creatives.push(await api.getCreative(id));
        } catch {
          /* indexer lag */
        }
      }
    } catch {
      /* empty */
    }
  }
  for (const p of publishers()) {
    try {
      approvals.push(...(await api.publisherApprovals(p.address)));
    } catch {
      /* empty */
    }
  }
  return { creatives, approvals, campaigns };
}

export async function tick(rt: Runtime, state: EngineState, rng: () => number): Promise<LogLine | null> {
  if (state.paused) return null;
  const extra = await collectCreatives(rt.api);
  const snap = await loadSnapshot(rt.api, extra.creatives, extra.approvals, extra.campaigns);
  const chosen = state.nudge ?? choose(snap, personaSnaps(state), rng);
  state.nudge = null;
  if (!chosen) {
    state.ticks += 1;
    return null;
  }
  const result = await execute(rt, chosen);
  markCooldown(state, chosen.personaId, chosen.action, snap.now);
  const line: LogLine = {
    at: Date.now(),
    personaId: chosen.personaId,
    action: chosen.action,
    ok: result.ok,
    detail: result.detail,
    tx: result.tx,
  };
  state.last.push(line);
  if (state.last.length > RING) state.last.shift();
  state.ticks += 1;
  const tag = result.ok ? 'ok' : 'fail';
  console.log(
    JSON.stringify({ sim: tag, action: chosen.action, persona: chosen.personaId, detail: result.detail, tx: result.tx }),
  );
  return line;
}

export function enqueueNudge(state: EngineState, action: ChosenAction): void {
  state.nudge = action;
}

export function personaPublic(p: Persona, state: EngineState): Record<string, unknown> {
  return {
    id: p.id,
    role: p.role,
    address: p.address,
    lastActionAt: state.lastActionAt.get(p.id) ?? {},
  };
}

export function jitterDelayMs(tickSeconds: number, rng: () => number): number {
  const jitter = 0.5 + rng();
  return Math.max(1000, Math.floor(tickSeconds * 1000 * jitter));
}
