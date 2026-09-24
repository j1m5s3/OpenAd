/** Demo contract model (ADR-0016): pure reducers for every write the web app sends, and the
 * view functions it reads, mirroring `contracts/src/*.vy` closely enough that the numbers and
 * revert reasons a demo visitor sees are the protocol's own (PROTOCOL §4, §11).
 *
 * `applyCall(state, call, sender, now)` never mutates its input: it works on a clone and either
 * returns the next state (plus the function's return value) or throws `DemoRevert` with the same
 * reason string the contract would revert with — so a failed call changes nothing, like a
 * reverted transaction. No signatures are checked: demo permits carry fake signatures, and the
 * simulator stands in for the chain. */
import { dutchPrice, FEE_BPS, feeSplit, remainderPrice } from '../lib/auction';
import type { CreativeOut, SlotOut } from '../lib/api';
import type { ProtocolContract } from '../lib/deployments';
import { DEMO_CONTRACTS, DEMO_TREASURY } from './deployment';
import type { DemoCampaign, DemoSlotFixture, DemoState } from './fixtures';

export interface DemoCall {
  contract: ProtocolContract;
  functionName: string;
  args: readonly unknown[];
}

export interface DemoCallResult {
  state: DemoState;
  /** The function's return value (e.g. a new slot/creative/campaign id), if it has one. */
  result?: unknown;
}

/** A contract revert, carrying the contract's own reason string (e.g. `"cpc mode"`). */
export class DemoRevert extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(`execution reverted: ${reason}`);
    this.name = 'DemoRevert';
    this.reason = reason;
  }
}

// Protocol constants (contracts/src/*.vy).
const APPROVAL_REQUIRED = 0;
const SALE_CPC = 1;
const KIND_MEDIA = 0;
const SLOT_KIND_WEB_DISPLAY = 0;
const SLOT_KIND_OTHER = 3;
const MIN_PERIOD_SECONDS = 3600n;
const NFT_ERC721 = 1;
const NFT_ERC1155 = 2;
const STATUS_NONE = 0;
const STATUS_REQUESTED = 1;
const STATUS_APPROVED = 2;
const STATUS_REJECTED = 3;
const STATUS_REVOKED = 4;
/** `CampaignVault.DEFAULT_CLOSE_DELAY`. */
export const DEMO_CLOSE_DELAY_SECONDS = 3600;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const ZERO_HASH = `0x${'0'.repeat(64)}`;

type Terms = NonNullable<SlotOut['terms']>;

function revert(reason: string): never {
  throw new DemoRevert(reason);
}

function ensure(condition: unknown, reason: string): asserts condition {
  if (!condition) revert(reason);
}

const lc = (address: string) => address.toLowerCase();
const big = (value: unknown) => BigInt(value as bigint | number | string);
const num = (value: unknown) => Number(value as bigint | number | string);
const str = (value: unknown) => String(value);

// ---------------------------------------------------------------------------------------------
// USDC ledger (MockUSDC / snekmate erc20)
// ---------------------------------------------------------------------------------------------

export function balanceOf(state: DemoState, owner: string): bigint {
  return BigInt(state.ledger.usdc[lc(owner)] ?? '0');
}

export function allowanceOf(state: DemoState, owner: string, spender: string): bigint {
  return BigInt(state.ledger.allowances[`${lc(owner)}:${lc(spender)}`] ?? '0');
}

export function nonceOf(state: DemoState, owner: string): bigint {
  return BigInt(state.ledger.nonces[lc(owner)] ?? '0');
}

function transfer(state: DemoState, from: string, to: string, amount: bigint): void {
  const fromBalance = balanceOf(state, from);
  ensure(fromBalance >= amount, 'erc20: transfer amount exceeds balance');
  state.ledger.usdc[lc(from)] = (fromBalance - amount).toString();
  state.ledger.usdc[lc(to)] = (balanceOf(state, to) + amount).toString();
}

function transferFrom(state: DemoState, spender: string, from: string, to: string, amount: bigint): void {
  const allowance = allowanceOf(state, from, spender);
  ensure(allowance >= amount, 'erc20: insufficient allowance');
  state.ledger.allowances[`${lc(from)}:${lc(spender)}`] = (allowance - amount).toString();
  transfer(state, from, to, amount);
}

/** `_try_permit`: a NON-REVERTING EIP-2612 permit. The demo accepts any (fake) signature but still
 * honours the deadline and bumps the nonce, so a stale deadline fails later on allowance. */
function tryPermit(state: DemoState, owner: string, spender: string, value: bigint, deadline: bigint, now: number): void {
  if (deadline < BigInt(now)) return;
  state.ledger.allowances[`${lc(owner)}:${lc(spender)}`] = value.toString();
  state.ledger.nonces[lc(owner)] = (nonceOf(state, owner) + 1n).toString();
}

// ---------------------------------------------------------------------------------------------
// AdSlot
// ---------------------------------------------------------------------------------------------

export function findSlot(state: DemoState, slotId: bigint | string): DemoSlotFixture | undefined {
  return state.slots.find((s) => s.slot.slotId === String(slotId));
}

/** `AdSlot.period_window`: reverts "no calendar" when the slot has none. */
export function periodWindow(state: DemoState, slotId: bigint | string, periodIndex: bigint): { start: number; end: number } {
  const slot = findSlot(state, slotId)?.slot;
  ensure(slot && slot.calendarVersion !== 0 && slot.periodSeconds != null && slot.firstPeriodStart != null, 'no calendar');
  const start = slot.firstPeriodStart + Number(periodIndex) * slot.periodSeconds;
  return { start, end: start + slot.periodSeconds };
}

function lastLeasedEnd(fixture: DemoSlotFixture): number {
  const { periodSeconds, firstPeriodStart } = fixture.slot;
  if (periodSeconds == null || firstPeriodStart == null) return 0;
  return Object.keys(fixture.leases).reduce(
    (max, idx) => Math.max(max, firstPeriodStart + (Number(idx) + 1) * periodSeconds),
    0,
  );
}

function nextId(ids: Iterable<string>): string {
  let max = 0n;
  for (const id of ids) if (BigInt(id) > max) max = BigInt(id);
  return (max + 1n).toString();
}

// ---------------------------------------------------------------------------------------------
// CreativeRegistry
// ---------------------------------------------------------------------------------------------

export function approvalStatus(state: DemoState, publisher: string, creativeId: bigint | string): number {
  const found = state.approvals.find(
    (a) => lc(a.publisher) === lc(publisher) && a.creativeId === String(creativeId),
  );
  return found?.status ?? STATUS_NONE;
}

function setApprovalStatus(state: DemoState, publisher: string, creative: CreativeOut, status: number): void {
  const found = state.approvals.find(
    (a) => lc(a.publisher) === lc(publisher) && a.creativeId === creative.creativeId,
  );
  if (found) found.status = status;
  else state.approvals.push({ publisher, creativeId: creative.creativeId, status, advertiser: creative.advertiser });
}

function isActive(state: DemoState, creativeId: bigint | string): boolean {
  const c = state.creatives[String(creativeId)];
  return Boolean(c && !c.revoked);
}

function isBlockedFor(state: DemoState, publisher: string, creativeId: bigint | string): boolean {
  if (!isActive(state, creativeId)) return true;
  const status = approvalStatus(state, publisher, creativeId);
  return status === STATUS_REJECTED || status === STATUS_REVOKED;
}

export function isAdvertiserAllowed(state: DemoState, publisher: string, advertiser: string): boolean {
  return (state.ledger.allowedAdvertisers[lc(publisher)] ?? []).includes(lc(advertiser));
}

export function isApprovedFor(state: DemoState, publisher: string, creativeId: bigint | string): boolean {
  if (!isActive(state, creativeId) || isBlockedFor(state, publisher, creativeId)) return false;
  if (approvalStatus(state, publisher, creativeId) === STATUS_APPROVED) return true;
  const creative = state.creatives[String(creativeId)];
  return Boolean(creative && isAdvertiserAllowed(state, publisher, creative.advertiser));
}

function requireCreative(state: DemoState, creativeId: bigint | string): CreativeOut {
  const creative = state.creatives[String(creativeId)];
  ensure(creative, 'no creative');
  return creative;
}

/** The creative / dimension / approval checks shared by `Marketplace._buy` and
 * `CampaignVault._open_campaign`. */
function checkCreative(state: DemoState, fixture: DemoSlotFixture, terms: Terms, creativeId: bigint, sender: string): void {
  const publisher = fixture.slot.owner;
  const creative = state.creatives[creativeId.toString()];
  ensure(creative && lc(creative.advertiser) === lc(sender), 'not creative owner');
  if (creative.kind === KIND_MEDIA) {
    ensure(
      creative.width === fixture.slot.width && creative.height === fixture.slot.height,
      'dimension mismatch',
    );
  }
  if (terms.approvalMode === APPROVAL_REQUIRED) {
    ensure(isApprovedFor(state, publisher, creativeId), 'not approved');
  } else {
    ensure(isActive(state, creativeId) && !isBlockedFor(state, publisher, creativeId), 'creative blocked');
  }
}

// ---------------------------------------------------------------------------------------------
// Marketplace
// ---------------------------------------------------------------------------------------------

/** `Marketplace.terms_of`: zeroed terms when none were ever set. */
export function termsOf(state: DemoState, slotId: bigint | string): Terms {
  return (
    findSlot(state, slotId)?.slot.terms ?? {
      startPrice: '0',
      floorPrice: '0',
      leadSeconds: 0,
      saleEnd: 0,
      approvalMode: 0,
      saleMode: 0,
      floorCpc: '0',
      paused: false,
    }
  );
}

/** `Marketplace._dutch_price`: Dutch while `now < start`, remainder until `end`. */
function currentPrice(terms: Terms, start: number, end: number, now: number): bigint {
  const openAt = Math.max(0, start - terms.leadSeconds);
  ensure(now >= openAt, 'not open');
  ensure(now < end, 'closed');
  if (now < start) {
    return dutchPrice(BigInt(terms.startPrice), BigInt(terms.floorPrice), terms.leadSeconds, start, now);
  }
  return remainderPrice(BigInt(terms.floorPrice), end - start, end, now);
}

export interface DemoQuote {
  sellable: boolean;
  reason: string;
  price: bigint;
  fee: bigint;
  open_at: bigint;
  start: bigint;
  end: bigint;
}

/** `Marketplace.quote`: the non-reverting UI helper, same reason strings and order. */
export function quote(state: DemoState, slotId: bigint, periodIndex: bigint, now: number): DemoQuote {
  const q: DemoQuote = { sellable: false, reason: '', price: 0n, fee: 0n, open_at: 0n, start: 0n, end: 0n };
  const terms = termsOf(state, slotId);
  if (terms.saleMode === SALE_CPC) return { ...q, reason: 'cpc mode' };
  if (terms.leadSeconds === 0) return { ...q, reason: 'no terms' };
  if (terms.paused) return { ...q, reason: 'paused' };
  const fixture = findSlot(state, slotId);
  if (!fixture || fixture.slot.calendarVersion === 0) return { ...q, reason: 'no calendar' };
  const { start, end } = periodWindow(state, slotId, periodIndex);
  const openAt = Math.max(0, start - terms.leadSeconds);
  const window = { ...q, start: BigInt(start), end: BigInt(end), open_at: BigInt(openAt) };
  if (terms.saleEnd !== 0 && end > terms.saleEnd) return { ...window, reason: 'beyond sale end' };
  if (now < openAt) return { ...window, reason: 'not open' };
  if (now >= end) return { ...window, reason: 'closed' };
  if (fixture.leases[Number(periodIndex)]) return { ...window, reason: 'already leased' };
  const price = currentPrice(terms, start, end, now);
  return { ...window, sellable: true, price, fee: feeSplit(price, FEE_BPS).fee };
}

/** `Marketplace._buy`: one transaction — lease written, `fee` to treasury, `price - fee` to the
 * publisher, nothing left in Marketplace. Spends the buyer's allowance to Marketplace. */
function buy(state: DemoState, slotId: bigint, periodIndex: bigint, creativeId: bigint, maxPrice: bigint, sender: string, now: number): void {
  const terms = termsOf(state, slotId);
  ensure(terms.saleMode !== SALE_CPC, 'cpc mode');
  ensure(terms.leadSeconds > 0, 'no terms');
  ensure(!terms.paused, 'paused');
  const { start, end } = periodWindow(state, slotId, periodIndex);
  if (terms.saleEnd !== 0) ensure(end <= terms.saleEnd, 'beyond sale end');
  const price = currentPrice(terms, start, end, now);
  ensure(price <= maxPrice, 'price exceeds max');
  const fixture = findSlot(state, slotId);
  ensure(fixture, 'erc721: invalid token ID');
  const publisher = fixture.slot.owner;
  checkCreative(state, fixture, terms, creativeId, sender);
  // AdSlot.set_lease
  ensure(end > now, 'period ended');
  ensure(creativeId !== 0n, 'bad lease');
  ensure(!fixture.leases[Number(periodIndex)], 'already leased');
  fixture.leases[Number(periodIndex)] = { lessee: sender, creativeId: creativeId.toString(), price: price.toString() };
  const { fee, publisherAmount } = feeSplit(price, FEE_BPS);
  if (fee > 0n) transferFrom(state, DEMO_CONTRACTS.Marketplace, sender, DEMO_TREASURY, fee);
  if (publisherAmount > 0n) transferFrom(state, DEMO_CONTRACTS.Marketplace, sender, publisher, publisherAmount);
}

function openCampaignsOf(state: DemoState, slotId: bigint | string): number {
  return Object.values(state.campaigns).filter((c) => c.slotId === String(slotId) && !c.closed).length;
}

function setTerms(state: DemoState, args: readonly unknown[], sender: string, now: number): void {
  const [slotId, startPrice, floorPrice, leadSeconds, saleEnd, approvalMode, saleMode, floorCpc] = args;
  const fixture = findSlot(state, big(slotId));
  ensure(fixture && lc(fixture.slot.owner) === lc(sender), 'not owner');
  ensure(num(approvalMode) <= 1 && num(saleMode) <= SALE_CPC, 'bad mode');
  if (num(saleMode) !== SALE_CPC) {
    ensure(big(startPrice) >= big(floorPrice), 'bad prices');
    ensure(big(leadSeconds) > 0n, 'bad lead');
  } else {
    ensure(big(floorCpc) > 0n, 'bad floor cpc');
  }
  const prev = termsOf(state, big(slotId));
  if (prev.saleMode !== SALE_CPC && num(saleMode) === SALE_CPC) {
    ensure(lastLeasedEnd(fixture) <= now, 'leases outstanding');
  }
  if (prev.saleMode === SALE_CPC && num(saleMode) !== SALE_CPC) {
    ensure(openCampaignsOf(state, big(slotId)) === 0, 'campaigns open');
  }
  fixture.slot.terms = {
    startPrice: str(startPrice),
    floorPrice: str(floorPrice),
    leadSeconds: num(leadSeconds),
    saleEnd: num(saleEnd),
    approvalMode: num(approvalMode),
    saleMode: num(saleMode),
    floorCpc: str(floorCpc),
    paused: prev.paused,
  };
}

// ---------------------------------------------------------------------------------------------
// CampaignVault
// ---------------------------------------------------------------------------------------------

function loadCampaign(state: DemoState, campaignId: unknown): DemoCampaign {
  const campaign = state.campaigns[str(campaignId)];
  ensure(campaign, 'no campaign');
  return campaign;
}

function openCampaign(state: DemoState, args: readonly unknown[], sender: string): string {
  const [slotId, creativeId, maxCpc, budget, validFrom, validUntil] = args;
  const terms = termsOf(state, big(slotId));
  if (terms.saleMode !== SALE_CPC) revert(terms.leadSeconds === 0 ? 'no terms' : 'lease mode');
  ensure(!terms.paused, 'paused');
  ensure(big(maxCpc) >= BigInt(terms.floorCpc), 'below floor');
  ensure(big(budget) >= BigInt(terms.floorCpc), 'budget too small');
  if (big(validUntil) !== 0n) ensure(big(validUntil) > big(validFrom), 'bad window');
  const fixture = findSlot(state, big(slotId));
  ensure(fixture, 'erc721: invalid token ID');
  checkCreative(state, fixture, terms, big(creativeId), sender);
  transferFrom(state, DEMO_CONTRACTS.CampaignVault, sender, DEMO_CONTRACTS.CampaignVault, big(budget));
  const campaignId = nextId(Object.keys(state.campaigns));
  state.campaigns[campaignId] = {
    campaignId,
    slotId: str(slotId),
    creativeId: str(creativeId),
    advertiser: sender,
    maxCpc: str(maxCpc),
    remaining: str(budget),
    budget: str(budget),
    paused: false,
    closed: false,
    closeAfter: 0,
    serves: 0,
    settlements: [],
  };
  return campaignId;
}

function topUp(state: DemoState, campaignId: unknown, amount: bigint, sender: string): void {
  const campaign = loadCampaign(state, campaignId);
  ensure(lc(campaign.advertiser) === lc(sender), 'not advertiser');
  ensure(!campaign.closed, 'closed');
  ensure(amount > 0n, 'bad amount');
  transferFrom(state, DEMO_CONTRACTS.CampaignVault, sender, DEMO_CONTRACTS.CampaignVault, amount);
  campaign.remaining = (BigInt(campaign.remaining) + amount).toString();
  // Fixture invariant: budget == remaining + Σcharged.
  campaign.budget = (BigInt(campaign.budget) + amount).toString();
}

// ---------------------------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------------------------

/** Applies one state-changing call as `sender` at `now`. Throws `DemoRevert` on any revert. */
export function applyCall(input: DemoState, call: DemoCall, sender: string, now: number): DemoCallResult {
  const state = structuredClone(input);
  const a = call.args;
  const key = `${call.contract}.${call.functionName}`;
  switch (key) {
    // --- AdSlot ---
    case 'AdSlot.mint_slot': {
      const spec = a[0] as { width: number; height: number; kind: number; domain: string };
      ensure(spec.domain.length > 0, 'empty domain');
      ensure(spec.kind <= SLOT_KIND_OTHER, 'bad kind');
      if (spec.kind === SLOT_KIND_WEB_DISPLAY) ensure(spec.width > 0 && spec.height > 0, 'bad dimensions');
      const slotId = nextId(state.slots.map((s) => s.slot.slotId));
      state.slots.push({
        slot: {
          slotId,
          owner: sender,
          width: spec.width,
          height: spec.height,
          kind: spec.kind,
          domain: spec.domain,
          calendarVersion: 0,
          periodSeconds: null,
          firstPeriodStart: null,
          terms: null,
        },
        leases: {},
      });
      return { state, result: BigInt(slotId) };
    }
    case 'AdSlot.set_calendar': {
      const fixture = findSlot(state, big(a[0]));
      ensure(fixture && lc(fixture.slot.owner) === lc(sender), 'not owner');
      ensure(big(a[1]) >= MIN_PERIOD_SECONDS, 'period too short');
      ensure(lastLeasedEnd(fixture) <= now, 'leases outstanding');
      fixture.slot.calendarVersion += 1;
      fixture.slot.periodSeconds = num(a[1]);
      fixture.slot.firstPeriodStart = num(a[2]);
      // Leases are keyed by calendar version on chain: a new calendar starts with none.
      fixture.leases = {};
      return { state };
    }

    // --- Marketplace ---
    case 'Marketplace.set_terms':
      setTerms(state, a, sender, now);
      return { state };
    case 'Marketplace.set_paused': {
      const fixture = findSlot(state, big(a[0]));
      ensure(fixture && lc(fixture.slot.owner) === lc(sender), 'not owner');
      fixture.slot.terms = { ...termsOf(state, big(a[0])), paused: Boolean(a[1]) };
      return { state };
    }
    case 'Marketplace.buy':
      buy(state, big(a[0]), big(a[1]), big(a[2]), big(a[3]), sender, now);
      return { state };
    case 'Marketplace.buy_with_permit':
      tryPermit(state, sender, DEMO_CONTRACTS.Marketplace, big(a[3]), big(a[4]), now);
      buy(state, big(a[0]), big(a[1]), big(a[2]), big(a[3]), sender, now);
      return { state };

    // --- CreativeRegistry ---
    case 'CreativeRegistry.register_media': {
      const [uri, contentHash, mime, width, height, clickUrl] = a;
      ensure(str(contentHash) !== ZERO_HASH, 'bad hash');
      ensure(str(uri).length > 0, 'bad uri');
      ensure(str(mime).length > 0, 'bad mime');
      ensure(num(width) > 0 && num(height) > 0, 'bad dimensions');
      const creativeId = nextId(Object.keys(state.creatives));
      state.creatives[creativeId] = {
        creativeId,
        advertiser: sender,
        kind: KIND_MEDIA,
        uri: str(uri),
        contentHash: str(contentHash),
        mime: str(mime),
        width: num(width),
        height: num(height),
        clickUrl: str(clickUrl),
        revoked: false,
        verificationStatus: 'pending',
      };
      return { state, result: BigInt(creativeId) };
    }
    case 'CreativeRegistry.register_nft': {
      const [, nftContract, , nftStandard, clickUrl] = a;
      ensure(num(nftStandard) === NFT_ERC721 || num(nftStandard) === NFT_ERC1155, 'bad standard');
      ensure(lc(str(nftContract)) !== ZERO_ADDRESS, 'bad contract');
      // The contract's same-chain ERC-721 `ownerOf` check has no demo NFT to read; skipped.
      const creativeId = nextId(Object.keys(state.creatives));
      state.creatives[creativeId] = {
        creativeId,
        advertiser: sender,
        kind: 1,
        uri: '',
        contentHash: null,
        mime: '',
        width: 0,
        height: 0,
        clickUrl: str(clickUrl),
        revoked: false,
        verificationStatus: 'pending',
      };
      return { state, result: BigInt(creativeId) };
    }
    case 'CreativeRegistry.request_approval': {
      const publisher = str(a[0]);
      const creative = requireCreative(state, big(a[1]));
      ensure(lc(creative.advertiser) === lc(sender), 'not creative owner');
      ensure(!creative.revoked, 'inactive');
      const status = approvalStatus(state, publisher, creative.creativeId);
      ensure(status === STATUS_NONE || status === STATUS_REJECTED, 'bad status');
      setApprovalStatus(state, publisher, creative, STATUS_REQUESTED);
      return { state };
    }
    case 'CreativeRegistry.set_approval': {
      const creative = requireCreative(state, big(a[0]));
      setApprovalStatus(state, sender, creative, a[1] ? STATUS_APPROVED : STATUS_REJECTED);
      return { state };
    }
    case 'CreativeRegistry.set_advertiser_allowed': {
      const publisher = lc(sender);
      const advertiser = lc(str(a[0]));
      const current = (state.ledger.allowedAdvertisers[publisher] ?? []).filter((x) => x !== advertiser);
      state.ledger.allowedAdvertisers[publisher] = a[1] ? [...current, advertiser] : current;
      return { state };
    }

    // --- CampaignVault ---
    case 'CampaignVault.open_campaign':
      return { state, result: BigInt(openCampaign(state, a, sender)) };
    case 'CampaignVault.open_campaign_with_permit':
      tryPermit(state, sender, DEMO_CONTRACTS.CampaignVault, big(a[3]), big(a[6]), now);
      return { state, result: BigInt(openCampaign(state, a, sender)) };
    case 'CampaignVault.top_up':
      topUp(state, a[0], big(a[1]), sender);
      return { state };
    case 'CampaignVault.top_up_with_permit':
      tryPermit(state, sender, DEMO_CONTRACTS.CampaignVault, big(a[1]), big(a[2]), now);
      topUp(state, a[0], big(a[1]), sender);
      return { state };
    case 'CampaignVault.set_paused': {
      const campaign = loadCampaign(state, a[0]);
      ensure(lc(campaign.advertiser) === lc(sender), 'not advertiser');
      ensure(!campaign.closed, 'closed');
      campaign.paused = Boolean(a[1]);
      return { state };
    }
    case 'CampaignVault.request_close': {
      const campaign = loadCampaign(state, a[0]);
      ensure(lc(campaign.advertiser) === lc(sender), 'not advertiser');
      ensure(!campaign.closed, 'closed');
      ensure(campaign.closeAfter === 0, 'closing');
      campaign.closeAfter = now + DEMO_CLOSE_DELAY_SECONDS;
      return { state };
    }
    case 'CampaignVault.finalize_close': {
      const campaign = loadCampaign(state, a[0]);
      ensure(!campaign.closed, 'closed');
      ensure(campaign.closeAfter !== 0, 'not closing');
      ensure(now >= campaign.closeAfter, 'too early');
      const refund = BigInt(campaign.remaining);
      campaign.remaining = '0';
      campaign.closed = true;
      if (refund > 0n) transfer(state, DEMO_CONTRACTS.CampaignVault, campaign.advertiser, refund);
      return { state };
    }
    default:
      return revert(`demo: ${key} is not simulated`);
  }
}
