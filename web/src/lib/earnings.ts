/** Earnings comparison for the `/why` calculator (ROADMAP 6.2 step 10+11).
 *
 * Pure, integer-only, no UI or network imports: everything here is bigint USDC base units, the
 * same convention as `lib/auction.ts`. It compares what a publisher would keep on a typical
 * take-rate network against what OpenAd's `fee_bps` split (`lib/auction.ts` `feeSplit`) leaves
 * them, for the same gross spend. Nothing here reads the chain or the API.
 */
import { FEE_BPS, feeSplit } from './auction';

/** A take-rate preset, each labelled "approx." in the UI: a published, typical range for that
 * category, not a specific network's real rate. */
export interface TakeRatePreset {
  id: string;
  label: string;
  takeBps: number;
}

/** Approximate public ranges (illustrative, not any single named network's figure). */
export const TAKE_RATE_PRESETS = [
  { id: 'display', label: 'Typical display network (approx. 32% take)', takeBps: 3200 },
  { id: 'crypto', label: 'Crypto ad network (approx. 40% take)', takeBps: 4000 },
  { id: 'agency', label: 'Agency-sold direct (approx. 20% take)', takeBps: 2000 },
] as const satisfies readonly TakeRatePreset[];

export interface CompareEarningsInput {
  monthlyImpressions: bigint;
  /** eCPM in USDC base units (micros of a whole USDC, same 6-decimal convention as `parseUsdc`). */
  ecpmMicros: bigint;
  /** The comparison network's take rate, in basis points. */
  networkTakeBps: number;
  /** OpenAd's platform fee, in basis points. Defaults to the protocol default (250 == 2.5%). */
  feeBps?: bigint;
}

export interface CompareEarningsResult {
  /** Gross advertiser spend for the month: `monthlyImpressions * ecpmMicros / 1000`, floored. */
  grossSpend: bigint;
  /** What the publisher would keep on the comparison network: `grossSpend * (10000 - takeBps) / 10000`, floored. */
  networkPublisherPayout: bigint;
  /** What the comparison network keeps: `grossSpend - networkPublisherPayout`. */
  networkFee: bigint;
  /** What the publisher keeps on OpenAd: `feeSplit(grossSpend).publisherAmount`. */
  openAdPublisherPayout: bigint;
  /** OpenAd's platform fee for the same gross spend: `feeSplit(grossSpend).fee`. */
  openAdFee: bigint;
  /** `openAdPublisherPayout - networkPublisherPayout` for one month. */
  monthlyUplift: bigint;
  /** `monthlyUplift * 12`. */
  annualUplift: bigint;
}

/** `gross = impressions * ecpm / 1000`, floored — the same floor-division convention as
 * `lib/auction.ts`'s Dutch/remainder price and fee split. */
function grossFromImpressions(monthlyImpressions: bigint, ecpmMicros: bigint): bigint {
  return (monthlyImpressions * ecpmMicros) / 1000n;
}

/** Compares OpenAd's publisher payout against a network of the given take rate, for the same
 * monthly impressions and eCPM. Every field is exact integer USDC base units; `payout + fee ==
 * gross` holds for both sides. */
export function compareEarnings({
  monthlyImpressions,
  ecpmMicros,
  networkTakeBps,
  feeBps = FEE_BPS,
}: CompareEarningsInput): CompareEarningsResult {
  const grossSpend = grossFromImpressions(monthlyImpressions, ecpmMicros);
  const networkFee = (grossSpend * BigInt(networkTakeBps)) / 10_000n;
  const networkPublisherPayout = grossSpend - networkFee;
  const { fee: openAdFee, publisherAmount: openAdPublisherPayout } = feeSplit(grossSpend, feeBps);
  const monthlyUplift = openAdPublisherPayout - networkPublisherPayout;
  return {
    grossSpend,
    networkPublisherPayout,
    networkFee,
    openAdPublisherPayout,
    openAdFee,
    monthlyUplift,
    annualUplift: monthlyUplift * 12n,
  };
}
