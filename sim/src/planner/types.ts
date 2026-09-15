export type ActionName =
  | 'register_media'
  | 'request_approval'
  | 'buy'
  | 'buy_with_permit'
  | 'set_approval'
  | 'set_terms'
  | 'mint_slot'
  | 'set_house_ad'
  | 'set_paused'
  | 'open_campaign'
  | 'top_up_campaign';

export type PeriodSnap = {
  periodIndex: bigint;
  start: number;
  end: number;
  leased: boolean;
  sellable: boolean;
  reason: string;
  indicativePrice: bigint;
  creativeId: string | null;
};

export type SlotSnap = {
  slotId: bigint;
  owner: string;
  width: number;
  height: number;
  domain: string;
  periodSeconds: number | null;
  firstPeriodStart: number | null;
  terms: {
    startPrice: bigint;
    floorPrice: bigint;
    leadSeconds: number;
    paused: boolean;
    approvalMode: number;
    saleMode: number;
    floorCpc: bigint;
  } | null;
  periods: PeriodSnap[];
};

export type CreativeSnap = {
  creativeId: bigint;
  advertiser: string;
  width: number;
  height: number;
  verificationStatus: string;
};

export type ApprovalSnap = {
  publisher: string;
  creativeId: bigint;
  status: number;
};

export type CampaignSnap = {
  campaignId: bigint;
  advertiser: string;
  slotId: bigint;
  creativeId: bigint;
  maxCpc: bigint;
  remaining: bigint;
  paused: boolean;
  closed: boolean;
};

export type Snapshot = {
  now: number;
  slots: SlotSnap[];
  creatives: CreativeSnap[];
  approvals: ApprovalSnap[];
  campaigns: CampaignSnap[];
};

export type PersonaSnap = {
  id: string;
  address: string;
  role: 'publisher' | 'advertiser';
  lastActionAt: Record<string, number>;
};

export type ChosenAction = {
  personaId: string;
  action: ActionName;
  params: Record<string, string>;
};

export const COOLDOWNS: Partial<Record<ActionName, number>> = {
  buy: 60,
  buy_with_permit: 60,
  register_media: 120,
  mint_slot: 600,
  set_terms: 180,
  set_house_ad: 300,
  request_approval: 45,
  set_approval: 30,
  set_paused: 120,
  open_campaign: 90,
  top_up_campaign: 90,
};

export const WEIGHTS: Record<ActionName, number> = {
  register_media: 15,
  request_approval: 10,
  buy: 30,
  buy_with_permit: 5,
  set_approval: 15,
  set_terms: 8,
  mint_slot: 5,
  set_house_ad: 5,
  set_paused: 2,
  open_campaign: 22,
  top_up_campaign: 6,
};

export const MAX_SIM_SLOTS = 12;
export const LEASED_OPEN_CAP = 0.7;
export const FAMILY_BUY = new Set<ActionName>(['buy', 'buy_with_permit']);
