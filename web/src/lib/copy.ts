export const GUIDE_PATHS = [
  '',
  'publisher',
  'publisher/mint-slot',
  'publisher/calendar',
  'publisher/terms',
  'publisher/terms#sale-mode',
  'publisher/approvals',
  'publisher/house-ads-and-embed',
  'publisher/earnings',
  'advertiser',
  'advertiser/creatives',
  'advertiser/approvals',
  'advertiser/buy-a-period',
  'advertiser/cpc-campaigns',
  'advertiser/delivery',
  'marketplace/concepts',
  'marketplace/fees-and-permits',
  'marketplace/faq',
] as const;

export type GuidePath = (typeof GUIDE_PATHS)[number];

export function guideUrl(path: GuidePath | string = ''): string | undefined {
  const raw = import.meta.env.VITE_GUIDE_URL?.trim();
  if (!raw) return undefined;
  const base = raw.replace(/\/$/, '');
  const clean = path.replace(/^\//, '');
  return clean ? `${base}/${clean}` : base;
}

export type FieldHintSpec = {
  tip: string;
  guidePath?: GuidePath;
  /** When true, unit tests forbid the word "auction" in this tip (ADR-0014). */
  cpc?: boolean;
};

export const FIELD_HINTS = {
  domain: {
    tip: 'Host this slot lives on. Immutable after mint. Shown on Discover.',
    guidePath: 'publisher/mint-slot',
  },
  width: {
    tip: 'Creative width in CSS pixels. Advertiser creatives should match.',
    guidePath: 'publisher/mint-slot',
  },
  height: {
    tip: 'Creative height in CSS pixels. Advertiser creatives should match.',
    guidePath: 'publisher/mint-slot',
  },
  kind: {
    tip: 'Placement type (Display, Newsletter, Physical, Other). A label for buyers, not a different contract.',
    guidePath: 'publisher/mint-slot',
  },
  slotId: {
    tip: 'The slot NFT id. Prefills from your latest mint when you have one.',
    guidePath: 'marketplace/concepts',
  },
  periodSeconds: {
    tip: 'Length of each period. 86400 seconds is one day. Periods do not overlap.',
    guidePath: 'publisher/calendar',
  },
  firstStart: {
    tip: 'When period 0 begins. Later periods follow this grid. Replacing a calendar bumps its version.',
    guidePath: 'publisher/calendar',
  },
  saleMode: {
    tip: 'Lease (Dutch) sells one period; first buy wins. CPC funds campaigns that compete at serve — not a period buy.',
    guidePath: 'publisher/terms#sale-mode',
  },
  startPrice: {
    tip: 'Dutch opening price for a period, in USDC. Ignored in CPC mode.',
    guidePath: 'publisher/terms',
  },
  floorPrice: {
    tip: 'Dutch minimum at period start, in USDC. Ignored in CPC mode.',
    guidePath: 'publisher/terms',
  },
  leadSeconds: {
    tip: 'How long before the period the Dutch auction opens. 3600 is one hour.',
    guidePath: 'publisher/terms',
  },
  floorCpc: {
    tip: 'Publisher minimum per payable click. Advertisers cannot go below this. Matching is at serve.',
    guidePath: 'publisher/terms',
    cpc: true,
  },
  approvalMode: {
    tip: 'Required: buy or open campaign needs an approved or allowlisted creative. Waived: any active, non-blocked creative.',
    guidePath: 'publisher/approvals',
  },
  paused: {
    tip: 'Stops new buys and new campaigns on this slot. Existing leases and campaigns stay.',
    guidePath: 'publisher/terms',
  },
  advertiserAllowlist: {
    tip: 'Blanket approval for this advertiser address across your slots.',
    guidePath: 'publisher/approvals',
  },
  houseMediaUrl: {
    tip: 'Fallback image when no lease or campaign is serveable. Stored off-chain.',
    guidePath: 'publisher/house-ads-and-embed',
  },
  houseClickUrl: {
    tip: 'Where a house-ad click goes. House clicks are never payable.',
    guidePath: 'publisher/house-ads-and-embed',
  },
  verifyDomain: {
    tip: 'Off-chain proof you control the slot domain. Badge only — not enforced on-chain.',
    guidePath: 'marketplace/faq',
  },
  pricingSlotId: {
    tip: 'Off-chain Lease start/floor suggestion. Does not write terms for you.',
    guidePath: 'publisher/earnings',
  },
  mediaFile: {
    tip: 'Hashed in your browser; the file is never uploaded here. Raster images only.',
    guidePath: 'advertiser/creatives',
  },
  mediaUri: {
    tip: 'Public URL of the bytes you hashed. OpenAd fetches it later to verify.',
    guidePath: 'advertiser/creatives',
  },
  mime: {
    tip: 'Must match the file. image/png, jpeg, webp, or gif.',
    guidePath: 'advertiser/creatives',
  },
  creativeWidth: {
    tip: 'Should match the slot width in CSS pixels.',
    guidePath: 'advertiser/creatives',
  },
  creativeHeight: {
    tip: 'Should match the slot height in CSS pixels.',
    guidePath: 'advertiser/creatives',
  },
  clickUrl: {
    tip: 'Where a click on this creative should go (http or https).',
    guidePath: 'advertiser/creatives',
  },
  nftChainId: {
    tip: 'Chain id of the NFT you own. Must match this deployment for ownership checks.',
    guidePath: 'advertiser/creatives',
  },
  nftContract: {
    tip: 'NFT contract address.',
    guidePath: 'advertiser/creatives',
  },
  nftTokenId: {
    tip: 'Token id you own (ERC-721 or ERC-1155).',
    guidePath: 'advertiser/creatives',
  },
  nftStandard: {
    tip: 'ERC-721 or ERC-1155.',
    guidePath: 'advertiser/creatives',
  },
  publisherAddress: {
    tip: 'Publisher wallet that will see this in their Supply approvals inbox.',
    guidePath: 'advertiser/approvals',
  },
  creativeId: {
    tip: 'The creative you registered. Starts at 1.',
    guidePath: 'advertiser/creatives',
  },
  campaignSlotId: {
    tip: 'CPC slots only. Buy is hidden on those slots — fund from Campaigns.',
    guidePath: 'advertiser/cpc-campaigns',
    cpc: true,
  },
  campaignCreativeId: {
    tip: 'Creative that will serve if this campaign wins at the floor CPC.',
    guidePath: 'advertiser/cpc-campaigns',
    cpc: true,
  },
  maxCpc: {
    tip: 'Your ceiling per payable click. You pay the minimum needed to win, never above this, never below floor CPC.',
    guidePath: 'advertiser/cpc-campaigns',
    cpc: true,
  },
  campaignBudget: {
    tip: 'USDC escrowed in CampaignVault until payable clicks settle or you close the campaign.',
    guidePath: 'advertiser/cpc-campaigns',
    cpc: true,
  },
  topUpAmount: {
    tip: 'Adds USDC to this campaign remaining. Same permit pattern as open.',
    guidePath: 'advertiser/cpc-campaigns',
    cpc: true,
  },
  buyCreative: {
    tip: 'Creative served for this lease. Must be approved unless the publisher waived approval.',
    guidePath: 'advertiser/buy-a-period',
  },
} as const satisfies Record<string, FieldHintSpec>;

export type FieldHintKey = keyof typeof FIELD_HINTS;

export type WizardStageCopy = {
  title: string;
  description: string;
  whatNext: string;
};

export const WIZARD_COPY = {
  slotSetup: {
    mint: {
      title: 'Mint slot',
      description: 'Create the slot NFT. Domain, size, and kind cannot change later.',
      whatNext: 'Your slot NFT exists. Next, give it a calendar so periods can be leased.',
    },
    calendar: {
      title: 'Calendar',
      description: 'Divide time into fixed periods. This does not make them sellable yet.',
      whatNext: 'Periods exist but are not sellable until you set terms.',
    },
    terms: {
      title: 'Terms',
      description: 'Choose Lease (Dutch) or CPC, prices, and whether creatives need approval.',
      whatNext:
        'The slot can be sold. Lease: the auction opens lead-time before each period; first buy wins.',
    },
    termsCpcWhatNext: 'The slot can be sold. Campaigns compete at serve time at your floor CPC.',
  },
  creativeSetup: {
    registerMedia: {
      title: 'Register media',
      description:
        'Hash the image in your browser, then register the public URI as a media creative. Raster only.',
      whatNext: 'The creative is on-chain. Request approval if the publisher requires it.',
    },
    registerNft: {
      title: 'Register NFT creative',
      description: 'Point at an NFT you own on this chain, plus a click URL.',
      whatNext: 'The creative is on-chain. Request approval if the publisher requires it.',
    },
    requestApproval: {
      title: 'Request approval',
      description: 'Ask a publisher to approve this creative for their slots.',
      whatNext:
        'The publisher sees this in their Supply approvals inbox. You can buy waived slots immediately.',
    },
  },
  openCampaign: {
    slotCreative: {
      title: 'Slot and creative',
      description: 'CPC slots only. Buy is hidden on those slots — this funds a campaign instead.',
      whatNext: 'Next you set max CPC and the USDC budget to escrow.',
    },
    bidBudget: {
      title: 'Max CPC and budget',
      description: 'You pay the minimum needed to win, never above max CPC, never below floor CPC.',
      whatNext: 'USDC will sit in CampaignVault until clicks settle or you close.',
    },
    fund: {
      title: 'Fund with permit',
      description: 'One signature authorizes the exact budget; one transaction funds the campaign.',
      whatNext: 'This is not a period buy. Matching happens at serve.',
    },
  },
  buyPeriod: {
    review: {
      title: 'Review',
      description:
        'Live quote from Marketplace. Price falls from start to floor until the period starts; first buy wins.',
      whatNext: 'Next you pick a creative and see the fee split and permit.',
    },
    cost: {
      title: 'Cost and permit',
      description:
        'You sign a gasless permit for exactly this amount, then one transaction. Marketplace holds nothing after.',
      whatNext: 'Confirm to sign the permit and buy the period.',
    },
    confirm: {
      title: 'Confirm',
      description: 'One USDC permit transaction — fee to treasury, rest to the publisher.',
      whatNext: 'The lease appears after the indexer catches up. It expires at period end.',
    },
  },
} as const;

/** The buy receipt's "when will this show up" note (ROADMAP 6.2 step 35): the indexer lags a real
 * chain, but demo mode applies the write in-process, so the calendar updates immediately. */
export function leaseIndexerNote(demoMode: boolean): string {
  return demoMode
    ? 'It appears on the slot calendar immediately.'
    : 'It appears on the slot calendar once the indexer catches up.';
}
