/** The 6 guided-tour steps (ROADMAP 6.2 step 10+11, demo only). Each step names a route to
 * navigate to and, optionally, a target to highlight — resolved against the live DOM by
 * `Tour.tsx`, never by editing the pages themselves. A step with no target (or whose target is
 * not found on the page) renders as a centred card instead. */
import { routes } from '../../app/paths';
import { DEMO_PERSONAS } from '../fixtures';

export interface TourTarget {
  /** A CSS selector queried with `querySelectorAll`. */
  selector: string;
  /** When set, only an element whose text contains this (case-insensitive) is used; the first
   * match otherwise. */
  text?: string;
}

export interface TourStep {
  id: string;
  route: string;
  /** `null` (not omitted) so every step shares the same shape — `TOUR_STEPS` stays a tuple type
   * TypeScript can index with a literal without every field turning into a scattered union. */
  target: TourTarget | null;
  /** Switches the demo persona before this step is shown, so its target exists on the page. */
  persona: (typeof DEMO_PERSONAS)[keyof typeof DEMO_PERSONAS]['address'] | null;
  title: string;
  body: string;
}

export const TOUR_STEPS = [
  {
    id: 'discover',
    route: routes.discover,
    target: null,
    persona: null,
    title: 'Discover, as the advertiser',
    body: 'This is Discover: every slot a publisher has listed, filterable by placement and auction state. No sign-up, no ad-network approval gate.',
  },
  {
    id: 'slot',
    route: routes.slot('0'),
    target: { selector: 'table' },
    persona: null,
    title: 'The Dutch price is falling',
    body: 'Each period opens at a start price and falls toward a floor until someone buys it. The first buy at or below your max wins the period.',
  },
  {
    id: 'buy',
    route: routes.slot('0'),
    target: { selector: 'button', text: 'Buy' },
    persona: null,
    title: 'Buy the period',
    body: 'One transaction: sign a permit for the quoted price, then buy. The fee goes to the treasury and the rest to the publisher, atomically — Marketplace never holds the USDC.',
  },
  {
    id: 'supply',
    route: routes.supply,
    target: { selector: 'section', text: 'Earnings' },
    persona: DEMO_PERSONAS.publisherNewsletter.address,
    title: 'Switch to the publisher',
    body: 'Now viewing as the publisher who owns that slot. Earnings already reflect every lease and settlement, net of OpenAd’s 2.5% fee.',
  },
  {
    id: 'campaigns',
    route: routes.campaigns,
    target: null,
    persona: DEMO_PERSONAS.advertiserWallet.address,
    title: 'CPC campaigns',
    body: 'CPC slots run on a floor CPC instead of a Dutch auction. Advertisers fund a campaign; matching happens at serve time against payable clicks.',
  },
  {
    id: 'embed',
    route: routes.embedDemo,
    target: null,
    persona: null,
    title: 'Your creative is live',
    body: 'This is the real <open-ad> embed, not a mock-up — the exact element a publisher pastes onto their page, fed by the serve endpoint.',
  },
] as const satisfies readonly TourStep[];

/** Where the tour lands after its last step finishes. */
export const TOUR_FINISH_ROUTE = routes.why;
