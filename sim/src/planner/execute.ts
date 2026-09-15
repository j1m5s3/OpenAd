import type { Address } from 'viem';

import { personaById, publishers, type Persona } from '../accounts.js';
import type { ApiClient } from '../api.js';
import {
  buy,
  buyWithPermit,
  type ChainCtx,
  mintSlot,
  openCampaignWithPermit,
  registerMedia,
  requestApproval,
  setApproval,
  setCalendar,
  setPaused,
  setTerms,
  signMessage,
  topUpCampaignWithPermit,
} from '../chain.js';
import { assetForSize, type MediaAsset } from '../media.js';
import type { ChosenAction } from './types.js';

export type Runtime = {
  ctx: ChainCtx;
  api: ApiClient;
  catalog: MediaAsset[];
  mediaBase: string;
  rng: () => number;
};

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function waitForSlot(api: ApiClient, slotId: string, timeoutMs = 12_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const items = await api.listSlots();
    if (items.some((s) => s.slotId === slotId)) return;
    await sleep(400);
  }
}

export type ExecResult = { ok: boolean; detail: string; tx?: string };

export async function execute(rt: Runtime, chosen: ChosenAction): Promise<ExecResult> {
  const persona = personaById(chosen.personaId);
  if (!persona) return { ok: false, detail: `unknown persona ${chosen.personaId}` };
  try {
    switch (chosen.action) {
      case 'mint_slot':
        return mintAndConfigure(rt, persona);
      case 'set_terms':
        return tweakTerms(rt, persona, chosen.params.slotId ?? '0');
      case 'set_paused':
        return pause(rt, persona, chosen.params.slotId ?? '0', chosen.params.paused === 'true');
      case 'set_house_ad':
        return houseAd(rt, persona, chosen.params.slotId ?? '0');
      case 'set_approval':
        return approve(rt, persona, chosen.params.creativeId ?? '0', chosen.params.approved !== 'false');
      case 'register_media':
        return register(rt, persona);
      case 'request_approval':
        return request(rt, persona, chosen.params.publisher ?? '', chosen.params.creativeId ?? '0');
      case 'buy':
        return doBuy(rt, persona, chosen, false);
      case 'buy_with_permit':
        return doBuy(rt, persona, chosen, true);
      case 'open_campaign':
        return doOpenCampaign(rt, persona, chosen);
      case 'top_up_campaign':
        return doTopUp(rt, persona, chosen);
      default:
        return { ok: false, detail: `unhandled ${chosen.action}` };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, detail: msg.slice(0, 400) };
  }
}

async function mintAndConfigure(rt: Runtime, persona: Persona): Promise<ExecResult> {
  const sizes = [
    [300, 250],
    [728, 90],
    [160, 600],
  ] as const;
  const pick = sizes[Math.floor(rt.rng() * sizes.length)] ?? sizes[0];
  const n = Math.floor(rt.rng() * 10_000);
  const domain = `sim-${persona.id}-${n}.example`;
  const slotId = await mintSlot(rt.ctx, persona.address, {
    width: pick[0],
    height: pick[1],
    kind: 0,
    domain,
  });
  const now = Math.floor(Date.now() / 1000);
  const roll = rt.rng();
  let firstStart = now + 7200;
  if (roll < 0.34) firstStart = now - 600;
  else if (roll < 0.67) firstStart = now + 1800;
  await setCalendar(rt.ctx, persona.address, slotId, 3600n, BigInt(firstStart));
  const floor = 1_000_000n;
  const start = 10_000_000n;
  if (rt.rng() < 0.34) {
    await setTerms(rt.ctx, persona.address, slotId, 0n, 0n, 0n, 0, 1, 100_000n);
  } else {
    await setTerms(rt.ctx, persona.address, slotId, start, floor, 3600n, 0, 0, 0n);
  }
  await waitForSlot(rt.api, slotId.toString());
  return { ok: true, detail: `minted slot ${slotId} ${domain}` };
}

async function tweakTerms(rt: Runtime, persona: Persona, slotId: string): Promise<ExecResult> {
  const slots = await rt.api.listSlots();
  const slot = slots.find((s) => s.slotId === slotId);
  if (slot?.terms?.saleMode === 1) {
    const floor = BigInt(slot.terms.floorCpc || '100000');
    const hash = await setTerms(rt.ctx, persona.address, BigInt(slotId), 0n, 0n, 0n, 0, 1, floor);
    return { ok: true, detail: `set_terms CPC slot ${slotId}`, tx: hash };
  }
  const start = 8_000_000n + BigInt(Math.floor(rt.rng() * 4_000_000));
  const floor = 1_000_000n;
  const hash = await setTerms(rt.ctx, persona.address, BigInt(slotId), start, floor, 3600n, 0, 0, 0n);
  return { ok: true, detail: `set_terms slot ${slotId}`, tx: hash };
}

async function pause(
  rt: Runtime,
  persona: Persona,
  slotId: string,
  paused: boolean,
): Promise<ExecResult> {
  const hash = await setPaused(rt.ctx, persona.address, BigInt(slotId), paused);
  return { ok: true, detail: `set_paused ${paused} slot ${slotId}`, tx: hash };
}

async function houseAd(rt: Runtime, persona: Persona, slotId: string): Promise<ExecResult> {
  const slots = await rt.api.listSlots();
  const slot = slots.find((s) => s.slotId === slotId);
  const asset = assetForSize(rt.catalog, slot?.width ?? 300, slot?.height ?? 250);
  await rt.api.siwe(signMessage(rt.ctx, persona.address));
  await rt.api.putHouseAd(
    slotId,
    { mediaUrl: `${rt.mediaBase}/media/${asset.name}`, clickUrl: 'https://openad.example' },
    persona.address,
  );
  return { ok: true, detail: `house ad slot ${slotId}` };
}

async function approve(
  rt: Runtime,
  persona: Persona,
  creativeId: string,
  approved: boolean,
): Promise<ExecResult> {
  const hash = await setApproval(rt.ctx, persona.address, BigInt(creativeId), approved);
  return { ok: true, detail: `set_approval ${approved} creative ${creativeId}`, tx: hash };
}

async function register(rt: Runtime, persona: Persona): Promise<ExecResult> {
  const pubs = publishers();
  const pub = pubs[Math.floor(rt.rng() * pubs.length)] ?? pubs[0];
  const slots = (await rt.api.listSlots()).filter(
    (s) => s.owner.toLowerCase() === (pub?.address.toLowerCase() ?? ''),
  );
  const w = slots[0]?.width ?? 300;
  const h = slots[0]?.height ?? 250;
  const asset = assetForSize(rt.catalog, w, h);
  const id = await registerMedia(rt.ctx, persona.address, {
    uri: `${rt.mediaBase}/media/${asset.name}`,
    contentHash: asset.hash,
    mime: 'image/png',
    width: asset.width,
    height: asset.height,
    clickUrl: 'https://openad.example',
  });
  try {
    await rt.api.siwe(signMessage(rt.ctx, persona.address));
    const rec = await rt.api.verifyCreative(id.toString(), persona.address);
    if (rec.verificationStatus.startsWith('failed')) {
      console.warn(
        `sim: creative ${id} ${rec.verificationStatus} — API must run OPENAD_ENV=dev on the host to fetch sim media`,
      );
    }
  } catch (err) {
    console.warn(`sim: verify creative ${id} skipped:`, err instanceof Error ? err.message : err);
  }
  return { ok: true, detail: `register_media ${id}` };
}

async function request(
  rt: Runtime,
  persona: Persona,
  publisher: string,
  creativeId: string,
): Promise<ExecResult> {
  const hash = await requestApproval(
    rt.ctx,
    persona.address,
    publisher as Address,
    BigInt(creativeId),
  );
  return { ok: true, detail: `request_approval ${creativeId} -> ${publisher}`, tx: hash };
}

async function doBuy(
  rt: Runtime,
  persona: Persona,
  chosen: ChosenAction,
  permit: boolean,
): Promise<ExecResult> {
  const slotId = BigInt(chosen.params.slotId ?? '0');
  const periodIndex = BigInt(chosen.params.periodIndex ?? '0');
  const creativeId = BigInt(chosen.params.creativeId ?? '0');
  const maxPrice = BigInt(chosen.params.maxPrice ?? '0');
  const hash = permit
    ? await buyWithPermit(rt.ctx, persona.address, slotId, periodIndex, creativeId, maxPrice)
    : await buy(rt.ctx, persona.address, slotId, periodIndex, creativeId, maxPrice);
  return {
    ok: true,
    detail: `${permit ? 'buy_with_permit' : 'buy'} slot ${slotId} period ${periodIndex}`,
    tx: hash,
  };
}

async function doOpenCampaign(
  rt: Runtime,
  persona: Persona,
  chosen: ChosenAction,
): Promise<ExecResult> {
  const hash = await openCampaignWithPermit(
    rt.ctx,
    persona.address,
    BigInt(chosen.params.slotId ?? '0'),
    BigInt(chosen.params.creativeId ?? '0'),
    BigInt(chosen.params.maxCpc ?? '0'),
    BigInt(chosen.params.budget ?? '0'),
  );
  return {
    ok: true,
    detail: `open_campaign slot ${chosen.params.slotId}`,
    tx: hash,
  };
}

async function doTopUp(
  rt: Runtime,
  persona: Persona,
  chosen: ChosenAction,
): Promise<ExecResult> {
  const hash = await topUpCampaignWithPermit(
    rt.ctx,
    persona.address,
    BigInt(chosen.params.campaignId ?? '0'),
    BigInt(chosen.params.amount ?? '0'),
  );
  return {
    ok: true,
    detail: `top_up_campaign ${chosen.params.campaignId}`,
    tx: hash,
  };
}
