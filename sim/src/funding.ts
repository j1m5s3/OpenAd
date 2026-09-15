import type { Address } from 'viem';

import { advertisers, PERSONAS } from './accounts.js';
import {
  type ChainCtx,
  usdcAllowance,
  usdcApprove,
  usdcBalance,
  usdcTransfer,
} from './chain.js';

export function usdcDeficit(balance: bigint, target: bigint): bigint {
  return balance >= target ? 0n : target - balance;
}

export async function fundPersonas(ctx: ChainCtx, target: bigint): Promise<void> {
  for (const p of PERSONAS) {
    const bal = await usdcBalance(ctx, p.address);
    const need = usdcDeficit(bal, target);
    if (need > 0n) {
      await usdcTransfer(ctx, p.address, need);
    }
  }
  const spender = ctx.contracts.Marketplace.address;
  const allowanceTarget = target * 10n;
  for (const p of advertisers()) {
    const allowed = await usdcAllowance(ctx, p.address, spender);
    if (allowed < target) {
      await usdcApprove(ctx, p.address, spender as Address, allowanceTarget);
    }
  }
}
