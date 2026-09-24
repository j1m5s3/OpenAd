import { describe, expect, it } from 'vitest';

import { dutchPrice, feeSplit } from '../lib/auction';
import { DEMO_CONTRACTS, DEMO_TREASURY } from './deployment';
import { DEMO_PERSONAS, seedDemoState } from './fixtures';
import { applyCall, balanceOf, DemoRevert, findSlot, quote } from './reducers';

const NOW = 1_800_000_000;
const DAY = 86_400;
const ADV = DEMO_PERSONAS.advertiserWallet.address;
const ADV_L2 = DEMO_PERSONAS.advertiserL2.address;
const PUB_EXPLORER = DEMO_PERSONAS.publisherExplorer.address;
const PUB_NEWSLETTER = DEMO_PERSONAS.publisherNewsletter.address;
const DEADLINE = BigInt(NOW + 3600);
const R = `0x${'1'.repeat(64)}`;
const S = `0x${'2'.repeat(64)}`;

function revertReason(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    if (err instanceof DemoRevert) return err.reason;
    throw err;
  }
  throw new Error('expected a revert');
}

describe('Marketplace.buy_with_permit', () => {
  it('leases a period at the mid-decay Dutch price and splits it exactly (publisher + fee == price)', () => {
    const state = seedDemoState(NOW);
    // Slot 4 (explorer tile): LEASE, approval required, creative 3 approved; period 4 is mid-Dutch.
    const q = quote(state, 4n, 4n, NOW);
    expect(q.sellable).toBe(true);
    const start = Number(q.start);
    const expected = dutchPrice(8_000_000n, 2_000_000n, DAY, start, NOW);
    expect(q.price).toBe(expected);
    expect(expected > 2_000_000n && expected < 8_000_000n).toBe(true);

    const { fee, publisherAmount } = feeSplit(expected);
    const { state: next } = applyCall(
      state,
      { contract: 'Marketplace', functionName: 'buy_with_permit', args: [4n, 4n, 3n, expected, DEADLINE, 27, R, S] },
      ADV,
      NOW,
    );

    expect(findSlot(next, '4')?.leases[4]).toEqual({ lessee: ADV, creativeId: '3', price: expected.toString() });
    expect(publisherAmount + fee).toBe(expected);
    expect(balanceOf(next, ADV)).toBe(balanceOf(state, ADV) - expected);
    expect(balanceOf(next, PUB_EXPLORER)).toBe(balanceOf(state, PUB_EXPLORER) + publisherAmount);
    expect(balanceOf(next, DEMO_TREASURY)).toBe(balanceOf(state, DEMO_TREASURY) + fee);
    expect(balanceOf(next, DEMO_CONTRACTS.Marketplace)).toBe(0n);
    // Pure: the input state is untouched.
    expect(findSlot(state, '4')?.leases[4]).toBeUndefined();
    // Permit consumed the nonce; the period is no longer sellable.
    expect(next.ledger.nonces[ADV.toLowerCase()]).toBe('1');
    expect(quote(next, 4n, 4n, NOW).reason).toBe('already leased');
  });

  it('reverts "cpc mode" on a CPC slot and changes nothing', () => {
    const state = seedDemoState(NOW);
    const call = {
      contract: 'Marketplace' as const,
      functionName: 'buy_with_permit',
      args: [1n, 0n, 3n, 10_000_000n, DEADLINE, 27, R, S],
    };
    expect(revertReason(() => applyCall(state, call, ADV, NOW))).toBe('cpc mode');
    expect(state).toEqual(seedDemoState(NOW));
  });

  it('reverts "price exceeds max" below the live price, and "not approved" without approval', () => {
    const state = seedDemoState(NOW);
    const price = quote(state, 4n, 4n, NOW).price;
    const buy = (creativeId: bigint, max: bigint, sender: string) =>
      applyCall(
        state,
        { contract: 'Marketplace', functionName: 'buy_with_permit', args: [4n, 4n, creativeId, max, DEADLINE, 27, R, S] },
        sender,
        NOW,
      );
    expect(revertReason(() => buy(3n, price - 1n, ADV))).toBe('price exceeds max');
    expect(revertReason(() => buy(3n, price, ADV_L2))).toBe('not creative owner');
  });
});

describe('CampaignVault', () => {
  it('open_campaign_with_permit escrows the budget (remaining == budget) and top_up adds to it', () => {
    const state = seedDemoState(NOW);
    const budget = 10_000_000n;
    // Slot 1: CPC, approval waived, 300x250; creative 3 is ADV's 300x250.
    const opened = applyCall(
      state,
      {
        contract: 'CampaignVault',
        functionName: 'open_campaign_with_permit',
        args: [1n, 3n, 50_000n, budget, 0n, 0n, DEADLINE, 27, R, S],
      },
      ADV,
      NOW,
    );
    const id = String(opened.result);
    const campaign = opened.state.campaigns[id];
    expect(campaign?.remaining).toBe(budget.toString());
    expect(campaign?.budget).toBe(budget.toString());
    expect(balanceOf(opened.state, ADV)).toBe(balanceOf(state, ADV) - budget);
    expect(balanceOf(opened.state, DEMO_CONTRACTS.CampaignVault)).toBe(
      balanceOf(state, DEMO_CONTRACTS.CampaignVault) + budget,
    );

    const toppedUp = applyCall(
      opened.state,
      { contract: 'CampaignVault', functionName: 'top_up_with_permit', args: [BigInt(id), 5_000_000n, DEADLINE, 27, R, S] },
      ADV,
      NOW,
    );
    expect(toppedUp.state.campaigns[id]?.remaining).toBe('15000000');
    // Vault holds exactly the open campaigns' remaining (PROTOCOL §11 invariant 11).
    const openRemaining = Object.values(toppedUp.state.campaigns)
      .filter((c) => !c.closed)
      .reduce((sum, c) => sum + BigInt(c.remaining), 0n);
    expect(balanceOf(toppedUp.state, DEMO_CONTRACTS.CampaignVault)).toBe(openRemaining);
  });

  it('reverts "lease mode" when opening a campaign on a LEASE slot', () => {
    const state = seedDemoState(NOW);
    const call = {
      contract: 'CampaignVault' as const,
      functionName: 'open_campaign_with_permit',
      args: [4n, 3n, 50_000n, 1_000_000n, 0n, 0n, DEADLINE, 27, R, S],
    };
    expect(revertReason(() => applyCall(state, call, ADV, NOW))).toBe('lease mode');
  });
});

describe('AdSlot and CreativeRegistry', () => {
  it('mint_slot creates a slot owned by the sender with no calendar yet', () => {
    const state = seedDemoState(NOW);
    const { state: next, result } = applyCall(
      state,
      { contract: 'AdSlot', functionName: 'mint_slot', args: [{ width: 300, height: 250, kind: 0, domain: 'new.example' }] },
      PUB_NEWSLETTER,
      NOW,
    );
    const minted = findSlot(next, String(result));
    expect(minted?.slot.owner).toBe(PUB_NEWSLETTER);
    expect(minted?.slot.calendarVersion).toBe(0);
    expect(next.slots).toHaveLength(state.slots.length + 1);
  });

  it('request_approval then set_approval flips the approval to APPROVED', () => {
    const state = seedDemoState(NOW);
    const status = (s: typeof state) =>
      s.approvals.find((a) => a.publisher === PUB_EXPLORER && a.creativeId === '2')?.status;
    const requested = applyCall(
      state,
      { contract: 'CreativeRegistry', functionName: 'request_approval', args: [PUB_EXPLORER, 2n] },
      ADV_L2,
      NOW,
    ).state;
    expect(status(requested)).toBe(1);
    const approved = applyCall(
      requested,
      { contract: 'CreativeRegistry', functionName: 'set_approval', args: [2n, true] },
      PUB_EXPLORER,
      NOW,
    ).state;
    expect(status(approved)).toBe(2);
  });
});
