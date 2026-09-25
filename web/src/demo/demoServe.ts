/** Demo serve response builder (ADR-0016, ROADMAP 6.2 step 10+11).
 *
 * Mirrors `api/src/openad/schemas/serve.py` field for field (via the shared `embed/src/types.ts`
 * contract) so `/embed-demo` can mount the real, unedited `<open-ad>` element and get back
 * exactly the shape it expects — answered in-process by the network guard's demo responder
 * (`networkGuard.ts`), never a real fetch (docs/PROTOCOL.md §7: serve never reads the chain).
 *
 * Precedence, a documented simplification of the real serve path (docs/ARCHITECTURE.md §3.4):
 * the lease covering `now`, else the campaign with the highest `maxCpc` among open, unpaused
 * campaigns on the slot, else the slot's house ad, else empty.
 */
import type { ServeCreative, ServeResponse, ServeStatus } from '../../../embed/src/types';
import { assetUrl } from './assetUrl';
import type { DemoCampaign, DemoState } from './fixtures';

const SERVE_TTL = 30;

function findFixture(state: DemoState, slotId: string) {
  return state.slots.find((s) => s.slot.slotId === slotId);
}

/** The lease active at `now`, if any: the slot's calendar period covering `now` that has a
 * recorded lease. */
function activeLease(
  state: DemoState,
  slotId: string,
  now: number,
): { advertiser: string; creativeId: string; end: number } | null {
  const fixture = findFixture(state, slotId);
  if (!fixture) return null;
  const { periodSeconds, firstPeriodStart, calendarVersion } = fixture.slot;
  if (calendarVersion === 0 || periodSeconds == null || firstPeriodStart == null) return null;
  if (now < firstPeriodStart) return null;
  const idx = Math.floor((now - firstPeriodStart) / periodSeconds);
  const lease = fixture.leases[idx];
  if (!lease) return null;
  const end = firstPeriodStart + (idx + 1) * periodSeconds;
  if (now >= end) return null;
  return { advertiser: lease.lessee, creativeId: lease.creativeId, end };
}

/** The campaign with the highest `maxCpc` among this slot's open, unpaused campaigns — a
 * documented simplification of the protocol's GSP matching (real matching happens at serve time
 * against payable clicks, which the demo has no traffic to simulate). */
export function topCampaign(state: DemoState, slotId: string): DemoCampaign | null {
  let best: DemoCampaign | null = null;
  for (const campaign of Object.values(state.campaigns)) {
    if (campaign.slotId !== slotId || campaign.closed || campaign.paused) continue;
    if (BigInt(campaign.remaining) <= 0n) continue;
    if (!best || BigInt(campaign.maxCpc) > BigInt(best.maxCpc)) best = campaign;
  }
  return best;
}

function creativeToServe(state: DemoState, creativeId: string): ServeCreative | null {
  const creative = state.creatives[creativeId];
  if (!creative || creative.revoked) return null;
  return {
    kind: 'image',
    mediaUrl: assetUrl(creative.uri),
    clickUrl: creative.clickUrl,
    width: creative.width,
    height: creative.height,
    alt: 'Sponsored',
  };
}

/** Builds the `ServeResponse` for `slotId` at `now`, from the current demo state. Never throws:
 * an unknown slot resolves to `status: "unknown"` with a null creative, matching the real serve
 * endpoint's behaviour for an id it does not recognize. */
export function buildServeResponse(state: DemoState, slotId: string, now: number): ServeResponse {
  const fixture = findFixture(state, slotId);
  if (!fixture) {
    return {
      slotId,
      status: 'unknown',
      creative: null,
      lease: null,
      campaign: null,
      ttl: SERVE_TTL,
    };
  }

  const lease = activeLease(state, slotId, now);
  if (lease) {
    const creative = creativeToServe(state, lease.creativeId);
    if (creative) {
      return {
        slotId,
        status: 'lease' satisfies ServeStatus,
        creative,
        lease: {
          advertiser: lease.advertiser,
          expiresAt: new Date(lease.end * 1000).toISOString(),
        },
        campaign: null,
        ttl: SERVE_TTL,
      };
    }
  }

  const campaign = topCampaign(state, slotId);
  if (campaign) {
    const creative = creativeToServe(state, campaign.creativeId);
    if (creative) {
      return {
        slotId,
        status: 'campaign' satisfies ServeStatus,
        creative,
        lease: null,
        campaign: { advertiser: campaign.advertiser, campaignId: campaign.campaignId },
        ttl: SERVE_TTL,
      };
    }
  }

  const house = state.houseAds[slotId];
  if (house) {
    return {
      slotId,
      status: 'house' satisfies ServeStatus,
      creative: {
        kind: 'image',
        mediaUrl: house.mediaUrl,
        clickUrl: house.clickUrl,
        width: fixture.slot.width,
        height: fixture.slot.height,
        alt: 'Sponsored',
      },
      lease: null,
      campaign: null,
      ttl: SERVE_TTL,
    };
  }

  return {
    slotId,
    status: 'empty' satisfies ServeStatus,
    creative: null,
    lease: null,
    campaign: null,
    ttl: SERVE_TTL,
  };
}
