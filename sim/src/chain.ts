import {
  createPublicClient,
  createWalletClient,
  http,
  type Account,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { FUNDER, PERSONAS } from './accounts.js';
import type { ProtocolContracts } from './deployments.js';
import { splitSignature, usdcPermitTypes } from './permit.js';

export type QuoteView = {
  sellable: boolean;
  reason: string;
  price: bigint;
};

export type ChainCtx = {
  publicClient: PublicClient;
  contracts: ProtocolContracts;
  accountOf: Map<string, Account>;
  walletOf: Map<string, WalletClient>;
  funderWallet: WalletClient;
  funderAccount: Account;
};

export function createChain(rpcUrl: string, contracts: ProtocolContracts): ChainCtx {
  const publicClient = createPublicClient({ chain: foundry, transport: http(rpcUrl) });
  const accountOf = new Map<string, Account>();
  const walletOf = new Map<string, WalletClient>();
  for (const p of PERSONAS) {
    const account = privateKeyToAccount(p.privateKey);
    if (account.address.toLowerCase() !== p.address.toLowerCase()) {
      throw new Error(`persona ${p.id} key does not match ${p.address}`);
    }
    accountOf.set(p.address.toLowerCase(), account);
    walletOf.set(
      p.address.toLowerCase(),
      createWalletClient({ account, chain: foundry, transport: http(rpcUrl) }),
    );
  }
  const funderAccount = privateKeyToAccount(FUNDER.privateKey);
  const funderWallet = createWalletClient({
    account: funderAccount,
    chain: foundry,
    transport: http(rpcUrl),
  });
  return { publicClient, contracts, accountOf, walletOf, funderWallet, funderAccount };
}

function wallet(ctx: ChainCtx, address: Address): WalletClient {
  const w = ctx.walletOf.get(address.toLowerCase());
  if (!w) throw new Error(`no sim wallet for ${address}`);
  return w;
}

function account(ctx: ChainCtx, address: Address): Account {
  const a = ctx.accountOf.get(address.toLowerCase());
  if (!a) throw new Error(`no sim account for ${address}`);
  return a;
}

async function send(
  ctx: ChainCtx,
  from: Address,
  params: { address: Address; abi: ProtocolContracts[keyof ProtocolContracts]['abi']; functionName: string; args: readonly unknown[] },
): Promise<Hex> {
  const hash = await wallet(ctx, from).writeContract({
    chain: foundry,
    account: account(ctx, from),
    address: params.address,
    abi: params.abi,
    functionName: params.functionName,
    args: params.args,
  } as never);
  await ctx.publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function mintSlot(
  ctx: ChainCtx,
  publisher: Address,
  spec: { width: number; height: number; kind: number; domain: string },
): Promise<bigint> {
  const { request, result } = await ctx.publicClient.simulateContract({
    account: account(ctx, publisher),
    address: ctx.contracts.AdSlot.address,
    abi: ctx.contracts.AdSlot.abi,
    functionName: 'mint_slot',
    args: [spec],
  });
  const hash = await wallet(ctx, publisher).writeContract(request);
  await ctx.publicClient.waitForTransactionReceipt({ hash });
  return result as bigint;
}

export async function setCalendar(
  ctx: ChainCtx,
  publisher: Address,
  slotId: bigint,
  periodSeconds: bigint,
  firstStart: bigint,
): Promise<Hex> {
  return send(ctx, publisher, {
    ...ctx.contracts.AdSlot,
    functionName: 'set_calendar',
    args: [slotId, periodSeconds, firstStart],
  });
}

export async function setTerms(
  ctx: ChainCtx,
  publisher: Address,
  slotId: bigint,
  startPrice: bigint,
  floorPrice: bigint,
  leadSeconds: bigint,
  approvalMode: number,
  saleMode = 0,
  floorCpc = 0n,
): Promise<Hex> {
  return send(ctx, publisher, {
    ...ctx.contracts.Marketplace,
    functionName: 'set_terms',
    args: [slotId, startPrice, floorPrice, leadSeconds, 0n, approvalMode, saleMode, floorCpc],
  });
}

export async function setPaused(
  ctx: ChainCtx,
  publisher: Address,
  slotId: bigint,
  paused: boolean,
): Promise<Hex> {
  return send(ctx, publisher, {
    ...ctx.contracts.Marketplace,
    functionName: 'set_paused',
    args: [slotId, paused],
  });
}

export async function registerMedia(
  ctx: ChainCtx,
  advertiser: Address,
  args: {
    uri: string;
    contentHash: Hex;
    mime: string;
    width: number;
    height: number;
    clickUrl: string;
  },
): Promise<bigint> {
  const { request, result } = await ctx.publicClient.simulateContract({
    account: account(ctx, advertiser),
    address: ctx.contracts.CreativeRegistry.address,
    abi: ctx.contracts.CreativeRegistry.abi,
    functionName: 'register_media',
    args: [args.uri, args.contentHash, args.mime, args.width, args.height, args.clickUrl],
  });
  const hash = await wallet(ctx, advertiser).writeContract(request);
  await ctx.publicClient.waitForTransactionReceipt({ hash });
  return result as bigint;
}

export async function requestApproval(
  ctx: ChainCtx,
  advertiser: Address,
  publisher: Address,
  creativeId: bigint,
): Promise<Hex> {
  return send(ctx, advertiser, {
    ...ctx.contracts.CreativeRegistry,
    functionName: 'request_approval',
    args: [publisher, creativeId],
  });
}

export async function setApproval(
  ctx: ChainCtx,
  publisher: Address,
  creativeId: bigint,
  approved: boolean,
): Promise<Hex> {
  return send(ctx, publisher, {
    ...ctx.contracts.CreativeRegistry,
    functionName: 'set_approval',
    args: [creativeId, approved],
  });
}

export async function buy(
  ctx: ChainCtx,
  advertiser: Address,
  slotId: bigint,
  periodIndex: bigint,
  creativeId: bigint,
  maxPrice: bigint,
): Promise<Hex> {
  return send(ctx, advertiser, {
    ...ctx.contracts.Marketplace,
    functionName: 'buy',
    args: [slotId, periodIndex, creativeId, maxPrice],
  });
}

export async function buyWithPermit(
  ctx: ChainCtx,
  advertiser: Address,
  slotId: bigint,
  periodIndex: bigint,
  creativeId: bigint,
  maxPrice: bigint,
): Promise<Hex> {
  const owner = account(ctx, advertiser);
  const nonce = (await ctx.publicClient.readContract({
    ...ctx.contracts.USDC,
    functionName: 'nonces',
    args: [owner.address],
  })) as bigint;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const signature = await wallet(ctx, advertiser).signTypedData({
    account: owner,
    domain: {
      name: 'USD Coin (Mock)',
      version: '2',
      chainId: foundry.id,
      verifyingContract: ctx.contracts.USDC.address,
    },
    types: usdcPermitTypes,
    primaryType: 'Permit',
    message: {
      owner: owner.address,
      spender: ctx.contracts.Marketplace.address,
      value: maxPrice,
      nonce,
      deadline,
    },
  });
  const { v, r, s } = splitSignature(signature);
  return send(ctx, advertiser, {
    ...ctx.contracts.Marketplace,
    functionName: 'buy_with_permit',
    args: [slotId, periodIndex, creativeId, maxPrice, deadline, v, r, s],
  });
}

export async function quote(
  ctx: ChainCtx,
  slotId: bigint,
  periodIndex: bigint,
): Promise<QuoteView> {
  const raw = await ctx.publicClient.readContract({
    ...ctx.contracts.Marketplace,
    functionName: 'quote',
    args: [slotId, periodIndex],
  });
  if (Array.isArray(raw)) {
    return { sellable: Boolean(raw[0]), reason: String(raw[1]), price: raw[2] as bigint };
  }
  const o = raw as { sellable: boolean; reason: string; price: bigint };
  return { sellable: o.sellable, reason: o.reason, price: o.price };
}

export async function usdcBalance(ctx: ChainCtx, who: Address): Promise<bigint> {
  return ctx.publicClient.readContract({
    ...ctx.contracts.USDC,
    functionName: 'balanceOf',
    args: [who],
  }) as Promise<bigint>;
}

export async function usdcAllowance(ctx: ChainCtx, owner: Address, spender: Address): Promise<bigint> {
  return ctx.publicClient.readContract({
    ...ctx.contracts.USDC,
    functionName: 'allowance',
    args: [owner, spender],
  }) as Promise<bigint>;
}

export async function usdcTransfer(ctx: ChainCtx, to: Address, amount: bigint): Promise<Hex> {
  const hash = await ctx.funderWallet.writeContract({
    chain: foundry,
    account: ctx.funderAccount,
    address: ctx.contracts.USDC.address,
    abi: ctx.contracts.USDC.abi,
    functionName: 'transfer',
    args: [to, amount],
  } as never);
  await ctx.publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function usdcApprove(
  ctx: ChainCtx,
  owner: Address,
  spender: Address,
  amount: bigint,
): Promise<Hex> {
  return send(ctx, owner, {
    ...ctx.contracts.USDC,
    functionName: 'approve',
    args: [spender, amount],
  });
}

export async function openCampaignWithPermit(
  ctx: ChainCtx,
  advertiser: Address,
  slotId: bigint,
  creativeId: bigint,
  maxCpc: bigint,
  budget: bigint,
): Promise<Hex> {
  const owner = account(ctx, advertiser);
  const nonce = (await ctx.publicClient.readContract({
    ...ctx.contracts.USDC,
    functionName: 'nonces',
    args: [owner.address],
  })) as bigint;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const signature = await wallet(ctx, advertiser).signTypedData({
    account: owner,
    domain: {
      name: 'USD Coin (Mock)',
      version: '2',
      chainId: foundry.id,
      verifyingContract: ctx.contracts.USDC.address,
    },
    types: usdcPermitTypes,
    primaryType: 'Permit',
    message: {
      owner: owner.address,
      spender: ctx.contracts.CampaignVault.address,
      value: budget,
      nonce,
      deadline,
    },
  });
  const { v, r, s } = splitSignature(signature);
  return send(ctx, advertiser, {
    ...ctx.contracts.CampaignVault,
    functionName: 'open_campaign_with_permit',
    args: [slotId, creativeId, maxCpc, budget, 0n, 0n, deadline, v, r, s],
  });
}

export async function topUpCampaignWithPermit(
  ctx: ChainCtx,
  advertiser: Address,
  campaignId: bigint,
  amount: bigint,
): Promise<Hex> {
  const owner = account(ctx, advertiser);
  const nonce = (await ctx.publicClient.readContract({
    ...ctx.contracts.USDC,
    functionName: 'nonces',
    args: [owner.address],
  })) as bigint;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const signature = await wallet(ctx, advertiser).signTypedData({
    account: owner,
    domain: {
      name: 'USD Coin (Mock)',
      version: '2',
      chainId: foundry.id,
      verifyingContract: ctx.contracts.USDC.address,
    },
    types: usdcPermitTypes,
    primaryType: 'Permit',
    message: {
      owner: owner.address,
      spender: ctx.contracts.CampaignVault.address,
      value: amount,
      nonce,
      deadline,
    },
  });
  const { v, r, s } = splitSignature(signature);
  return send(ctx, advertiser, {
    ...ctx.contracts.CampaignVault,
    functionName: 'top_up_with_permit',
    args: [campaignId, amount, deadline, v, r, s],
  });
}

export function signMessage(
  ctx: ChainCtx,
  address: Address,
): { address: Address; signMessage: (args: { message: string }) => Promise<Hex> } {
  const acc = account(ctx, address);
  const w = wallet(ctx, address);
  return {
    address: acc.address,
    signMessage: (args) => w.signMessage({ account: acc, message: args.message }),
  };
}
