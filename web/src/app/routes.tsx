import { createBrowserRouter, createHashRouter, type RouteObject } from 'react-router';

import { CampaignsPage } from '../features/advertiser/CampaignsPage';
import { EmbedDemoPage } from '../features/marketing/EmbedDemoPage';
import { WhyPage } from '../features/marketing/WhyPage';
import { DiscoverPage } from '../features/marketplace/DiscoverPage';
import { SlotPage } from '../features/marketplace/SlotPage';
import { SupplyPage } from '../features/publisher/SupplyPage';
import { Layout } from './Layout';
import { routes } from './paths';

export { routes } from './paths';

const routeTable: RouteObject[] = [
  {
    path: '/',
    Component: Layout,
    children: [
      { index: true, Component: DiscoverPage },
      { path: 'slots/:slotId', Component: SlotPage },
      { path: routes.supply.replace(/^\//, ''), Component: SupplyPage },
      { path: routes.campaigns.replace(/^\//, ''), Component: CampaignsPage },
      { path: routes.why.replace(/^\//, ''), Component: WhyPage },
      { path: routes.embedDemo.replace(/^\//, ''), Component: EmbedDemoPage },
    ],
  },
];

/** `VITE_ROUTER=hash` (set by `npm run build:demo`, ADR-0016 hosting amendment) picks a hash
 * router, so `dist-demo` works from a static host with no server-side SPA fallback and from any
 * sub-path. The normal build keeps `createBrowserRouter`. Same route table either way. */
export const router =
  import.meta.env.VITE_ROUTER === 'hash'
    ? createHashRouter(routeTable)
    : createBrowserRouter(routeTable);
