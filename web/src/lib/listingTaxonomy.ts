// Mirrors `api/src/openad/listing_taxonomy.py` (single source of truth). Kept in sync by hand:
// this is a query-parameter enum, not a `components/schemas` type, so `sync:openapi` does not
// generate it (see that module's docstring).

export interface ListingCategory {
  value: string;
  label: string;
}

export const LISTING_CATEGORIES: readonly ListingCategory[] = [
  { value: 'defi', label: 'DeFi' },
  { value: 'nft', label: 'NFT' },
  { value: 'infrastructure', label: 'Infrastructure' },
  { value: 'developer-tools', label: 'Developer tools' },
  { value: 'wallets', label: 'Wallets' },
  { value: 'layer-2', label: 'Layer 2' },
  { value: 'gaming', label: 'Gaming' },
  { value: 'dao-governance', label: 'DAO governance' },
  { value: 'security', label: 'Security' },
  { value: 'news-media', label: 'News & media' },
  { value: 'education', label: 'Education' },
  { value: 'other', label: 'Other' },
];

export const MAX_LISTING_CATEGORIES = 3;
export const LISTING_SUMMARY_MAX = 140;
export const LISTING_AUDIENCE_MAX = 600;

export function categoryLabel(value: string): string {
  return LISTING_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}
