/** Demo contract view functions (ADR-0016): answers the `eth_call`s the web app makes, from the
 * same `DemoState` the reducers write. Return values are shaped for viem's
 * `encodeFunctionResult` (bigint for uints, objects for named tuples). */
import { FEE_BPS } from '../lib/auction';
import { DEMO_CONTRACTS, DEMO_TREASURY } from './deployment';
import type { DemoState } from './fixtures';
import {
  allowanceOf,
  approvalStatus,
  balanceOf,
  DEMO_CLOSE_DELAY_SECONDS,
  DemoRevert,
  type DemoCall,
  findSlot,
  isAdvertiserAllowed,
  isApprovedFor,
  nonceOf,
  periodWindow,
  quote,
  termsOf,
} from './reducers';

/** MockUSDC's EIP-2612 domain name (`contracts/src/mocks/MockUSDC.vy`). */
export const DEMO_USDC_NAME = 'USD Coin (Mock)';

const big = (value: unknown) => BigInt(value as bigint | number | string);
const str = (value: unknown) => String(value);

function termsTuple(state: DemoState, slotId: bigint) {
  const t = termsOf(state, slotId);
  return {
    start_price: BigInt(t.startPrice),
    floor_price: BigInt(t.floorPrice),
    lead_seconds: BigInt(t.leadSeconds),
    sale_end: BigInt(t.saleEnd),
    approval_mode: t.approvalMode,
    sale_mode: t.saleMode,
    floor_cpc: BigInt(t.floorCpc),
    paused: t.paused,
  };
}

function slotOwner(state: DemoState, slotId: bigint): string {
  const fixture = findSlot(state, slotId);
  if (!fixture) throw new DemoRevert('erc721: invalid token ID');
  return fixture.slot.owner;
}

/** Answers one view call. Throws `DemoRevert` for reverting views and for anything the demo does
 * not model (so a missing read fails loudly rather than returning a plausible zero). */
export function readCall(state: DemoState, call: DemoCall, now: number): unknown {
  const a = call.args;
  const key = `${call.contract}.${call.functionName}`;
  switch (key) {
    // --- USDC (MockUSDC) ---
    case 'USDC.balanceOf':
      return balanceOf(state, str(a[0]));
    case 'USDC.allowance':
      return allowanceOf(state, str(a[0]), str(a[1]));
    case 'USDC.nonces':
      return nonceOf(state, str(a[0]));
    case 'USDC.name':
      return DEMO_USDC_NAME;
    case 'USDC.symbol':
      return 'USDC';
    case 'USDC.decimals':
      return 6;
    case 'USDC.totalSupply':
      return Object.values(state.ledger.usdc).reduce((sum, v) => sum + BigInt(v), 0n);

    // --- Marketplace ---
    case 'Marketplace.quote':
      return quote(state, big(a[0]), big(a[1]), now);
    case 'Marketplace.price': {
      const q = quote(state, big(a[0]), big(a[1]), now);
      if (!q.sellable && q.reason !== 'already leased') throw new DemoRevert(q.reason);
      return q.price;
    }
    case 'Marketplace.terms_of':
      return termsTuple(state, big(a[0]));
    case 'Marketplace.fee_bps':
    case 'CampaignVault.fee_bps':
      return Number(FEE_BPS);
    case 'Marketplace.treasury':
    case 'CampaignVault.treasury':
      return DEMO_TREASURY;
    case 'Marketplace.USDC':
    case 'CampaignVault.USDC':
      return DEMO_CONTRACTS.USDC;
    case 'Marketplace.AD_SLOT':
    case 'CampaignVault.AD_SLOT':
      return DEMO_CONTRACTS.AdSlot;
    case 'Marketplace.REGISTRY':
    case 'CampaignVault.REGISTRY':
      return DEMO_CONTRACTS.CreativeRegistry;
    case 'Marketplace.campaign_vault':
    case 'CampaignVault.MARKETPLACE':
      return key.startsWith('Marketplace')
        ? DEMO_CONTRACTS.CampaignVault
        : DEMO_CONTRACTS.Marketplace;

    // --- AdSlot ---
    case 'AdSlot.ownerOf':
      return slotOwner(state, big(a[0]));
    case 'AdSlot.balanceOf':
      return BigInt(
        state.slots.filter((s) => s.slot.owner.toLowerCase() === str(a[0]).toLowerCase()).length,
      );
    case 'AdSlot.spec_of': {
      const slot = findSlot(state, big(a[0]))?.slot;
      return {
        width: slot?.width ?? 0,
        height: slot?.height ?? 0,
        kind: slot?.kind ?? 0,
        domain: slot?.domain ?? '',
      };
    }
    case 'AdSlot.calendar_of': {
      const slot = findSlot(state, big(a[0]))?.slot;
      return {
        version: slot?.calendarVersion ?? 0,
        period_seconds: BigInt(slot?.periodSeconds ?? 0),
        first_period_start: BigInt(slot?.firstPeriodStart ?? 0),
      };
    }
    case 'AdSlot.period_window': {
      const { start, end } = periodWindow(state, big(a[0]), big(a[1]));
      return [BigInt(start), BigInt(end)];
    }

    // --- CreativeRegistry ---
    case 'CreativeRegistry.approval_status':
      return approvalStatus(state, str(a[0]), big(a[1]));
    case 'CreativeRegistry.is_approved_for':
      return isApprovedFor(state, str(a[0]), big(a[1]));
    case 'CreativeRegistry.is_advertiser_allowed':
      return isAdvertiserAllowed(state, str(a[0]), str(a[1]));
    case 'CreativeRegistry.is_active': {
      const creative = state.creatives[str(a[0])];
      return Boolean(creative && !creative.revoked);
    }

    // --- CampaignVault ---
    case 'CampaignVault.campaign_count':
      return BigInt(Object.keys(state.campaigns).length);
    case 'CampaignVault.open_campaigns_of':
      return BigInt(
        Object.values(state.campaigns).filter((c) => c.slotId === str(a[0]) && !c.closed).length,
      );
    case 'CampaignVault.close_delay_seconds':
      return BigInt(DEMO_CLOSE_DELAY_SECONDS);

    default:
      throw new DemoRevert(`demo: ${key} is not simulated`);
  }
}
